'use client';
// packages/features/crud/src/forms/hooks/useEntityForm.ts

/**
 * @fileoverview useEntityForm hook
 * @description Creates a type-safe form instance from an entity definition.
 * Wraps React Hook Form with entity-aware configuration.
 * Handles upload orchestration when formId is provided.
 *
 * Simple pattern:
 * - Edit mode: DB object is the source of truth, auto-save drafts to FormStore
 * - Create mode: empty form, auto-save drafts to FormStore
 * - Drafts restored on mount with dismissible "Discard" toast
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { valibotResolver } from '@hookform/resolvers/valibot';
import { useMemo, useEffect, useRef, createElement } from 'react';
import { useForm } from 'react-hook-form';

import { toast, ToastAction } from '@donotdev/components';
import { BACKEND_GENERATED_FIELD_NAMES, createSchemas } from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

import { useFormStore, useFormStatus, useUploadProgress } from '../../stores';
import { useUploadStore } from '../../stores/UploadStore';
import { checkForBlobUrls, isStorageUrl } from '../../utils/uploadValidation';
import { getFieldsForOperation } from '../utils';
import {
  buildInitialFromRecord,
  buildSchemaDefaults,
} from '../utils/buildInitialValues';

import type {
  UseEntityFormOptions,
  EntityFormReturn,
  InferEntityData,
} from '../types';
import type {
  FieldValues,
  ResolverOptions,
  DefaultValues,
} from 'react-hook-form';

/** Default translation function (module-level for stable reference) */
const defaultT = (key: string): string => key;

/**
 * Deep merge draft values onto base values.
 * Prevents nested objects (e.g. `address: { street }`) from clobbering
 * sibling keys in the base (e.g. `address: { street, city }`).
 * Arrays are replaced wholesale (not merged element-by-element).
 */
function deepMergeDraft(
  base: Record<string, unknown>,
  draft: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(draft)) {
    const baseVal = base[key];
    const draftVal = draft[key];
    if (
      draftVal !== null &&
      typeof draftVal === 'object' &&
      !Array.isArray(draftVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMergeDraft(
        baseVal as Record<string, unknown>,
        draftVal as Record<string, unknown>
      );
    } else {
      result[key] = draftVal;
    }
  }
  return result;
}

/**
 * Recursively replace blob: URL strings with null so drafts
 * never persist unresolvable references.
 * Picture objects with blob URLs are nullified entirely.
 */
function stripBlobUrls(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data.startsWith('blob:') ? null : data;
  if (Array.isArray(data)) {
    const cleaned = data.map(stripBlobUrls).filter((item) => item !== null);
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Picture object — null it out if fullUrl is a blob
    if ('fullUrl' in obj && typeof obj['fullUrl'] === 'string') {
      if (!isStorageUrl(obj['fullUrl'] as string)) return null;
      return obj;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = stripBlobUrls(value);
    }
    return result;
  }
  return data;
}

/**
 * Creates a type-safe form instance from an entity definition.
 *
 * Simple, predictable behavior:
 * - Edit mode: defaultValues (DB object) is used as-is, auto-save to FormStore
 * - Create mode: starts empty, auto-save to FormStore
 * - Draft restored on mount with dismissible toast
 *
 * When formId is provided:
 * - Tracks form status (uploading/validating/submitting)
 * - Orchestrates file uploads before validation
 * - Provides cleanup function for unmount
 *
 * @template E - Entity type from defineEntity()
 * @param entity - Entity definition from defineEntity()
 * @param options - Form configuration options
 * @returns Form instance with React Hook Form API plus entity-aware extensions
 */
export function useEntityForm<E extends AnyEntity>(
  entity: E,
  options: UseEntityFormOptions<E> = {}
): EntityFormReturn<E> {
  const {
    formId,
    operation: operationProp,
    defaultValues,
    viewerRole: viewerRoleProp,
    mode = 'onBlur',
    t: tProp,
    loading = false,
  } = options;

  const t = tProp ?? defaultT;

  // Default viewerRole to 'guest' if not provided (most restrictive)
  const viewerRole = viewerRoleProp ?? 'guest';

  // Determine operation from prop or defaultValues presence
  const operation = operationProp ?? (defaultValues ? 'edit' : 'create');

  // Store selectors for form status (only when formId provided)
  const formStatus = useFormStatus(formId ?? '');
  const uploadProgress = useUploadProgress(formId ?? '');

  // Create schemas for validation
  const schemas = useMemo(() => createSchemas(entity), [entity.name]);

  // Dynamic resolver: edit → update (partial), create → draft or full
  // Single useMemo — resolvers are cheap wrappers, no need to memoize individually
  const dynamicResolver = useMemo(() => {
    const createResolver = valibotResolver(
      schemas.create as Parameters<typeof valibotResolver>[0]
    );
    const draftResolver = valibotResolver(
      schemas.draft as Parameters<typeof valibotResolver>[0]
    );
    const updateResolver = valibotResolver(
      schemas.update as Parameters<typeof valibotResolver>[0]
    );

    return async (
      values: FieldValues,
      context: unknown,
      options: ResolverOptions<FieldValues>
    ) => {
      if (operation === 'edit') {
        return updateResolver(values, context, options);
      }
      const status = values?.status ?? defaultValues?.status ?? 'draft';
      return status === 'draft'
        ? draftResolver(values, context, options)
        : createResolver(values, context, options);
    };
  }, [schemas, operation, defaultValues?.status]);
  // Initial values builders: schema-only for create, schema+record for edit.
  const schemaDefaults = useMemo(() => buildSchemaDefaults(entity), [entity]);

  const recordDefaults = defaultValues as
    | Partial<InferEntityData<E>>
    | undefined;

  const initialValues = useMemo(() => {
    // Defer initialization while data is loading to prevent stale defaultValues
    // from triggering draft restoration against the wrong document ID.
    if (loading) return undefined;

    if (operation === 'edit') {
      return recordDefaults
        ? buildInitialFromRecord(entity, recordDefaults)
        : undefined;
    }

    if (!recordDefaults) {
      return schemaDefaults;
    }

    // Create mode uses schema defaults as base, then applies caller defaults
    // (e.g. status: 'draft' in InquiryForm) as the final override.
    return {
      ...schemaDefaults,
      ...recordDefaults,
    } as Partial<InferEntityData<E>>;
  }, [loading, operation, schemaDefaults, entity, recordDefaults]);

  // Initialize React Hook Form
  // Create mode: defaultValues = schema-based defaults
  // Edit mode: defaultValues are set via reset(initialValues) when record arrives
  const formMethods = useForm({
    defaultValues:
      operation === 'create'
        ? (initialValues as DefaultValues<Record<string, unknown>>)
        : undefined,
    mode,
    resolver: dynamicResolver,
    shouldUnregister: false,
    shouldFocusError: true,
  });

  // Keep a stable ref to form methods for effects that shouldn't re-run on every render
  const formMethodsRef = useRef(formMethods);
  useEffect(() => {
    formMethodsRef.current = formMethods;
  }, [formMethods]);

  // Reset form when defaultValues arrives (for async data loading in edit mode)
  // Track by ID to avoid resetting on every re-render
  const lastResetId = useRef<string | null>(null);
  useEffect(() => {
    if (operation === 'edit' && initialValues) {
      const currentId = (initialValues as { id?: string }).id ?? null;

      // Only reset if this is new data (different ID)
      if (currentId && currentId !== lastResetId.current) {
        formMethodsRef.current.reset(
          initialValues as DefaultValues<Record<string, unknown>>
        );
        lastResetId.current = currentId;
      } else if (!currentId && lastResetId.current === null) {
        // First load without ID - reset once
        formMethodsRef.current.reset(
          initialValues as DefaultValues<Record<string, unknown>>
        );
        lastResetId.current = 'initialized';
      }
    }
  }, [operation, initialValues]);

  // ============================================================================
  // Auto-save (always active, both create and edit)
  // ============================================================================

  // Draft key includes document ID for edit mode to avoid collisions
  const documentId = (defaultValues as { id?: string } | undefined)?.id;
  // Draft key: create uses base key, edit always includes doc ID to avoid collisions.
  // Edit without ID (rare edge case) gets a distinct suffix so it never collides with create.
  const base = `${entity.name.toLowerCase()}-form-draft`;
  const draftKey =
    operation === 'create'
      ? base
      : documentId
        ? `${base}-${documentId}`
        : `${base}-edit`;

  // Load draft on mount (create: immediately, edit: after DB data loaded)
  const hasLoadedDraft = useRef(false);

  // When loading transitions true → false, reset draft guard so it fires
  // against the freshly-loaded data with the correct draftKey.
  const prevLoading = useRef(loading);
  if (prevLoading.current && !loading) {
    hasLoadedDraft.current = false;
  }
  prevLoading.current = loading;
  useEffect(() => {
    if (hasLoadedDraft.current) return;

    const savedDraft = useFormStore.getState().loadDraft(draftKey);

    /** Show "Draft restored" toast with a Discard action */
    const showDraftRestoredToast = (
      originalVals: DefaultValues<Record<string, unknown>> | undefined
    ) => {
      const discardDraft = () => {
        useFormStore.getState().clearDraft(draftKey);
        if (originalVals) {
          formMethodsRef.current.reset(originalVals);
        }
      };
      // ToastFunction's 3rd overload expects ToastPrimitiveProps & ToastOptions
      // which includes Radix Root props we don't need. Cast through unknown.
      (
        toast as unknown as (props: {
          toastType: string;
          title: string;
          description: string;
          action: ReturnType<typeof createElement>;
          duration: number;
        }) => void
      )({
        toastType: 'info',
        title: t('draft.restored', { defaultValue: 'Draft restored' }),
        description: t('draft.restoredDescription', {
          defaultValue: 'Your unsaved changes were recovered',
        }),
        action: createElement(
          ToastAction,
          {
            altText: t('draft.discard', { defaultValue: 'Discard' }),
            onClick: discardDraft,
          },
          t('draft.discard', { defaultValue: 'Discard' })
        ),
        duration: 8000,
      });
    };

    // Create mode: load draft immediately (no defaultValues to wait for)
    if (operation === 'create' && !defaultValues) {
      if (savedDraft) {
        formMethods.reset(
          savedDraft.data as DefaultValues<Record<string, unknown>>
        );
        showDraftRestoredToast(
          schemaDefaults as DefaultValues<Record<string, unknown>>
        );
      }
      hasLoadedDraft.current = true;
      return;
    }

    // Edit mode: wait for DB data to load (initialValues must be set first)
    if (operation === 'edit' && initialValues) {
      if (savedDraft) {
        // Deep merge draft onto DB data so nested objects (e.g. address.city)
        // are preserved when draft only has partial nested updates.
        const merged = deepMergeDraft(initialValues, savedDraft.data);
        formMethods.reset(merged as DefaultValues<Record<string, unknown>>);
        showDraftRestoredToast(
          initialValues as DefaultValues<Record<string, unknown>>
        );
      }
      hasLoadedDraft.current = true;
    }
  }, [
    operation,
    defaultValues,
    draftKey,
    formMethods,
    initialValues,
    t,
    schemaDefaults,
  ]);

  // Auto-save subscription — debounced write to FormStore.
  // Uses form.watch(callback) instead of useWatch() to avoid re-rendering
  // the entire form tree on every keystroke. The callback is a side-effect only.
  const isSubmittingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscription = formMethods.watch((values) => {
      // Skip if submitting or draft hasn't loaded yet
      if (isSubmittingRef.current || !hasLoadedDraft.current) return;

      // Clear existing timeout and debounce by 3 seconds
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        if (!values) return;
        const hasValues = Object.values(values).some(
          (v) => v !== undefined && v !== null && v !== ''
        );
        if (hasValues) {
          const safeDraft = stripBlobUrls(values) as Record<string, unknown>;
          useFormStore
            .getState()
            .saveDraft(draftKey, safeDraft, entity.name, documentId);
        }
      }, 3000);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [formMethods, draftKey, entity.name, documentId]);

  // ============================================================================
  // Upload Orchestration (when formId provided)
  // ============================================================================

  /** AbortController for the current submit lifecycle */
  const submitControllerRef = useRef<AbortController | null>(null);

  /** Mutex to prevent concurrent submissions */
  const isSubmittingMutex = useRef(false);

  /**
   * Upload pending files and validate no blob URLs remain.
   * Called automatically by handleSubmit when formId is provided.
   */
  const uploadPendingFiles = async (
    signal?: AbortSignal
  ): Promise<Record<string, unknown> | null> => {
    if (!formId) return {};

    const uploadStore = useUploadStore.getState();
    const formStore = useFormStore.getState();

    if (!uploadStore.hasPendingUploads(formId)) return {};

    // Start progress sync: poll UploadStore and push to FormStore (5x/sec)
    const progressInterval = setInterval(() => {
      const progress = useUploadStore.getState().getTotalProgress(formId);
      useFormStore.getState().setUploading(formId, progress);
    }, 200);

    try {
      // Set uploading state
      formStore.setUploading(formId, 0);

      // Upload all files (thread AbortSignal for cancellation)
      await uploadStore.uploadAll(formId, signal);

      // Check for abort after upload completes
      if (signal?.aborted) return null;

      // Read results directly from the store (synchronous, no React round-trip)
      return useUploadStore.getState().getResults(formId);
    } catch (error) {
      // Set field-level RHF errors for failed uploads
      const uploadState = useUploadStore.getState();
      const formUploads = uploadState.uploads[formId];
      if (formUploads) {
        Object.entries(formUploads).forEach(([fieldName, fieldState]) => {
          if (fieldState.status === 'error' && fieldState.error) {
            formMethods.setError(
              fieldName as Parameters<typeof formMethods.setError>[0],
              {
                type: 'upload',
                message: fieldState.error,
              }
            );
          }
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : 'File upload failed';
      useFormStore.getState().setError(formId, errorMessage);
      return null;
    } finally {
      clearInterval(progressInterval);
    }
  };

  /**
   * Strip backend-generated fields from data for create operations.
   */
  const stripBackendFields = <D extends Record<string, unknown>>(
    data: D
  ): D => {
    if (operation !== 'create') return data;
    return Object.fromEntries(
      Object.entries(data).filter(
        ([key]) =>
          !BACKEND_GENERATED_FIELD_NAMES.includes(
            key as (typeof BACKEND_GENERATED_FIELD_NAMES)[number]
          )
      )
    ) as D;
  };

  /**
   * Normalize price fields before save: { amount: null, ... } → null.
   * Prevents saving 0€ or a partial price object when the field was never filled.
   */
  const normalizePriceFields = <D extends Record<string, unknown>>(
    e: typeof entity,
    data: D
  ): D => {
    const result = { ...data } as Record<string, unknown>;
    for (const [fieldName, fieldConfig] of Object.entries(e.fields)) {
      if (fieldConfig.type === 'price' && fieldName in result) {
        const val = result[fieldName] as { amount?: number | null } | null | undefined;
        if (val == null || val.amount == null) {
          result[fieldName] = null;
        }
      }
    }
    return result as D;
  };

  /**
   * Scroll to first validation error field.
   */
  const scrollToFirstError = (validationErrors: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    const firstErrorField = Object.keys(validationErrors).find(
      (fieldName) => fieldName !== 'root' && validationErrors[fieldName]
    );

    if (!firstErrorField) return;

    // Try aria-invalid inputs first, then any element with matching name
    // (custom components like address pickers, contact selects, etc.)
    const errorInput = (document.querySelector(
      `input[name="${firstErrorField}"][aria-invalid="true"], textarea[name="${firstErrorField}"][aria-invalid="true"], select[name="${firstErrorField}"][aria-invalid="true"]`
    ) ??
      document.querySelector(
        `[name="${firstErrorField}"]`
      )) as HTMLElement | null;

    if (errorInput) {
      errorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      errorInput.focus();
    }
  };

  // ============================================================================
  // Wrapped handleSubmit with upload orchestration
  // ============================================================================

  const originalHandleSubmit = formMethods.handleSubmit;

  const handleSubmitWithOrchestration = ((onValid, onInvalid) => {
    return async (e?: React.BaseSyntheticEvent) => {
      console.log('[useEntityForm] handleSubmitWithOrchestration invoked', {
        hasEvent: !!e,
        mutex: isSubmittingMutex.current,
        operation,
        formId,
      });
      e?.preventDefault?.();

      // Submit mutex: block concurrent submissions
      if (isSubmittingMutex.current) {
        console.warn('[useEntityForm] BLOCKED by mutex');
        return;
      }

      const formStore = formId ? useFormStore.getState() : null;

      // 1. Validate FIRST — before any loading state.
      //    RHF triggers field-level errors, button stays idle, user fixes and retries.
      console.log('[useEntityForm] calling RHF originalHandleSubmit');
      await originalHandleSubmit(
        async (data, event) => {
          console.log('[useEntityForm] RHF onValid fired', { data });
          // Double-check mutex inside RHF callback (guard against race)
          if (isSubmittingMutex.current) return;
          isSubmittingMutex.current = true;

          // Cancel any previous in-flight submission
          submitControllerRef.current?.abort();
          const controller = new AbortController();
          submitControllerRef.current = controller;

          // Validation passed — NOW we can start the optimistic flow
          isSubmittingRef.current = true;

          try {
            // 2. Upload files if needed (only after validation passes)
            if (formId && formStore) {
              formStore.startSubmit(formId);
            }

            const uploadResults = await uploadPendingFiles(controller.signal);
            if (uploadResults === null) {
              // uploadPendingFiles already sets field-level RHF errors
              // and FormStore error on failure
              return;
            }

            // Check abort after uploads
            if (controller.signal.aborted) return;

            // 3. Submit — optimistic, caller handles rollback on error
            if (formId && formStore) {
              formStore.setSubmitting(formId);
            }

            // Merge validated data with upload results from the store.
            // Upload results are read synchronously from UploadStore — no
            // React state round-trip, no timing dependency on getValues().
            const validatedData = data as Record<string, unknown>;
            const mergedData: Record<string, unknown> = {
              ...validatedData,
              ...uploadResults,
            };
            const strippedData = stripBackendFields(mergedData);
            // Normalize price fields: { amount: null, ... } → null so DB never stores 0€ by default.
            const cleanedData = normalizePriceFields(entity, strippedData);

            // Final gate: reject blob URLs regardless of upload state.
            // Catches draft-restored blobs, standalone mode, and race conditions.
            const blobPaths = checkForBlobUrls(cleanedData);
            if (blobPaths.length > 0) {
              const msg = `Cannot save: blob URLs detected at ${blobPaths.join(', ')}. Re-upload the files.`;
              if (formId && formStore) {
                formStore.setError(formId, msg);
              }
              return;
            }

            if (controller.signal.aborted) return;

            await onValid(cleanedData as InferEntityData<E>, event);

            // Clear draft on success
            useFormStore.getState().clearDraft(draftKey);

            // Reset form state to submitted values so isDirty becomes false.
            // Prevents false "unsaved changes" warning on post-save navigation.
            formMethodsRef.current.reset(
              formMethodsRef.current.getValues() as DefaultValues<
                Record<string, unknown>
              >
            );

            if (formId && formStore) {
              formStore.setSuccess(formId);
            }
          } catch (error) {
            // Server rejected — reset to idle, caller shows the error
            if (formId && formStore) {
              formStore.setError(
                formId,
                error instanceof Error ? error.message : 'Submission failed'
              );
            }
            throw error;
          } finally {
            isSubmittingRef.current = false;
            isSubmittingMutex.current = false;
            if (submitControllerRef.current === controller) {
              submitControllerRef.current = null;
            }
            // Safety net: never leave formStatus in a loading state.
            // Early returns (abort, upload failure) and unexpected throws
            // can skip setSuccess/setError, leaving the button stuck.
            if (formId) {
              const current = useFormStore.getState().forms[formId]?.status;
              if (
                current === 'uploading' ||
                current === 'validating' ||
                current === 'submitting'
              ) {
                useFormStore.getState().reset(formId);
              }
            }
          }
        },
        (validationErrors) => {
          // Validation failed — NEVER silent. Log, toast, scroll.
          const errorFields = Object.keys(validationErrors).filter(
            (k) => k !== 'root' && validationErrors[k]
          );
          console.warn(
            '[useEntityForm] Validation failed:',
            errorFields.length,
            'field(s)',
            validationErrors
          );

          (
            toast as unknown as (props: {
              toastType: string;
              title: string;
              description: string;
              duration: number;
            }) => void
          )({
            toastType: 'error',
            title: t('validation.failed', {
              defaultValue: 'Validation failed',
            }),
            description: t('validation.fixErrorsCount', {
              count: errorFields.length,
              fields: errorFields.join(', '),
              defaultValue: `${errorFields.length} field(s) need attention: ${errorFields.join(', ')}`,
            }),
            duration: 8000,
          });

          scrollToFirstError(validationErrors);
          onInvalid?.(validationErrors);
        }
      )(e);
    };
  }) as typeof originalHandleSubmit;

  // ============================================================================
  // Reset form (clears draft + resets to original values)
  // ============================================================================

  const resetForm = () => {
    useFormStore.getState().clearDraft(draftKey);

    // Reset to original values (or empty for create)
    formMethods.reset(initialValues as DefaultValues<Record<string, unknown>>);
    hasLoadedDraft.current = false;
  };

  // ============================================================================
  // Cleanup function
  // ============================================================================

  const cleanup = () => {
    submitControllerRef.current?.abort();
    if (formId) {
      useFormStore.getState().cleanup(formId);
      useUploadStore.getState().cleanup(formId);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => cleanup, []);

  // ============================================================================
  // Cancel function (abort in-flight uploads + reset state)
  // ============================================================================

  const cancel = () => {
    submitControllerRef.current?.abort();
    if (formId) {
      useUploadStore.getState().abortAll(formId);
      useFormStore.getState().reset(formId);
    }
    isSubmittingMutex.current = false;
  };

  // ============================================================================
  // Field filtering
  // ============================================================================

  // Edit: show all schema fields (not just keys in defaultValues) so fields
  // removed from DB or null still appear with type defaults.
  const fields = getFieldsForOperation(entity, {
    operation,
    viewerRole,
    availableFields: undefined,
  });

  // Track whether the user has interacted with the form (touched or submitted)
  const hasUserInteracted =
    formMethods.formState.isSubmitted ||
    Object.keys(formMethods.formState.touchedFields || {}).length > 0;

  return {
    ...formMethods,
    handleSubmit: handleSubmitWithOrchestration,
    fields,
    operation,
    entity,
    t,
    viewerRole,
    formId,
    formStatus: formId ? formStatus : 'idle',
    uploadProgress: formId ? uploadProgress : 0,
    cleanup,
    cancel,
    // Form state helpers
    isDirty: formMethods.formState.isDirty,
    hasUserInteracted,
    resetForm,
    originalValues: initialValues,
  } as unknown as EntityFormReturn<E>;
}
