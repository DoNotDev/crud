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

import { createDoNotDevStore, generateUUID } from '@donotdev/core';
import type { AnyEntity, BulkAcrossBatch } from '@donotdev/core';

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
  /**
   * What was thrown, kept in memory only (never persisted), so a page can show a
   * detailed error after an optimistic leave returned it to the record.
   */
  errorCause: unknown;
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
  /** Page state kept with the form (useFormDraftState), keyed by slot name */
  extras?: Record<string, unknown>;
}

/**
 * An edit form open on a record, registered by `useEntityForm` while mounted
 * (transient). Child rows of that record (`useChildRows`) join the latest one.
 */
export interface OpenRecordForm {
  /** Unique per mounted form instance */
  formKey: string;
  /** Collection of the edited record */
  collection: string;
  /** Id of the edited record */
  recordId: string;
  /** The form's viewer role (joined rows follow the same entity rules) */
  viewerRole: string;
  /** True while the form's submit is in flight (joined rows are not reconciled meanwhile) */
  submitting: boolean;
  /** Schedules the form's draft autosave (joined edits live in its draft) */
  changed: () => void;
}

/**
 * Unsaved edits of one child list (`useChildRows`): JSON, kept in the form's draft.
 */
export interface ChildRowEdits {
  /** Field values by row id, over the saved row (or the added row) */
  changes: Record<string, Record<string, unknown>>;
  /** New rows, with pre-minted ids (written with them) */
  added: Array<Record<string, unknown> & { id: string }>;
  /** Ids of saved rows to delete */
  removed: string[];
}

/**
 * How a joined child list validates and writes its edits, registered by
 * `useChildRows` (it knows the entity, the parent, the 1:1 extensions and their
 * existing rows). The form calls it at submit with the edits it submits.
 */
export interface ChildRowsWriter {
  /** The child entity (labels of reported fields) */
  entity: AnyEntity;
  /** Entity and unprefixed field of a reported field (`offer.price` → the extension) */
  describe: (field: string) => { entity: AnyEntity; field: string };
  /** Invalid fields of `edits` by row id (fields of extensions prefixed), translated messages */
  errors: (edits: ChildRowEdits) => Record<string, Record<string, string>>;
  /** The `bulkAcross` batches writing `edits` */
  batches: (edits: ChildRowEdits) => BulkAcrossBatch[];
}

/**
 * Form store state interface
 */
export interface FormStoreState {
  /** Form states keyed by formId (transient) */
  forms: Record<string, FormState>;
  /** Draft data keyed by draftKey (persisted) */
  drafts: Record<string, DraftData>;
  /** Edit forms open on a record, in opening order: the last one wins (transient) */
  openRecords: OpenRecordForm[];
  /** Joined child rows' edits keyed by `childRowsKey()` (transient; persisted through the form's draft) */
  childEdits: Record<string, ChildRowEdits>;
  /** Writers of the joined child lists, keyed by `childRowsKey()` (transient) */
  childWriters: Record<string, ChildRowsWriter>;
  /** Joined edits read back from a draft, not parsed yet (`useChildRows` validates them), keyed by `childRowsKey()` */
  childDrafts: Record<string, unknown>;
  /**
   * Ids minted for records a write will insert (a new record, a missing 1:1
   * extension), kept until the write succeeds so repeated writes / retries
   * insert the same ids (transient).
   */
  mintedIds: Record<string, string>;
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
  /** Set error state (cause: what was thrown, in memory only) */
  setError: (formId: string, error: string, cause?: unknown) => void;
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
  /** Save draft data (extras: page state from useFormDraftState) */
  saveDraft: (
    key: string,
    data: Record<string, unknown>,
    entityName: string,
    documentId?: string,
    extras?: Record<string, unknown>
  ) => void;
  /** Load draft data */
  loadDraft: (key: string) => DraftData | null;
  /** Clear a single draft */
  clearDraft: (key: string) => void;
  /** Check if draft exists */
  hasDraft: (key: string) => boolean;
  /** Remove drafts older than maxAgeMs (default: 7 days) */
  clearStaleDrafts: (maxAgeMs?: number) => void;

  // Open records + joined child rows (transient)
  /**
   * Register an open edit form, or update the one with the same `formKey` in
   * place (keeps its opening order).
   */
  openRecord: (form: OpenRecordForm) => void;
  /** Update a registered form (no-op when it is not registered). */
  updateOpenRecord: (
    formKey: string,
    patch: Partial<Pick<OpenRecordForm, 'viewerRole' | 'submitting'>>
  ) => void;
  /** Unregister a form and drop its joined edits (its draft keeps them). */
  closeRecord: (formKey: string) => void;
  /** Set (or clear with `null`) one joined child list's edits. */
  setChildEdits: (key: string, edits: ChildRowEdits | null) => void;
  /** Register (or clear with `null`) one joined child list's writer. */
  setChildWriter: (key: string, writer: ChildRowsWriter | null) => void;
  /** Keep (or clear with `null`) one joined child list's raw draft edits. */
  setChildDraft: (key: string, raw: unknown) => void;
  /** The id minted for `key` (minted on first call, the same until released). */
  mintId: (key: string) => string;
  /** Forget minted ids once their records are written. */
  releaseMintedIds: (keys: readonly string[]) => void;

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
  errorCause: null,
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
  lifecycle: false,

  createStore: (set, get) => {
    // Per-formId timers — cleared in cleanup() to prevent post-unmount side effects
    const successTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** Default watchdog timeout: 45 seconds */
    const WATCHDOG_TIMEOUT = 45_000;

    /** Clear all timers for a given formId */
    const clearAllTimers = (formId: string) => {
      for (const map of [successTimers, watchdogTimers]) {
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
      openRecords: [],
      childEdits: {},
      childWriters: {},
      childDrafts: {},
      mintedIds: {},

      // ===================================================================
      // State Transitions
      // ===================================================================

      startSubmit: (formId: string) => {
        clearAllTimers(formId);
        set((state) => {
          const form = state.forms[formId] || initialFormState;
          return {
            forms: {
              ...state.forms,
              [formId]: {
                ...form,
                status: 'uploading',
                error: null,
                errorCause: null,
                uploadProgress: 0,
              },
            },
          };
        });

        // Start watchdog timer — auto-error if stuck in loading state
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
                errorCause: null,
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

      setError: (formId: string, error: string, cause?: unknown) => {
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
              errorCause: cause ?? null,
            },
          },
        }));
      },

      dismissError: (formId: string) => {
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
        documentId?: string,
        extras?: Record<string, unknown>
      ) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: {
              data,
              savedAt: Date.now(),
              entityName,
              documentId,
              ...(extras ? { extras } : {}),
            },
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
      // Open records + joined child rows (transient)
      // ===================================================================

      openRecord: (form: OpenRecordForm) => {
        set((state) => {
          const index = state.openRecords.findIndex(
            (entry) => entry.formKey === form.formKey
          );
          if (index === -1) {
            return { openRecords: [...state.openRecords, form] };
          }
          const openRecords = [...state.openRecords];
          openRecords[index] = form;
          return { openRecords };
        });
      },

      updateOpenRecord: (formKey, patch) => {
        set((state) => {
          const index = state.openRecords.findIndex(
            (entry) => entry.formKey === formKey
          );
          const current = state.openRecords[index];
          if (!current) return state;
          const next = { ...current, ...patch };
          if (
            next.viewerRole === current.viewerRole &&
            next.submitting === current.submitting
          ) {
            return state;
          }
          const openRecords = [...state.openRecords];
          openRecords[index] = next;
          return { openRecords };
        });
      },

      closeRecord: (formKey: string) => {
        set((state) => {
          const prefix = `${formKey}\u0000`;
          const keep = <V,>(entries: Record<string, V>) =>
            Object.fromEntries(
              Object.entries(entries).filter(([key]) => !key.startsWith(prefix))
            );
          return {
            openRecords: state.openRecords.filter(
              (entry) => entry.formKey !== formKey
            ),
            childEdits: keep(state.childEdits),
            childWriters: keep(state.childWriters),
            childDrafts: keep(state.childDrafts),
          };
        });
      },

      setChildEdits: (key: string, edits: ChildRowEdits | null) => {
        set((state) => {
          if (edits) {
            return { childEdits: { ...state.childEdits, [key]: edits } };
          }
          if (!(key in state.childEdits)) return state;
          const { [key]: _, ...childEdits } = state.childEdits;
          return { childEdits };
        });
      },

      setChildWriter: (key: string, writer: ChildRowsWriter | null) => {
        set((state) => {
          if (writer) {
            return { childWriters: { ...state.childWriters, [key]: writer } };
          }
          if (!(key in state.childWriters)) return state;
          const { [key]: _, ...childWriters } = state.childWriters;
          return { childWriters };
        });
      },

      setChildDraft: (key: string, raw: unknown) => {
        set((state) => {
          if (raw !== null) {
            return { childDrafts: { ...state.childDrafts, [key]: raw } };
          }
          if (!(key in state.childDrafts)) return state;
          const { [key]: _, ...childDrafts } = state.childDrafts;
          return { childDrafts };
        });
      },

      mintId: (key: string) => {
        const existing = get().mintedIds[key];
        if (existing) return existing;
        const id = generateUUID();
        set((state) => ({ mintedIds: { ...state.mintedIds, [key]: id } }));
        return id;
      },

      releaseMintedIds: (keys: readonly string[]) => {
        set((state) => {
          if (!keys.some((key) => key in state.mintedIds)) return state;
          const mintedIds = { ...state.mintedIds };
          for (const key of keys) delete mintedIds[key];
          return { mintedIds };
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
 * What the last submission threw (in memory only), or null.
 * Lets a page show a detailed error, e.g. after an optimistic leave returned to it.
 */
export const useFormErrorCause = (formId: string): unknown =>
  useFormStore((state) => state.forms[formId]?.errorCause ?? null);

/**
 * Key of one joined child list's edits in {@link FormStoreState.childEdits}.
 *
 * @param formKey - The open form's key
 * @param recordId - The parent record id
 * @param collection - The child collection
 * @param field - The child's reference field pointing at the parent
 */
export const childRowsKey = (
  formKey: string,
  recordId: string,
  collection: string,
  field: string
): string => [formKey, recordId, collection, field].join('\u0000');

/**
 * Minted-id key of the 1:1 extension row a write inserts for a record.
 *
 * @param extensionCollection - The extension collection
 * @param recordId - The extended record id
 */
export const extensionMintKey = (
  extensionCollection: string,
  recordId: string
): string => `extension\u0000${extensionCollection}\u0000${recordId}`;

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
