'use client';
// packages/features/crud/src/utils/fileStorage.ts

/**
 * @fileoverview File Storage Utilities
 * @description Handle generic file uploads to storage with progress tracking.
 * Provider-agnostic: uses getProvider('storage'). Consumer must configure a storage
 * provider at app startup via configureProviders({ storage: adapter }).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { handleError, getProvider } from '@donotdev/core';
import type { FileAsset } from '@donotdev/core';

/** Progress callback for upload operations (local definition to avoid static Firebase import) */
type UploadProgressCallback = (progress: {
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
}) => void;

export type { FileAsset };

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
}

export interface UploadFileOptions {
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
 * Upload a file to storage with progress tracking.
 * Uses configured storage provider, or Firebase as default fallback.
 */
export async function uploadFile(
  file: File,
  options: UploadFileOptions = {}
): Promise<FileAsset> {
  const { storagePath, filename, onProgress, signal } = options;

  const timestamp = Date.now();
  const sanitizedName = sanitizeFilename(file.name);
  const finalFilename = filename || `${timestamp}_${sanitizedName}`;
  const fullPath = storagePath
    ? `${storagePath}/${finalFilename}`
    : finalFilename;

  try {
    const result = await getProvider('storage').upload(file, {
      storagePath,
      filename: finalFilename,
      onProgress: onProgress
        ? (pct) =>
            onProgress({ bytesTransferred: 0, totalBytes: 0, progress: pct })
        : undefined,
      signal,
    });
    const url = result.url;

    return {
      url,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw handleError(error, {
      userMessage: 'Failed to upload file',
      severity: 'error',
      context: { filename: file.name, fileSize: file.size },
    });
  }
}

/**
 * Upload multiple files to storage
 */
export async function uploadFiles(
  files: File[],
  options: UploadFileOptions = {}
): Promise<FileAsset[]> {
  const results: FileAsset[] = [];
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedSize = 0;

  for (const file of files) {
    if (options.signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    const fileProgress: UploadProgressCallback | undefined = options.onProgress
      ? (progress) => {
          const currentFileProgress =
            (progress.bytesTransferred / progress.totalBytes) * file.size;
          options.onProgress!({
            bytesTransferred: uploadedSize + currentFileProgress,
            totalBytes: totalSize,
            progress: ((uploadedSize + currentFileProgress) / totalSize) * 100,
          });
        }
      : undefined;

    const result = await uploadFile(file, {
      ...options,
      onProgress: fileProgress,
    });

    results.push(result);
    uploadedSize += file.size;
  }

  return results;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(asset: FileAsset): Promise<void> {
  try {
    await getProvider('storage').delete(asset.url);
  } catch (error) {
    handleError(error, {
      userMessage: 'Failed to delete file',
      severity: 'error',
      context: { url: asset.url, filename: asset.filename },
    });
    throw error;
  }
}

/**
 * Generate a unique file ID
 */
export function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Get file icon based on MIME type or extension
 */
export function getFileIcon(mimeType?: string, filename?: string): string {
  const ext = filename ? getFileExtension(filename) : '';

  // Check MIME type first
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document'))
      return 'doc';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
      return 'xls';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
      return 'ppt';
  }

  // Fallback to extension
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'doc':
    case 'docx':
      return 'doc';
    case 'xls':
    case 'xlsx':
    case 'csv':
      return 'xls';
    case 'ppt':
    case 'pptx':
      return 'ppt';
    case 'md':
    case 'txt':
      return 'text';
    case 'html':
    case 'htm':
      return 'html';
    case 'zip':
    case 'rar':
    case '7z':
      return 'archive';
    default:
      return 'file';
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Document MIME types
 */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
];

/**
 * Document file extensions
 */
export const DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.html',
  '.csv',
];

/**
 * Get accept string for document inputs
 */
export function getDocumentAcceptString(): string {
  return [...DOCUMENT_MIME_TYPES, ...DOCUMENT_EXTENSIONS].join(',');
}
