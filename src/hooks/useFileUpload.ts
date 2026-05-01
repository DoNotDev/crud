'use client';
// packages/features/crud/src/hooks/useFileUpload.ts

/**
 * @fileoverview useFileUpload Hook
 * @description Thin wrapper over UploadStore for file upload components (Image, File, Document).
 * Store is SSOT for per-file state. Hook provides dispatch functions + selector.
 * No useCallback, no useRef, no useState. Plain functions calling getState().
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useRef } from 'react';

import { handleError } from '@donotdev/core';

import type { Picture } from '@donotdev/core';

import { useUploadContext } from '../contexts/UploadContext';
import {
  useUploadStore,
  useFieldFiles,
  generateStandaloneFormId,
} from '../stores/UploadStore';

import type { FileEntry, UploadResult } from '../stores/UploadStore';

/** Backwards-compatible alias */
export type FileMetadata = FileEntry;

export interface UseFileUploadOptions {
  /** Field name for UploadStore registration */
  name: string;
  /** Current value from form (Picture or FileAsset based) */
  value: unknown;
  /** Change handler to update form */
  onChange: (value: unknown) => void;
  /** Allow multiple files */
  multiple?: boolean;
  /** Max number of files (multiple mode) */
  maxFiles?: number;
  /** Max file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Accepted MIME types (e.g., ['image/*'], ['application/pdf']) */
  accept?: string[];
  /** Storage path prefix */
  storagePath?: string;
  /** Upload function - injected to avoid coupling to specific storage */
  uploadFn?: (
    file: File,
    onProgress: (progress: number) => void
  ) => Promise<UploadResult>;
}

// Counter for unique IDs
let fileIdCounter = 0;

/**
 * Generate stable ID from URL or unique random.
 */
function generateStableId(url?: string): string {
  if (url) {
    const filename = url.split('/').pop()?.split('?')[0];
    if (filename) return `file-${filename}`;
  }
  fileIdCounter += 1;
  const timestamp =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const random = Math.random().toString(36).slice(2, 11);
  return `file-${fileIdCounter}-${timestamp}-${random}`;
}

/** Validate file against constraints */
function validateFile(
  file: File,
  accept: string[],
  maxSize: number
): { valid: boolean; error?: string } {
  if (accept.length > 0) {
    const isAccepted = accept.some((pattern) => {
      if (pattern.endsWith('/*')) {
        const type = pattern.slice(0, -2);
        return file.type.startsWith(type);
      }
      return file.type === pattern;
    });
    if (!isAccepted) {
      return { valid: false, error: `File type ${file.type} not accepted` };
    }
  }

  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
    return { valid: false, error: `File exceeds ${maxMB}MB limit` };
  }

  return { valid: true };
}

/**
 * Extract URL signature from a value for comparison.
 * Works with Picture (fullUrl), FileAsset (url), or arrays of either.
 */
function getValueSignature(value: unknown): string | null {
  if (!value) return null;
  const items = Array.isArray(value) ? value : [value];
  const urls = items
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        return (
          (item as Record<string, string>).fullUrl ??
          (item as Record<string, string>).url ??
          ''
        );
      }
      return '';
    })
    .filter(Boolean);
  return urls.length > 0 ? urls.join(',') : null;
}

/**
 * Convert a value (Picture/FileAsset or array) to FileEntry[] for store initialization.
 */
function valueToFileEntries(value: unknown): FileEntry[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item) => {
      if (typeof item !== 'object' || item === null) return false;
      const record = item as Record<string, string>;
      return record.fullUrl || record.url;
    })
    .map((item, index) => {
      const record = item as Record<string, string>;
      const url = record.fullUrl ?? record.url ?? '';
      const thumbUrl = record.thumbUrl ?? url;
      const filename =
        record.filename ?? url.split('/').pop()?.split('?')[0] ?? 'existing';
      return {
        id: `${generateStableId(url)}-existing-${index}`,
        file: new File([], filename),
        previewURL: thumbUrl || url,
        status: 'complete' as const,
        progress: 100,
        uploaded: item as UploadResult,
        error: null,
      };
    });
}

/**
 * Compute the onChange value from file entries.
 * Returns Picture[] / Picture / FileAsset[] / FileAsset / null depending on mode.
 */
function filesToValue(
  files: FileEntry[],
  multiple: boolean,
  isOptimistic: boolean
): unknown {
  const filesToEmit = isOptimistic
    ? files.filter((f) => !f.error)
    : files.filter((f) => f.uploaded && !f.error);

  const results = filesToEmit
    .map((f) => {
      if (f.uploaded) return f.uploaded;
      if (isOptimistic) {
        // Check if this looks like an image field (Picture shape) or file field (FileAsset shape)
        return { fullUrl: f.previewURL, thumbUrl: f.previewURL } as Picture;
      }
      return null;
    })
    .filter((r): r is UploadResult => r !== null);

  if (multiple) {
    return results.length > 0 ? results : null;
  }
  return results[0] ?? null;
}

/**
 * useFileUpload - Thin wrapper over UploadStore
 *
 * Store is SSOT. Hook provides:
 * - Selector (useFieldFiles) for React re-renders
 * - Plain dispatch functions (addFiles, removeFile, reorderFiles)
 * - 4 effects: init, RHF sync, registration, cleanup
 */
export function useFileUpload({
  name,
  value,
  onChange,
  multiple = false,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024,
  accept = [],
  uploadFn,
}: UseFileUploadOptions) {
  const contextFormId = useUploadContext();

  // Standalone mode: generate synthetic formId, cleaned up on unmount
  const standaloneIdRef = useRef<string | null>(null);
  if (!contextFormId && !standaloneIdRef.current) {
    standaloneIdRef.current = generateStandaloneFormId();
  }
  const formId = contextFormId ?? standaloneIdRef.current!;

  // Deferred upload (inside EntityFormRenderer) vs immediate (standalone)
  const shouldDeferUpload = !!contextFormId;

  // Selector: per-file state from store
  const files = useFieldFiles(formId, name);

  // Track last synced value signature to detect external changes
  const lastSyncedSignature = useRef<string | null>(null);

  // ============================================================================
  // Effect 1: Mount/init - populate store from value prop
  // ============================================================================

  useEffect(() => {
    const currentSignature = getValueSignature(value);

    // Skip if we already synced this value (prevents infinite loop)
    if (currentSignature === lastSyncedSignature.current) return;
    lastSyncedSignature.current = currentSignature;

    const entries = valueToFileEntries(value);
    useUploadStore.getState().setFieldFiles(formId, name, entries);
  }, [value, formId, name]);

  // ============================================================================
  // Effect 2: RHF sync - push store changes back to form via onChange
  // When uploaded files change in the store, compute the value and call onChange.
  // ============================================================================

  useEffect(() => {
    // Skip initial render (init effect handles that)
    if (files.length === 0 && !value) return;

    const newValue = filesToValue(files, multiple, shouldDeferUpload);
    const newSignature = getValueSignature(newValue);

    // Only call onChange if value actually changed
    if (newSignature !== lastSyncedSignature.current) {
      lastSyncedSignature.current = newSignature;
      onChange(newValue);

      // Write final results to store for synchronous read by submit flow
      if (contextFormId) {
        const completedValue = filesToValue(files, multiple, false);
        useUploadStore
          .getState()
          .setResult(contextFormId, name, completedValue);
      }
    }
  }, [
    files,
    multiple,
    shouldDeferUpload,
    onChange,
    name,
    contextFormId,
    value,
  ]);

  // ============================================================================
  // Effect 3: Register upload callback with store for deferred upload
  // ============================================================================

  useEffect(() => {
    if (!contextFormId || !name) return;

    const store = useUploadStore.getState();

    store.registerUpload(
      contextFormId,
      name,
      // Upload callback - reads files from getState() directly, no stale closure
      async (_onProgress, signal) => {
        if (!uploadFn) return;
        if (signal?.aborted) return;

        const currentFiles = useUploadStore
          .getState()
          .getFieldFiles(contextFormId, name);
        const pending = currentFiles.filter((f) => f.status !== 'complete');
        if (pending.length === 0) return;

        // Mark all pending as uploading
        for (const f of pending) {
          useUploadStore
            .getState()
            .markFileUploading(contextFormId, name, f.id);
        }

        // Upload all in parallel
        const results = await Promise.allSettled(
          pending.map(async (f) => {
            if (signal?.aborted) throw new Error('Upload cancelled');
            try {
              const result = await uploadFn(f.file, (progress) => {
                useUploadStore
                  .getState()
                  .updateFileProgress(contextFormId, name, f.id, progress);
              });
              useUploadStore
                .getState()
                .updateFileResult(contextFormId, name, f.id, result);
              return { id: f.id, error: null };
            } catch (err) {
              const error =
                err instanceof Error ? err.message : 'Upload failed';
              useUploadStore
                .getState()
                .updateFileError(contextFormId, name, f.id, error);
              return { id: f.id, error };
            }
          })
        );

        // Write results to store for synchronous read by submit flow
        const updatedFiles = useUploadStore
          .getState()
          .getFieldFiles(contextFormId, name);
        const completedValue = filesToValue(updatedFiles, multiple, false);
        useUploadStore
          .getState()
          .setResult(contextFormId, name, completedValue);

        // Throw if any failed (triggers UploadStore retry)
        const failures = results.filter(
          (r) => r.status === 'fulfilled' && r.value.error != null
        );
        if (failures.length > 0) {
          throw new Error(`${failures.length} file(s) failed to upload`);
        }
      },
      // Check pending function
      () => {
        const currentFiles = useUploadStore
          .getState()
          .getFieldFiles(contextFormId, name);
        return currentFiles.some((f) => f.status !== 'complete');
      }
    );

    return () => {
      store.unregisterUpload(contextFormId, name);
    };
  }, [contextFormId, name, uploadFn, multiple]);

  // ============================================================================
  // Effect 4: Cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      const id = contextFormId ?? standaloneIdRef.current;
      if (id) {
        useUploadStore.getState().clearFieldFiles(id, name);
      }
      // Clean up standalone form entirely
      if (standaloneIdRef.current) {
        useUploadStore.getState().cleanup(standaloneIdRef.current);
        standaloneIdRef.current = null;
      }
    };
  }, [contextFormId, name]);

  // ============================================================================
  // Plain dispatch functions (no useCallback - call getState() directly)
  // ============================================================================

  function addFiles(newFiles: File[]) {
    const store = useUploadStore.getState();
    const currentFiles = store.getFieldFiles(formId, name);
    const maxAllowed = multiple ? maxFiles : 1;
    const remainingSlots = maxAllowed - currentFiles.length;

    if (remainingSlots <= 0) {
      handleError(new Error('Maximum files reached'), {
        userMessage: multiple
          ? `Maximum ${maxFiles} files allowed`
          : 'Only one file allowed',
        severity: 'warning',
        showNotification: true,
      });
      return;
    }

    const filesToAdd = newFiles.slice(0, remainingSlots);
    const validEntries: FileEntry[] = [];

    for (const file of filesToAdd) {
      const validation = validateFile(file, accept, maxSize);
      if (!validation.valid) {
        handleError(new Error(validation.error), {
          userMessage: validation.error!,
          severity: 'warning',
          showNotification: true,
        });
        continue;
      }

      validEntries.push({
        id: generateStableId(),
        file,
        previewURL: URL.createObjectURL(file),
        status: 'pending',
        progress: null,
        uploaded: null,
        error: null,
      });
    }

    if (validEntries.length === 0) return;

    if (multiple) {
      store.addFileEntries(formId, name, validEntries);
    } else {
      // Single mode: replace all existing
      const existing = store.getFieldFiles(formId, name);
      existing.forEach((f) => {
        if (f.previewURL.startsWith('blob:')) URL.revokeObjectURL(f.previewURL);
      });
      store.setFieldFiles(formId, name, validEntries);
    }

    // Standalone mode: upload immediately
    if (!shouldDeferUpload && uploadFn) {
      for (const entry of validEntries) {
        uploadFileImmediately(entry);
      }
    }
  }

  function removeFile(id: string) {
    useUploadStore.getState().removeFileEntry(formId, name, id);
  }

  function reorderFiles(orderedIds: string[]) {
    useUploadStore.getState().reorderFileEntries(formId, name, orderedIds);
  }

  // ============================================================================
  // Immediate upload (standalone mode)
  // ============================================================================

  async function uploadFileImmediately(entry: FileEntry) {
    if (!uploadFn) return;

    const store = useUploadStore.getState();
    store.markFileUploading(formId, name, entry.id);

    try {
      const result = await uploadFn(entry.file, (progress) => {
        useUploadStore
          .getState()
          .updateFileProgress(formId, name, entry.id, progress);
      });
      useUploadStore
        .getState()
        .updateFileResult(formId, name, entry.id, result);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Upload failed';
      useUploadStore.getState().updateFileError(formId, name, entry.id, error);
    }
  }

  // ============================================================================
  // Computed state
  // ============================================================================

  const hasPending = files.some((f) => f.status === 'pending');
  const isUploading = files.some((f) => f.status === 'uploading');
  const totalProgress =
    files.length > 0
      ? files.reduce((sum, f) => sum + (f.progress ?? 0), 0) / files.length
      : 0;

  return {
    /** Current files (pending + uploaded) */
    files,
    /** Add new files (from drop/paste/input) */
    addFiles,
    /** Remove a file by ID */
    removeFile,
    /** Reorder files by ID array (for drag-and-drop) */
    reorderFiles,
    /** Whether any files are pending upload */
    hasPending,
    /** Whether upload is in progress */
    isUploading,
    /** Overall progress 0-100 */
    progress: totalProgress,
    /** Form ID (from context or synthetic for standalone) */
    formId,
    /** Whether uploads are deferred (true inside EntityFormRenderer, false standalone) */
    isDeferred: shouldDeferUpload,
  };
}
