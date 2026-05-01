// packages/features/crud/src/utils/imageProcessing.ts

/**
 * @fileoverview Image Processing Utilities
 * @description Client-side image processing for WebP conversion, resizing, and thumbnail generation
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

export interface ProcessedImage {
  fullBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
}

export interface ProcessImageOptions {
  /** Maximum width for full-size image (default: 1920) */
  maxWidth?: number;
  /** Maximum height for full-size image (default: 1440) */
  maxHeight?: number;
  /** Thumbnail width (default: 300) */
  thumbWidth?: number;
  /** Thumbnail height (default: 225) */
  thumbHeight?: number;
  /** Target aspect ratio (default: 4/3) */
  aspectRatio?: number;
  /** WebP quality (0-1, default: 0.85 for full, 0.65 for thumb) */
  quality?: number;
  /** Crop region from react-easy-crop (overrides automatic center crop) */
  crop?: { x: number; y: number; width: number; height: number };
}

/** Cache processed images to avoid re-encoding on upload retries (File -> options hash -> ProcessedImage) */
const processedCache = new WeakMap<File, Map<string, ProcessedImage>>();

function optionsHash(options: ProcessImageOptions): string {
  return JSON.stringify({
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    thumbWidth: options.thumbWidth,
    thumbHeight: options.thumbHeight,
    aspectRatio: options.aspectRatio,
    quality: options.quality,
    crop: options.crop,
  });
}

/**
 * Resize and convert image to WebP with 4:3 aspect ratio
 */
export async function processImage(
  file: File,
  options: ProcessImageOptions = {}
): Promise<ProcessedImage> {
  const hash = optionsHash(options);
  const fileCache = processedCache.get(file);
  if (fileCache?.has(hash)) return fileCache.get(hash)!;

  const {
    maxWidth = 1920,
    maxHeight = 1440,
    thumbWidth = 300,
    thumbHeight = 225,
    aspectRatio = 4 / 3,
    quality = 0.85,
    crop,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    img.onload = async () => {
      try {
        // Calculate dimensions maintaining aspect ratio
        const { width: fullWidth, height: fullHeight } = calculateDimensions(
          crop ? crop.width : img.width,
          crop ? crop.height : img.height,
          maxWidth,
          maxHeight,
          aspectRatio
        );

        // Generate full-size image
        const fullBlob = await resizeToWebP(
          img,
          fullWidth,
          fullHeight,
          aspectRatio,
          quality,
          crop
        );

        // Generate thumbnail (lower quality fine for small sizes)
        const thumbBlob = await resizeToWebP(
          img,
          thumbWidth,
          thumbHeight,
          aspectRatio,
          0.65,
          crop
        );

        const result: ProcessedImage = {
          fullBlob,
          thumbBlob,
          width: fullWidth,
          height: fullHeight,
        };
        let cache = processedCache.get(file);
        if (!cache) {
          cache = new Map();
          processedCache.set(file, cache);
        }
        cache.set(hash, result);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));

    reader.readAsDataURL(file);
  });
}

/**
 * Calculate dimensions maintaining aspect ratio within max bounds
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
  targetAspectRatio: number
): { width: number; height: number } {
  // Calculate to fit within max bounds
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  // Adjust to target aspect ratio (center crop)
  const currentRatio = width / height;

  if (Math.abs(currentRatio - targetAspectRatio) > 0.01) {
    if (currentRatio > targetAspectRatio) {
      // Too wide, adjust height
      height = width / targetAspectRatio;
    } else {
      // Too tall, adjust width
      width = height * targetAspectRatio;
    }
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Resize image to WebP format using Canvas API
 */
async function resizeToWebP(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  aspectRatio: number,
  quality: number,
  crop?: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // White background (WebP supports transparency but most use cases want white)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  let sx: number, sy: number, sWidth: number, sHeight: number;

  if (crop) {
    // Use provided crop coordinates
    sx = crop.x;
    sy = crop.y;
    sWidth = crop.width;
    sHeight = crop.height;
  } else {
    // Calculate source dimensions to maintain aspect ratio
    const sourceRatio = img.width / img.height;
    sWidth = img.width;
    sHeight = img.height;
    sx = 0;
    sy = 0;

    if (sourceRatio > aspectRatio) {
      // Source is wider, crop width
      sWidth = img.height * aspectRatio;
      sx = (img.width - sWidth) / 2;
    } else if (sourceRatio < aspectRatio) {
      // Source is taller, crop height
      sHeight = img.width / aspectRatio;
      sy = (img.height - sHeight) / 2;
    }
  }

  // Draw image
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Validate image file
 */
export function validateImageFile(
  file: File,
  maxSizeBytes?: number
): { valid: boolean; error?: string } {
  // Check if it's an image
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  // Check file size
  if (maxSizeBytes && file.size > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`,
    };
  }

  return { valid: true };
}
