// packages/features/crud/src/utils/imageProcessing.ts

/**
 * @fileoverview Image Processing Utilities
 * @description Client-side image processing for WebP conversion, resizing, and thumbnail generation
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import * as v from 'valibot';

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
  /**
   * Target aspect ratio, center-cropped (default: 4/3). `'original'` keeps the
   * source ratio: full and thumbnail are scaled to fit inside their max boxes,
   * never cropped (editorial / product photography).
   */
  aspectRatio?: number | 'original';
  /** WebP quality of the full-size image (0-1, default: 0.85) */
  quality?: number;
  /** WebP quality of the thumbnail (0-1, default: 0.65) */
  thumbQuality?: number;
  /**
   * Canvas fill behind the image (default: '#FFFFFF'). `'transparent'` keeps the
   * alpha channel of cut-out PNGs (packshots shown on a tinted surface).
   */
  background?: string;
  /** Crop region from react-easy-crop (overrides automatic center crop) */
  crop?: { x: number; y: number; width: number; height: number };
}

const unitInterval = v.pipe(v.number(), v.minValue(0.1), v.maxValue(1));
const pixels = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(16),
  v.maxValue(8192)
);

/**
 * Shape of `options.fieldSpecific.image` on `image` / `images` entity fields:
 * upload processing settings (crop excluded — that is a per-upload UI action).
 *
 * @example
 * ```ts
 * images: {
 *   name: 'images', type: 'images', label: 'fields.images',
 *   options: { fieldSpecific: { storagePath: 'products', image: {
 *     maxWidth: 2400, maxHeight: 2400, thumbWidth: 960, thumbHeight: 960,
 *     aspectRatio: 'original', quality: 0.9, thumbQuality: 0.85, background: 'transparent',
 *   } } },
 * }
 * ```
 */
export const imageProcessingOptionsSchema = v.strictObject({
  maxWidth: v.optional(pixels),
  maxHeight: v.optional(pixels),
  thumbWidth: v.optional(pixels),
  thumbHeight: v.optional(pixels),
  aspectRatio: v.optional(
    v.union([
      v.literal('original'),
      v.pipe(v.number(), v.minValue(0.1), v.maxValue(10)),
    ])
  ),
  quality: v.optional(unitInterval),
  thumbQuality: v.optional(unitInterval),
  background: v.optional(v.pipe(v.string(), v.minLength(1))),
});

/**
 * Reads `fieldSpecific.image` from an entity field. Returns undefined when absent
 * (framework defaults apply); throws on an invalid config so a typo fails loud.
 */
export function readImageProcessingOptions(
  fieldSpecific: unknown
): Omit<ProcessImageOptions, 'crop'> | undefined {
  if (typeof fieldSpecific !== 'object' || fieldSpecific === null)
    return undefined;
  const raw = (fieldSpecific as { image?: unknown }).image;
  if (raw === undefined) return undefined;
  return v.parse(imageProcessingOptionsSchema, raw);
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
    thumbQuality: options.thumbQuality,
    background: options.background,
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
    aspectRatio: aspectOption = 4 / 3,
    quality = 0.85,
    thumbQuality = 0.65,
    background = '#FFFFFF',
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
        const sourceWidth = crop ? crop.width : img.width;
        const sourceHeight = crop ? crop.height : img.height;
        // 'original': keep the source ratio (no crop); otherwise center-crop to the target.
        const keepRatio = aspectOption === 'original';
        const aspectRatio = keepRatio
          ? sourceWidth / sourceHeight
          : aspectOption;

        // Calculate dimensions maintaining aspect ratio
        const { width: fullWidth, height: fullHeight } = calculateDimensions(
          sourceWidth,
          sourceHeight,
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
          background,
          crop
        );

        // Thumbnail: fixed box by default; with 'original', scaled to fit inside the box.
        const thumbSize = keepRatio
          ? calculateDimensions(
              sourceWidth,
              sourceHeight,
              thumbWidth,
              thumbHeight,
              aspectRatio
            )
          : { width: thumbWidth, height: thumbHeight };
        const thumbBlob = await resizeToWebP(
          img,
          thumbSize.width,
          thumbSize.height,
          aspectRatio,
          thumbQuality,
          background,
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
  background: string,
  crop?: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Opaque fill by default (white); 'transparent' keeps the source alpha channel.
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

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
