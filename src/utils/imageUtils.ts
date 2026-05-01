// packages/features/crud/src/utils/imageUtils.ts

/**
 * @fileoverview Image Utility Functions
 * @description Hash generation, FLIP rotation, deduplication, and local preview management
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { Picture } from '@donotdev/core';

/**
 * Generate SHA-256 hash of file for deduplication
 */
export async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create local preview URL from File
 */
export function createPreviewURL(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Cleanup preview URL to prevent memory leaks
 */
export function revokePreviewURL(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rotate image by 90 degrees clockwise
 */
export async function rotateImage90(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'));
        return;
      }
      img.src = e.target.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Swap dimensions for 90° clockwise rotation
      canvas.width = img.height;
      canvas.height = img.width;

      // Rotate 90° clockwise
      // Translate to center of new canvas (swapped dimensions)
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Rotate 90° clockwise (positive rotation)
      ctx.rotate(Math.PI / 2);
      // Draw image centered at origin (before rotation)
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const rotatedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(rotatedFile);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        file.type,
        0.95
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));

    reader.readAsDataURL(file);
  });
}

/**
 * Image metadata for local state management
 */
export interface ImageMetadata {
  /** Unique ID for this image instance */
  id: string;
  /** Original or rotated File object */
  file: File;
  /** Local preview URL (blob:...) */
  previewURL: string;
  /** SHA-256 hash for deduplication */
  hash: string;
  /** Number of 90° rotations applied (0-3) */
  rotation: number;
  /** Upload progress (0-100), null if not uploading */
  uploadProgress: number | null;
  /** Uploaded Picture URLs, null if not uploaded */
  uploaded: Picture | null;
  /** Error message if upload failed */
  error: string | null;
}

/**
 * Action for undo/redo stack
 */
export type ImageAction =
  | { type: 'add'; images: ImageMetadata[] }
  | { type: 'remove'; indices: number[] }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'rotate'; index: number };

/**
 * Undo/redo stack manager
 */
export class UndoRedoManager {
  private undoStack: ImageAction[] = [];
  private redoStack: ImageAction[] = [];
  private maxStackSize = 50;

  push(action: ImageAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
  }

  undo(): ImageAction | null {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
      return action;
    }
    return null;
  }

  redo(): ImageAction | null {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
      return action;
    }
    return null;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/**
 * Check for duplicate files by hash (within current set)
 */
export function findDuplicatesByHash(
  images: ImageMetadata[],
  newHash: string
): ImageMetadata[] {
  return images.filter((img) => img.hash === newHash);
}

/**
 * Generate unique ID for image
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
