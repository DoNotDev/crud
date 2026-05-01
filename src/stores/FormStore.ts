'use client';
// packages/features/crud/src/stores/FormStore.ts

/**
 * @fileoverview Form Store - Form submission state machine + draft persistence
 * @description Zustand store for tracking form submission states with immediate feedback.
 * Provides automatic loading state management without manual props.
 * Persists form drafts via Zustand persist middleware (only drafts, not transient state).
 *
 * **State Machine:**
 * idle → uploading → validating → submitting → success/error → idle
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { createDoNotDevStore } from '@donotdev/core';

/**
 * Form status states
 * Represents the current phase of form submission
 */
export type FormStatus =
  | 'idle'
  | 'uploading'
  | 'validating'
  | 'submitting'
  | 'success'
  | 'error';

/**
 * Individual form state (transient - NOT persisted)
 */
interface FormState {
  status: FormStatus;
  error: string | null;
  uploadProgress: number; // 0-100
  isDirty: boolean; // Whether form has unsaved changes
}

/**
 * Draft data persisted to storage
 */
export interface DraftData {
  data: Record<string, unknown>;
  savedAt: number;
  entityName: string;
  documentId?: string;
}

/**
 * Form store state interface
 */
export interface FormStoreState {
  /** Form states keyed by formId (transient) */
  forms: Record<string, FormState>;
  /** Draft data keyed by draftKey (persisted) */
  drafts: Record<string, DraftData>;
}

/**
 * Form store actions interface
 */
export interface FormStoreActions {
  // State transitions
  /** Start form submission - called immediately on click (before validation) */
  startSubmit: (formId: string) => void;
  /** Set uploading state with progress */
  setUploading: (formId: string, progress: number) => void;
  /** Set validating state */
  setValidating: (formId: string) => void;
  /** Set submitting state (server call in progress) */
  setSubmitting: (formId: string) => void;
  /** Set success state */
  setSuccess: (formId: string) => void;
  /** Set error state */
  setError: (formId: string, error: string) => void;
  /** Dismiss error and reset to idle */
  dismissError: (formId: string) => void;
  /** Reset form to idle state */
  reset: (formId: string) => void;
  /** Clean up form state (on unmount) */
  cleanup: (formId: string) => void;

  // Dirty state management
  /** Set form dirty state */
  setIsDirty: (formId: string, isDirty: boolean) => void;
  /** Check if any form is dirty */
  hasDirtyForms: () => boolean;
  /** Get all dirty form IDs */
  getDirtyFormIds: () => string[];

  // Draft persistence
  /** Save draft data */
  saveDraft: (
    key: string,
    data: Record<string, unknown>,
    entityName: string,
    documentId?: string
  ) => void;
  /** Load draft data */
  loadDraft: (key: string) => DraftData | null;
  /** Clear a single draft */
  clearDraft: (key: string) => void;
  /** Check if draft exists */
  hasDraft: (key: string) => boolean;
  /** Remove drafts older than maxAgeMs (default: 7 days) */
  clearStaleDrafts: (maxAgeMs?: number) => void;

  // Getters
  /** Get form status */
  getStatus: (formId: string) => FormStatus;
  /** Check if form is in any loading state */
  isLoading: (formId: string) => boolean;
  /** Get upload progress */
  getUploadProgress: (formId: string) => number;
  /** Get error message */
  getError: (formId: string) => string | null;
  /** Check if form is dirty */
  getIsDirty: (formId: string) => boolean;
}

const initialFormState: FormState = {
  status: 'idle',
  error: null,
  uploadProgress: 0,
  isDirty: false,
};

/** Default stale draft age: 7 days */
const STALE_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Form store for managing form submission states and draft persistence
 *
 * @example
 * ```tsx
 * const formId = useId();
 * const isLoading = useFormStore((s) => s.isLoading(formId));
 * const status = useFormStore((s) => s.getStatus(formId));
 * ```
 */
export const useFormStore = createDoNotDevStore<
  FormStoreState & FormStoreActions
>({
  name: 'form-store',

  createStore: (set, get) => {
    // Per-formId timers — cleared in cleanup() to prevent post-unmount side effects
    const successTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const errorTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** Default watchdog timeout: 45 seconds */
    const WATCHDOG_TIMEOUT = 45_000;

    /** Clear all timers for a given formId */
    const clearAllTimers = (formId: string) => {
      for (const map of [successTimers, errorTimers, watchdogTimers]) {
        const handle = map.get(formId);
        if (handle !== undefined) {
          clearTimeout(handle);
          map.delete(formId);
        }
      }
    };

    return {
      forms: {},
      drafts: {},

      // ===================================================================
      // State Transitions
      // ===================================================================

      startSubmit: (formId: string) => {
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'uploading',
                error: null,
                uploadProgress: 0,
              },
            },
          };
        });

        // Start watchdog timer — auto-error if stuck in loading state
        const existingWatchdog = watchdogTimers.get(formId);
        if (existingWatchdog !== undefined) clearTimeout(existingWatchdog);
        const handle = setTimeout(() => {
          watchdogTimers.delete(formId);
          const current = get().forms[formId];
          if (
            current &&
            (current.status === 'uploading' ||
              current.status === 'validating' ||
              current.status === 'submitting')
          ) {
            get().setError(formId, 'Operation timed out. Please try again.');
          }
        }, WATCHDOG_TIMEOUT);
        watchdogTimers.set(formId, handle);
      },

      setUploading: (formId: string, progress: number) => {
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'uploading',
                uploadProgress: Math.min(100, Math.max(0, progress)),
              },
            },
          };
        });
      },

      setValidating: (formId: string) => {
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'validating',
                uploadProgress: 100,
              },
            },
          };
        });
      },

      setSubmitting: (formId: string) => {
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'submitting',
              },
            },
          };
        });
      },

      setSuccess: (formId: string) => {
        // Clear watchdog — submission completed
        const existingWatchdog = watchdogTimers.get(formId);
        if (existingWatchdog !== undefined) {
          clearTimeout(existingWatchdog);
          watchdogTimers.delete(formId);
        }

        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'success',
                error: null,
              },
            },
          };
        });

        // Auto-reset to idle after brief success indication.
        // Cancel any previous timer for this formId (e.g. rapid double-submit).
        const existing = successTimers.get(formId);
        if (existing !== undefined) clearTimeout(existing);
        const handle = setTimeout(() => {
          successTimers.delete(formId);
          // Only reset if still in success state (error may have fired since)
          if (get().forms[formId]?.status === 'success') {
            get().reset(formId);
          }
        }, 1500);
        successTimers.set(formId, handle);
      },

      setError: (formId: string, error: string) => {
        // Clear watchdog — submission completed (with error)
        const existingWatchdog = watchdogTimers.get(formId);
        if (existingWatchdog !== undefined) {
          clearTimeout(existingWatchdog);
          watchdogTimers.delete(formId);
        }

        // Cancel any pending success timer (prevents clobbering error with reset)
        const existingSuccess = successTimers.get(formId);
        if (existingSuccess !== undefined) {
          clearTimeout(existingSuccess);
          successTimers.delete(formId);
        }

        console.warn(`[FormStore] ${formId}: ${error}`);

        set((state) => ({
          forms: {
            ...state.forms,
            [formId]: {
              ...(state.forms[formId] || initialFormState),
              status: 'error',
              error,
            },
          },
        }));

        // Auto-dismiss error after 5s (reset to idle so user can retry)
        const existingError = errorTimers.get(formId);
        if (existingError !== undefined) clearTimeout(existingError);
        const handle = setTimeout(() => {
          errorTimers.delete(formId);
          // Only reset if still in error state (user may have retried)
          if (get().forms[formId]?.status === 'error') {
            get().reset(formId);
          }
        }, 5000);
        errorTimers.set(formId, handle);
      },

      dismissError: (formId: string) => {
        const existingError = errorTimers.get(formId);
        if (existingError !== undefined) {
          clearTimeout(existingError);
          errorTimers.delete(formId);
        }
        if (get().forms[formId]?.status === 'error') {
          get().reset(formId);
        }
      },

      reset: (formId: string) => {
        clearAllTimers(formId);
        set((state) => ({
          forms: {
            ...state.forms,
            [formId]: { ...initialFormState },
          },
        }));
      },

      // ===================================================================
      // Dirty State Management
      // ===================================================================

      setIsDirty: (formId: string, isDirty: boolean) => {
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                isDirty,
              },
            },
          };
        });
      },

      hasDirtyForms: () => {
        const forms = get().forms;
        return Object.values(forms).some((form) => form.isDirty);
      },

      getDirtyFormIds: () => {
        const forms = get().forms;
        return Object.entries(forms)
          .filter(([_, form]) => form.isDirty)
          .map(([formId]) => formId);
      },

      cleanup: (formId: string) => {
        // Cancel ALL pending timers so they cannot fire after unmount
        clearAllTimers(formId);
        set((state) => {
          const { [formId]: _, ...remainingForms } = state.forms;
          return { forms: remainingForms };
        });
      },

      // ===================================================================
      // Draft Persistence
      // ===================================================================

      saveDraft: (
        key: string,
        data: Record<string, unknown>,
        entityName: string,
        documentId?: string
      ) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: { data, savedAt: Date.now(), entityName, documentId },
          },
        }));
      },

      loadDraft: (key: string) => {
        return get().drafts[key] ?? null;
      },

      clearDraft: (key: string) => {
        set((state) => {
          const { [key]: _, ...remainingDrafts } = state.drafts;
          return { drafts: remainingDrafts };
        });
      },

      hasDraft: (key: string) => {
        return key in get().drafts;
      },

      clearStaleDrafts: (maxAgeMs: number = STALE_DRAFT_AGE) => {
        const now = Date.now();
        set((state) => {
          const freshDrafts: Record<string, DraftData> = {};
          for (const [key, draft] of Object.entries(state.drafts)) {
            if (now - draft.savedAt < maxAgeMs) {
              freshDrafts[key] = draft;
            }
          }
          return { drafts: freshDrafts };
        });
      },

      // ===================================================================
      // Getters
      // ===================================================================

      getStatus: (formId: string) => {
        return get().forms[formId]?.status ?? 'idle';
      },

      isLoading: (formId: string) => {
        const status = get().forms[formId]?.status ?? 'idle';
        return (
          status === 'uploading' ||
          status === 'validating' ||
          status === 'submitting'
        );
      },

      getUploadProgress: (formId: string) => {
        return get().forms[formId]?.uploadProgress ?? 0;
      },

      getError: (formId: string) => {
        return get().forms[formId]?.error ?? null;
      },

      getIsDirty: (formId: string) => {
        return get().forms[formId]?.isDirty ?? false;
      },
    }; // end return
  }, // end createStore

  persistOptions: {
    name: 'dndev-form-drafts',
    partialize: (state) => ({
      drafts: state.drafts,
    }),
    onRehydrateStorage: () => (state) => {
      // Purge stale drafts on app start
      state?.clearStaleDrafts();
    },
  },
});

// ===================================================================
// Selector Hooks (for convenience)
// ===================================================================

/**
 * Hook to get form status
 */
export const useFormStatus = (formId: string): FormStatus =>
  useFormStore((state) => state.forms[formId]?.status ?? 'idle');

/**
 * Hook to check if form is loading
 */
export const useFormLoading = (formId: string): boolean =>
  useFormStore((state) => {
    const status = state.forms[formId]?.status ?? 'idle';
    return (
      status === 'uploading' ||
      status === 'validating' ||
      status === 'submitting'
    );
  });

/**
 * Hook to get upload progress
 */
export const useUploadProgress = (formId: string): number =>
  useFormStore((state) => state.forms[formId]?.uploadProgress ?? 0);

/**
 * Hook to get form error
 */
export const useFormError = (formId: string): string | null =>
  useFormStore((state) => state.forms[formId]?.error ?? null);

/**
 * Hook to check if form is dirty
 */
export const useFormIsDirty = (formId: string): boolean =>
  useFormStore((state) => state.forms[formId]?.isDirty ?? false);

/**
 * Hook to check if any form is dirty
 */
export const useHasDirtyForms = (): boolean =>
  useFormStore((state) => Object.values(state.forms).some((f) => f.isDirty));

/**
 * Hook to get draft data for a key
 */
export const useFormDraft = (key: string): DraftData | null =>
  useFormStore((state) => state.drafts[key] ?? null);

/**
 * Hook to check if a draft exists
 */
export const useFormHasDraft = (key: string): boolean =>
  useFormStore((state) => key in state.drafts);
