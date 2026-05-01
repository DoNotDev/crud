// packages/features/crud/src/utils/imageStorage.ts

/**
 * @fileoverview Image Storage Utilities
 * @description Handle image uploads to storage with progress tracking, WebP conversion, and thumbnails.
 * Provider-agnostic: uses getProvider('storage'). Consumer must configure a storage
 * provider at app startup via configureProviders({ storage: adapter }).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { handleError, getProvider } from '@donotdev/core';
import type { Picture } from '@donotdev/core';

/** Progress callback for upload operations (local definition to avoid static Firebase import) */
type UploadProgressCallback = (progress: {
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
}) => void;

export type { Picture };

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
}

export interface UploadImageOptions {
  /** Folder path within the storage bucket (optional, uploads to bucket root if omitted) */
  storagePath?: string;
  /** Custom filename (default: timestamp_originalname) */
  filename?: string;
  /** Progress callback */
  onProgress?: UploadProgressCallback;
  /** AbortSignal to cancel the upload */
  signal?: AbortSignal;
}

/**
 * Sanitize filename for storage
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Remove consecutive underscores
    .toLowerCase();
}

/**
 * Upload full and thumbnail images to storage with progress tracking.
 * Uses configured storage provider, or Firebase as default fallback.
 */
export async function uploadImage(
  fullBlob: Blob,
  thumbBlob: Blob,
  originalFilename: string,
  options: UploadImageOptions = {}
): Promise<Picture> {
  const { storagePath, filename, onProgress, signal } = options;

  const timestamp = Date.now();
  const baseName =
    filename || `${timestamp}_${sanitizeFilename(originalFilename)}`;
  const baseNameWithoutExt = baseName.replace(/\.[^/.]+$/, '');

  const fullName = `${baseNameWithoutExt}_full.webp`;
  const thumbName = `${baseNameWithoutExt}_thumb.webp`;
  const fullPath = storagePath ? `${storagePath}/${fullName}` : fullName;
  const thumbPath = storagePath ? `${storagePath}/${thumbName}` : thumbName;

  try {
    const fullFile = new File([fullBlob], `${baseNameWithoutExt}_full.webp`, {
      type: 'image/webp',
    });
    const thumbFile = new File(
      [thumbBlob],
      `${baseNameWithoutExt}_thumb.webp`,
      { type: 'image/webp' }
    );

    let fullUrl: string;
    let thumbUrl: string;

    const storage = getProvider('storage');

    const fullResult = await storage.upload(fullFile, {
      storagePath,
      filename: `${baseNameWithoutExt}_full.webp`,
      onProgress: onProgress
        ? (pct) =>
            onProgress({
              bytesTransferred: 0,
              totalBytes: 0,
              progress: pct * 0.5,
            })
        : undefined,
      signal,
    });
    fullUrl = fullResult.url;

    if (signal?.aborted) {
      try {
        await storage.delete(fullResult.url);
      } catch {
        /* ignore cleanup errors */
      }
      throw new Error('Upload cancelled');
    }

    const thumbResult = await storage.upload(thumbFile, {
      storagePath,
      filename: `${baseNameWithoutExt}_thumb.webp`,
      onProgress: onProgress
        ? (pct) =>
            onProgress({
              bytesTransferred: 0,
              totalBytes: 0,
              progress: 50 + pct * 0.5,
            })
        : undefined,
      signal,
    });
    thumbUrl = thumbResult.url;

    return { fullUrl, thumbUrl };
  } catch (error) {
    // Cleanup on error
    try {
      const s = getProvider('storage');
      await s.delete(fullPath).catch(() => {});
      await s.delete(thumbPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Delete image from storage. Uses configured provider, or Firebase as default fallback.
 */
export async function deleteImage(picture: Picture): Promise<void> {
  try {
    const storage = getProvider('storage');
    const deletions = [storage.delete(picture.fullUrl)];
    if (picture.thumbUrl) deletions.push(storage.delete(picture.thumbUrl));
    await Promise.all(deletions);
  } catch (error) {
    handleError(error, {
      userMessage: 'Failed to delete image',
      severity: 'error',
      context: { fullUrl: picture.fullUrl, thumbUrl: picture.thumbUrl },
    });
    throw error;
  }
}
