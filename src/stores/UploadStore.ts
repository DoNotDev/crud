'use client';
// packages/features/crud/src/stores/UploadStore.ts

/**
 * @fileoverview Upload Store - Per-field upload progress tracking
 * @description Zustand store for tracking file upload progress per field.
 * Replaces FormUploadContext with store-based approach.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { createDoNotDevStore } from '@donotdev/core';

import type { FileAsset, Picture } from '@donotdev/core';

/**
 * Upload status for a single field
 */
export type UploadStatus = 'idle' | 'uploading' | 'complete' | 'error';

/**
 * Per-file upload result type - either an image (Picture) or a generic file (FileAsset)
 */
export type UploadResult = Picture | FileAsset;

/**
 * Status of a single file in the upload queue
 */
export type FileEntryStatus = 'pending' | 'uploading' | 'complete' | 'error';

/**
 * Per-file state entry - SSOT for all file upload state.
 * Stored in UploadStore, consumed by useFileUpload hook via selector.
 */
export interface FileEntry {
  /** Unique ID for React keys and store lookups */
  id: string;
  /** Original File object (placeholder for existing uploads) */
  file: File;
  /** Local preview URL (blob: for new, https: for existing) */
  previewURL: string;
  /** Upload status */
  status: FileEntryStatus;
  /** Upload progress 0-100 (null = not started) */
  progress: number | null;
  /** Uploaded result (null = pending) */
  uploaded: UploadResult | null;
  /** Error message if upload failed */
  error: string | null;
}

/**
 * Individual field upload state
 */
interface FieldUploadState {
  status: UploadStatus;
  progress: number; // 0-100
  error: string | null;
}

/**
 * Upload function signature
 * Called with progress callback and optional abort signal for cancellation
 */
export type UploadFunction = (
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
) => Promise<void>;

/**
 * Check pending function signature
 * Returns true if the upload function has pending files to upload
 */
export type CheckPendingFunction = () => boolean;

/**
 * Upload store state interface
 */
export interface UploadStoreState {
  /** Upload states: formId -> fieldName -> state */
  uploads: Record<string, Record<string, FieldUploadState>>;
  /** Registered upload functions: formId -> fieldName -> uploadFn */
  uploadFunctions: Record<string, Record<string, UploadFunction>>;
  /** Check pending functions: formId -> fieldName -> checkPendingFn */
  checkPendingFunctions: Record<string, Record<string, CheckPendingFunction>>;
  /** Upload results: formId -> fieldName -> final value (e.g. Picture[]) */
  results: Record<string, Record<string, unknown>>;
  /** Retry attempts: formId -> fieldName -> attempts */
  retryAttempts: Record<string, Record<string, number>>;
  /** Active abort controllers: formId -> AbortController */
  abortControllers: Record<string, AbortController>;
  /** Max retries per field (default: 3) */
  maxRetries: number;
  /** Base retry delay in ms (default: 1000) */
  retryDelay: number;
  /** Upload timeout per field in ms (default: 30000) */
  uploadTimeout: number;

  // Per-file state (SSOT for file upload data)
  /** File entries: formId -> fieldName -> files */
  fileEntries: Record<string, Record<string, FileEntry[]>>;
}

/**
 * Upload store actions interface
 */
export interface UploadStoreActions {
  // Registration (replaces FormUploadContext)
  /** Register an upload function for a field */
  registerUpload: (
    formId: string,
    fieldName: string,
    uploadFn: UploadFunction,
    checkPending?: CheckPendingFunction
  ) => void;
  /** Unregister upload function when field unmounts */
  unregisterUpload: (formId: string, fieldName: string) => void;

  // State management
  /** Start upload for a field */
  startUpload: (formId: string, fieldName: string) => void;
  /** Set progress for a field */
  setProgress: (formId: string, fieldName: string, progress: number) => void;
  /** Mark upload as complete */
  completeUpload: (formId: string, fieldName: string) => void;
  /** Mark upload as failed */
  failUpload: (formId: string, fieldName: string, error: string) => void;
  /** Reset upload state for a field */
  resetUpload: (formId: string, fieldName: string) => void;
  /** Reset all uploads for a form */
  resetForm: (formId: string) => void;
  /** Clean up form state (on unmount) */
  cleanup: (formId: string) => void;

  // Results (upload output values, read synchronously by submit flow)
  /** Store the final upload result for a field (e.g. Picture[]) */
  setResult: (formId: string, fieldName: string, value: unknown) => void;
  /** Get all upload results for a form: fieldName → value */
  getResults: (formId: string) => Record<string, unknown>;

  // Batch operations
  /** Upload all registered files for a form */
  uploadAll: (formId: string, signal?: AbortSignal) => Promise<void>;
  /** Abort all in-flight uploads for a form */
  abortAll: (formId: string) => void;
  /** Check if any uploads are pending for a form */
  hasPendingUploads: (formId: string) => boolean;

  // Getters
  /** Get upload status for a field */
  getStatus: (formId: string, fieldName: string) => UploadStatus;
  /** Get upload progress for a field */
  getProgress: (formId: string, fieldName: string) => number;
  /** Get total progress across all fields in a form */
  getTotalProgress: (formId: string) => number;
  /** Check if any field is currently uploading */
  isUploading: (formId: string) => boolean;
  /** Get error for a field */
  getError: (formId: string, fieldName: string) => string | null;

  // Per-file state actions
  /** Add file entries to a field */
  addFileEntries: (
    formId: string,
    fieldName: string,
    entries: FileEntry[]
  ) => void;
  /** Set all file entries for a field (replaces existing) */
  setFieldFiles: (
    formId: string,
    fieldName: string,
    entries: FileEntry[]
  ) => void;
  /** Remove a file entry by ID, revokes blob URL */
  removeFileEntry: (formId: string, fieldName: string, fileId: string) => void;
  /** Reorder file entries by ordered IDs */
  reorderFileEntries: (
    formId: string,
    fieldName: string,
    orderedIds: string[]
  ) => void;
  /** Update upload progress for a single file (throttled externally) */
  updateFileProgress: (
    formId: string,
    fieldName: string,
    fileId: string,
    progress: number
  ) => void;
  /** Set upload result for a single file */
  updateFileResult: (
    formId: string,
    fieldName: string,
    fileId: string,
    result: UploadResult
  ) => void;
  /** Set error for a single file */
  updateFileError: (
    formId: string,
    fieldName: string,
    fileId: string,
    error: string
  ) => void;
  /** Mark a file as uploading */
  markFileUploading: (
    formId: string,
    fieldName: string,
    fileId: string
  ) => void;
  /** Clear all file entries for a field, revokes all blob URLs */
  clearFieldFiles: (formId: string, fieldName: string) => void;
  /** Get file entries for a field (synchronous) */
  getFieldFiles: (formId: string, fieldName: string) => FileEntry[];
}

/** Revoke a blob preview URL to free memory */
function revokePreviewURL(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Progress throttle map: fileId -> last update timestamp.
 * Lives outside store state (not serializable, not needed for selectors).
 */
const progressThrottleMap = new Map<string, number>();
const PROGRESS_THROTTLE_MS = 100;

/** Counter for standalone mode synthetic formIds */
let standaloneCounter = 0;

/** Generate a synthetic formId for standalone mode (no EntityFormRenderer) */
export function generateStandaloneFormId(): string {
  standaloneCounter += 1;
  return `__standalone_${standaloneCounter}`;
}

/** Stable empty array for selector fallback (avoids re-renders) */
const EMPTY_FILES: FileEntry[] = [];

const initialFieldState: FieldUploadState = {
  status: 'idle',
  progress: 0,
  error: null,
};

/**
 * Upload store for managing file upload progress
 *
 * @example
 * ```tsx
 * const formId = useId();
 * const totalProgress = useUploadStore((s) => s.getTotalProgress(formId));
 * const isUploading = useUploadStore((s) => s.isUploading(formId));
 * ```
 */
export const useUploadStore = createDoNotDevStore<
  UploadStoreState & UploadStoreActions
>({
  name: 'upload-store',

  createStore: (set, get) => ({
    uploads: {},
    uploadFunctions: {},
    checkPendingFunctions: {},
    results: {},
    retryAttempts: {},
    abortControllers: {},
    fileEntries: {},
    maxRetries: 3,
    retryDelay: 1000,
    uploadTimeout: 30_000,

    // ===================================================================
    // Registration
    // ===================================================================

    registerUpload: (
      formId: string,
      fieldName: string,
      uploadFn: UploadFunction,
      checkPending?: CheckPendingFunction
    ) => {
      set((state) => ({
        uploadFunctions: {
          ...state.uploadFunctions,
          [formId]: {
            ...(state.uploadFunctions[formId] || {}),
            [fieldName]: uploadFn,
          },
        },
        checkPendingFunctions: {
          ...state.checkPendingFunctions,
          [formId]: {
            ...(state.checkPendingFunctions[formId] || {}),
            [fieldName]: checkPending || (() => false),
          },
        },
      }));
    },

    unregisterUpload: (formId: string, fieldName: string) => {
      set((state) => {
        const formFunctions = state.uploadFunctions[formId];
        const formCheckPending = state.checkPendingFunctions[formId];
        if (!formFunctions) return state;

        const { [fieldName]: _, ...remainingFunctions } = formFunctions;
        const { [fieldName]: __, ...remainingCheckPending } =
          formCheckPending || {};

        // Clean up retry attempts
        const { [fieldName]: ___, ...remainingRetries } =
          state.retryAttempts[formId] || {};

        return {
          uploadFunctions: {
            ...state.uploadFunctions,
            [formId]: remainingFunctions,
          },
          checkPendingFunctions: {
            ...state.checkPendingFunctions,
            [formId]: remainingCheckPending,
          },
          retryAttempts: {
            ...state.retryAttempts,
            [formId]: remainingRetries,
          },
        };
      });
    },

    // ===================================================================
    // State Management
    // ===================================================================

    startUpload: (formId: string, fieldName: string) => {
      set((state) => ({
        uploads: {
          ...state.uploads,
          [formId]: {
            ...(state.uploads[formId] || {}),
            [fieldName]: {
              status: 'uploading',
              progress: 0,
              error: null,
            },
          },
        },
      }));
    },

    setProgress: (formId: string, fieldName: string, progress: number) => {
      set((state) => {
        const field = state.uploads[formId]?.[fieldName] || initialFieldState;
        return {
          uploads: {
            ...state.uploads,
            [formId]: {
              ...(state.uploads[formId] || {}),
              [fieldName]: {
                ...field,
                progress: Math.min(100, Math.max(0, progress)),
              },
            },
          },
        };
      });
    },

    completeUpload: (formId: string, fieldName: string) => {
      set((state) => {
        const field = state.uploads[formId]?.[fieldName] || initialFieldState;
        return {
          uploads: {
            ...state.uploads,
            [formId]: {
              ...(state.uploads[formId] || {}),
              [fieldName]: {
                ...field,
                status: 'complete',
                progress: 100,
              },
            },
          },
        };
      });
    },

    failUpload: (formId: string, fieldName: string, error: string) => {
      set((state) => {
        const field = state.uploads[formId]?.[fieldName] || initialFieldState;
        return {
          uploads: {
            ...state.uploads,
            [formId]: {
              ...(state.uploads[formId] || {}),
              [fieldName]: {
                ...field,
                status: 'error',
                error,
              },
            },
          },
        };
      });
    },

    resetUpload: (formId: string, fieldName: string) => {
      set((state) => ({
        uploads: {
          ...state.uploads,
          [formId]: {
            ...(state.uploads[formId] || {}),
            [fieldName]: { ...initialFieldState },
          },
        },
      }));
    },

    resetForm: (formId: string) => {
      // Revoke blob URLs before clearing
      const formFiles = get().fileEntries[formId];
      if (formFiles) {
        Object.values(formFiles).forEach((fieldFiles) => {
          fieldFiles.forEach((f) => revokePreviewURL(f.previewURL));
        });
      }

      set((state) => ({
        uploads: {
          ...state.uploads,
          [formId]: {},
        },
        results: {
          ...state.results,
          [formId]: {},
        },
        fileEntries: {
          ...state.fileEntries,
          [formId]: {},
        },
      }));
    },

    cleanup: (formId: string) => {
      set((state) => {
        // Abort any in-flight uploads
        const controller = state.abortControllers[formId];
        if (controller) controller.abort();

        // Revoke blob URLs for all file entries in this form
        const formFiles = state.fileEntries[formId];
        if (formFiles) {
          Object.values(formFiles).forEach((fieldFiles) => {
            fieldFiles.forEach((f) => revokePreviewURL(f.previewURL));
          });
        }

        const { [formId]: _uploads, ...remainingUploads } = state.uploads;
        const { [formId]: _functions, ...remainingFunctions } =
          state.uploadFunctions;
        const { [formId]: _checkPending, ...remainingCheckPending } =
          state.checkPendingFunctions;
        const { [formId]: _results, ...remainingResults } = state.results;
        const { [formId]: _retries, ...remainingRetries } = state.retryAttempts;
        const { [formId]: _controllers, ...remainingControllers } =
          state.abortControllers;
        const { [formId]: _fileEntries, ...remainingFileEntries } =
          state.fileEntries;
        return {
          uploads: remainingUploads,
          uploadFunctions: remainingFunctions,
          checkPendingFunctions: remainingCheckPending,
          results: remainingResults,
          retryAttempts: remainingRetries,
          abortControllers: remainingControllers,
          fileEntries: remainingFileEntries,
        };
      });
    },

    // ===================================================================
    // Results (synchronous read path for submit flow)
    // ===================================================================

    setResult: (formId: string, fieldName: string, value: unknown) => {
      set((state) => ({
        results: {
          ...state.results,
          [formId]: {
            ...(state.results[formId] || {}),
            [fieldName]: value,
          },
        },
      }));
    },

    getResults: (formId: string) => {
      return get().results[formId] || {};
    },

    // ===================================================================
    // Batch Operations
    // ===================================================================

    uploadAll: async (formId: string, externalSignal?: AbortSignal) => {
      const state = get();
      const formFunctions = state.uploadFunctions[formId];
      if (!formFunctions) return;

      // Snapshot entries at call-time so parallel uploads share the same list.
      // Reading uploadFunctions[formId] inside the loop would be a stale snapshot
      // because other fields may have mutated the store by the time each retry runs.
      const entries = Object.entries(formFunctions);
      if (entries.length === 0) return;

      // Create internal controller, link to external signal
      const controller = new AbortController();
      if (externalSignal?.aborted) {
        controller.abort();
        return;
      }
      externalSignal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });

      // Store controller for abortAll
      set((s) => ({
        abortControllers: { ...s.abortControllers, [formId]: controller },
      }));

      // Helper: Retry upload with exponential backoff.
      // `attempt` tracks the current attempt number (1-based).
      // Retry counts are read fresh from the store (via get()) on each failure so
      // parallel uploads cannot observe each other's stale counter snapshot.
      const retryUpload = async (
        fieldName: string,
        uploadFn: UploadFunction,
        attempt = 1,
        signal?: AbortSignal
      ): Promise<void> => {
        // Check abort before starting
        if (signal?.aborted) {
          get().failUpload(formId, fieldName, 'Upload cancelled');
          return;
        }

        get().startUpload(formId, fieldName);
        try {
          // Wrap with per-field timeout
          const timeout = get().uploadTimeout;
          await Promise.race([
            uploadFn((progress) => {
              get().setProgress(formId, fieldName, progress);
            }, signal),
            new Promise<never>((_, reject) => {
              const timer = setTimeout(
                () => reject(new Error('Upload timed out')),
                timeout
              );
              // Clean up timer if signal aborts first
              signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new Error('Upload cancelled'));
                },
                { once: true }
              );
            }),
          ]);
          get().completeUpload(formId, fieldName);
          // Reset retry attempts on success
          set((s) => ({
            retryAttempts: {
              ...s.retryAttempts,
              [formId]: {
                ...(s.retryAttempts[formId] || {}),
                [fieldName]: 0,
              },
            },
          }));
        } catch (error) {
          // If aborted, don't retry
          if (signal?.aborted) {
            get().failUpload(formId, fieldName, 'Upload cancelled');
            return;
          }

          const errorMessage =
            error instanceof Error ? error.message : 'Upload failed';

          // Read maxRetries and current attempt count fresh to avoid stale closure
          const maxRetries = get().maxRetries;
          const currentAttempts = get().retryAttempts[formId]?.[fieldName] ?? 0;

          if (currentAttempts < maxRetries) {
            // Increment retry counter atomically so parallel fields don't clobber each other
            set((s) => ({
              retryAttempts: {
                ...s.retryAttempts,
                [formId]: {
                  ...(s.retryAttempts[formId] || {}),
                  [fieldName]: (s.retryAttempts[formId]?.[fieldName] ?? 0) + 1,
                },
              },
            }));

            // Exponential backoff: delay = retryDelay * 2^(attempt-1)
            const delay = get().retryDelay * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));

            // Check abort again before retry
            if (signal?.aborted) {
              get().failUpload(formId, fieldName, 'Upload cancelled');
              return;
            }

            // Retry
            return retryUpload(fieldName, uploadFn, attempt + 1, signal);
          } else {
            // Max retries reached, fail permanently
            get().failUpload(formId, fieldName, errorMessage);
            throw error;
          }
        }
      };

      try {
        // Upload all in parallel with retry logic
        await Promise.all(
          entries.map(async ([fieldName, uploadFn]) => {
            await retryUpload(fieldName, uploadFn, 1, controller.signal);
          })
        );
      } finally {
        // Clean up controller
        set((s) => {
          const { [formId]: _, ...remaining } = s.abortControllers;
          return { abortControllers: remaining };
        });
      }
    },

    abortAll: (formId: string) => {
      const controller = get().abortControllers[formId];
      if (controller) {
        controller.abort();
      }
      // Mark all uploading fields as failed
      const formUploads = get().uploads[formId];
      if (formUploads) {
        Object.entries(formUploads).forEach(([fieldName, field]) => {
          if (field.status === 'uploading') {
            get().failUpload(formId, fieldName, 'Upload cancelled');
          }
        });
      }
    },

    hasPendingUploads: (formId: string) => {
      const state = get();
      const formFunctions = state.uploadFunctions[formId];
      const formCheckPending = state.checkPendingFunctions[formId];

      if (!formFunctions) return false;

      // Check each field to see if it actually has pending files
      return Object.entries(formFunctions).some(([fieldName, _uploadFn]) => {
        const checkPending = formCheckPending?.[fieldName];
        // If checkPending function exists, use it; otherwise assume pending if function is registered
        return checkPending ? checkPending() : true;
      });
    },

    // ===================================================================
    // Getters
    // ===================================================================

    getStatus: (formId: string, fieldName: string) => {
      return get().uploads[formId]?.[fieldName]?.status ?? 'idle';
    },

    getProgress: (formId: string, fieldName: string) => {
      return get().uploads[formId]?.[fieldName]?.progress ?? 0;
    },

    getTotalProgress: (formId: string) => {
      const formUploads = get().uploads[formId];
      if (!formUploads) return 100; // No uploads = complete

      const fields = Object.values(formUploads);
      if (fields.length === 0) return 100;

      const total = fields.reduce((sum, field) => sum + field.progress, 0);
      return Math.round(total / fields.length);
    },

    isUploading: (formId: string) => {
      const formUploads = get().uploads[formId];
      if (!formUploads) return false;

      return Object.values(formUploads).some(
        (field) => field.status === 'uploading'
      );
    },

    getError: (formId: string, fieldName: string) => {
      return get().uploads[formId]?.[fieldName]?.error ?? null;
    },

    // ===================================================================
    // Per-File State Actions
    // ===================================================================

    addFileEntries: (
      formId: string,
      fieldName: string,
      entries: FileEntry[]
    ) => {
      set((state) => {
        const existing = state.fileEntries[formId]?.[fieldName] ?? [];
        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: [...existing, ...entries],
            },
          },
        };
      });
    },

    setFieldFiles: (
      formId: string,
      fieldName: string,
      entries: FileEntry[]
    ) => {
      set((state) => ({
        fileEntries: {
          ...state.fileEntries,
          [formId]: {
            ...(state.fileEntries[formId] || {}),
            [fieldName]: entries,
          },
        },
      }));
    },

    removeFileEntry: (formId: string, fieldName: string, fileId: string) => {
      const files = get().fileEntries[formId]?.[fieldName];
      if (!files) return;

      const file = files.find((f) => f.id === fileId);
      if (file) revokePreviewURL(file.previewURL);

      set((state) => ({
        fileEntries: {
          ...state.fileEntries,
          [formId]: {
            ...(state.fileEntries[formId] || {}),
            [fieldName]: (state.fileEntries[formId]?.[fieldName] ?? []).filter(
              (f) => f.id !== fileId
            ),
          },
        },
      }));
    },

    reorderFileEntries: (
      formId: string,
      fieldName: string,
      orderedIds: string[]
    ) => {
      set((state) => {
        const files = state.fileEntries[formId]?.[fieldName];
        if (!files) return state;

        const fileMap = new Map(files.map((f) => [f.id, f]));
        const reordered = orderedIds
          .map((id) => fileMap.get(id))
          .filter((f): f is FileEntry => f != null);

        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: reordered,
            },
          },
        };
      });
    },

    updateFileProgress: (
      formId: string,
      fieldName: string,
      fileId: string,
      progress: number
    ) => {
      // Throttle: skip updates within PROGRESS_THROTTLE_MS, always write 100%
      const now = Date.now();
      const lastUpdate = progressThrottleMap.get(fileId) ?? 0;
      if (progress < 100 && now - lastUpdate < PROGRESS_THROTTLE_MS) return;
      progressThrottleMap.set(fileId, now);
      if (progress >= 100) progressThrottleMap.delete(fileId);

      set((state) => {
        const files = state.fileEntries[formId]?.[fieldName];
        if (!files) return state;

        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: files.map((f) =>
                f.id === fileId
                  ? { ...f, progress: Math.min(100, Math.max(0, progress)) }
                  : f
              ),
            },
          },
        };
      });
    },

    updateFileResult: (
      formId: string,
      fieldName: string,
      fileId: string,
      result: UploadResult
    ) => {
      set((state) => {
        const files = state.fileEntries[formId]?.[fieldName];
        if (!files) return state;

        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: files.map((f) =>
                f.id === fileId
                  ? {
                      ...f,
                      uploaded: result,
                      status: 'complete' as const,
                      progress: 100,
                      error: null,
                    }
                  : f
              ),
            },
          },
        };
      });
    },

    updateFileError: (
      formId: string,
      fieldName: string,
      fileId: string,
      error: string
    ) => {
      set((state) => {
        const files = state.fileEntries[formId]?.[fieldName];
        if (!files) return state;

        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: files.map((f) =>
                f.id === fileId
                  ? { ...f, error, status: 'error' as const, progress: null }
                  : f
              ),
            },
          },
        };
      });
    },

    markFileUploading: (formId: string, fieldName: string, fileId: string) => {
      set((state) => {
        const files = state.fileEntries[formId]?.[fieldName];
        if (!files) return state;

        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: {
              ...(state.fileEntries[formId] || {}),
              [fieldName]: files.map((f) =>
                f.id === fileId
                  ? {
                      ...f,
                      status: 'uploading' as const,
                      progress: 0,
                      error: null,
                    }
                  : f
              ),
            },
          },
        };
      });
    },

    clearFieldFiles: (formId: string, fieldName: string) => {
      const files = get().fileEntries[formId]?.[fieldName];
      if (files) {
        files.forEach((f) => revokePreviewURL(f.previewURL));
      }

      set((state) => {
        const formEntries = state.fileEntries[formId];
        if (!formEntries) return state;

        const { [fieldName]: _, ...remainingFields } = formEntries;
        return {
          fileEntries: {
            ...state.fileEntries,
            [formId]: remainingFields,
          },
        };
      });
    },

    getFieldFiles: (formId: string, fieldName: string) => {
      return get().fileEntries[formId]?.[fieldName] ?? EMPTY_FILES;
    },
  }),
});

// ===================================================================
// Selector Hooks (for convenience)
// ===================================================================

/**
 * Hook to get total upload progress for a form
 */
export const useTotalProgress = (formId: string): number =>
  useUploadStore((state) => {
    const formUploads = state.uploads[formId];
    if (!formUploads) return 100;

    const fields = Object.values(formUploads);
    if (fields.length === 0) return 100;

    const total = fields.reduce((sum, field) => sum + field.progress, 0);
    return Math.round(total / fields.length);
  });

/**
 * Hook to check if any field is currently uploading
 */
export const useIsUploading = (formId: string): boolean =>
  useUploadStore((state) => {
    const formUploads = state.uploads[formId];
    if (!formUploads) return false;

    return Object.values(formUploads).some(
      (field) => field.status === 'uploading'
    );
  });

/**
 * Hook to get upload progress for a specific field
 */
export const useFieldProgress = (formId: string, fieldName: string): number =>
  useUploadStore((state) => state.uploads[formId]?.[fieldName]?.progress ?? 0);

/**
 * Hook to get upload status for a specific field
 */
export const useFieldUploadStatus = (
  formId: string,
  fieldName: string
): UploadStatus =>
  useUploadStore(
    (state) => state.uploads[formId]?.[fieldName]?.status ?? 'idle'
  );

/**
 * Hook to get per-file entries for a specific field.
 * Returns the stored array reference directly (stable when unchanged).
 * Falls back to EMPTY_FILES constant to avoid re-renders.
 */
export const useFieldFiles = (formId: string, fieldName: string): FileEntry[] =>
  useUploadStore(
    (state) => state.fileEntries[formId]?.[fieldName] ?? EMPTY_FILES
  );
