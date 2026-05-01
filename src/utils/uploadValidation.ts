'use client';
// packages/features/crud/src/utils/uploadValidation.ts

/**
 * @fileoverview Upload Validation Utilities
 * @description Type-safe validation utilities to ensure no blob URLs reach the database.
 * Provides security checks for Picture objects and form data validation.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { Picture } from '@donotdev/core';

/**
 * Check if a URL is a valid storage URL (not a blob URL)
 * @param url - URL to check
 * @returns true if URL is a storage URL (https://), false if blob URL or invalid
 */
export function isStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('https://') && !url.startsWith('blob:');
}

/**
 * Validate that a Picture object has valid storage URLs.
 * `thumbUrl` is optional — only validated when present (W9: false positive fix).
 * @param picture - Picture object to validate
 * @returns true if fullUrl is a valid storage URL (and thumbUrl, when present, is also valid)
 */
export function validatePicture(picture: Picture): boolean {
  if (!picture || typeof picture !== 'object') return false;
  if (!isStorageUrl(picture.fullUrl)) return false;
  // thumbUrl is optional — only validate it when it is a non-empty string
  if (picture.thumbUrl && !isStorageUrl(picture.thumbUrl)) return false;
  return true;
}

/**
 * Recursively check for blob URLs in form data
 * Returns array of paths where blob URLs were found
 * @param data - Data to check (can be nested object/array)
 * @param path - Current path in the data structure (for error messages)
 * @returns Array of paths where blob URLs were found
 */
export function checkForBlobUrls(data: unknown, path = ''): string[] {
  const blobUrls: string[] = [];

  if (data === null || data === undefined) {
    return blobUrls;
  }

  if (typeof data === 'string') {
    // Check if it's a blob URL
    if (data.startsWith('blob:')) {
      blobUrls.push(path || 'root');
    }
    return blobUrls;
  }

  if (typeof data !== 'object') {
    return blobUrls;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      const itemPath = path ? `${path}[${index}]` : `[${index}]`;
      blobUrls.push(...checkForBlobUrls(item, itemPath));
    });
  } else {
    // At this point data is a non-null, non-array object.
    // Cast to Record<string, unknown> for safe property access.
    const obj = data as Record<string, unknown>;

    // Check if it's a Picture object
    if (obj['fullUrl'] !== undefined && obj['thumbUrl'] !== undefined) {
      const fullUrl = obj['fullUrl'];
      const thumbUrl = obj['thumbUrl'];
      const fullUrlInvalid =
        typeof fullUrl === 'string' && !isStorageUrl(fullUrl);
      const thumbUrlInvalid =
        thumbUrl && typeof thumbUrl === 'string' && !isStorageUrl(thumbUrl);
      if (fullUrlInvalid || thumbUrlInvalid) {
        const errorPath = path || 'root';
        blobUrls.push(
          `${errorPath}.fullUrl or ${errorPath}.thumbUrl contains blob URL`
        );
      }
    } else {
      // Recursively check nested objects
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        blobUrls.push(...checkForBlobUrls(value, newPath));
      });
    }
  }

  return blobUrls;
}

/**
 * Check if form data contains any blob URLs
 * @param data - Form data to check
 * @returns true if any blob URLs found, false otherwise
 */
export function hasBlobUrls(data: unknown): boolean {
  return checkForBlobUrls(data).length > 0;
}
