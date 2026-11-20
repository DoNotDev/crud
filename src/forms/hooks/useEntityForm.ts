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
 * - Create mode: schema/caller defaults, auto-save drafts to FormStore
 * - Drafts restored on mount with dismissible "Discard" toast
 * - Edit mode: registers the open record in FormStore; child rows of that record
 *   (`useChildRows`) join the form, live in its draft and are written by its Save
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  useMemo,
  useEffect,
  useId,
  useRef,
  useState,
  createElement,
} from 'react';
import { useForm } from 'react-hook-form';
import type {
  DefaultValues,
  Path,
  PathValue,
  Resolver,
  ResolverOptions,
  SubmitErrorHandler,
  SubmitHandler,
} from 'react-hook-form';

import { toast, ToastAction } from '@donotdev/components';
import { createSchemas, statusOf, useTranslation } from '@donotdev/core';
import type {
  AnyEntity,
  BulkAcrossBatch,
  BulkAcrossResult,
  EntityExtensions,
  FieldOperation,
  FormValues,
  InferEntityRow,
} from '@donotdev/core';

import {
  childRowsKey,
  extensionMintKey,
  useFormStore,
  useFormStatus,
  useUploadProgress,
} from '../../stores';
import type { ChildRowEdits, ChildRowsWriter } from '../../stores';
import { useExtensionRows } from '../../hooks/useExtensionRows';
import { getCrudServiceInstance } from '../../useCrud';
import {
  hasChildEdits,
  mergeBatches,
  pickFields,
  rebaseChildEdits,
  schemasOf,
  writableFields,
} from '../childRows';
import {
  extensionFields,
  extensionWritable,
  extensionsSignature,
  resolveExtensions,
  setAtPath,
  splitExtensionField,
  withoutLinkField,
} from '../extend';
import type { ResolvedExtension } from '../extend';
import { useFormNavigation } from '../FormNavigation';
import type { FormDraftSlot, FormDraftStateRegistry } from './useFormDraftState';
import { getLoadedUploadStore } from '../../stores/uploadStoreRef';
import { checkForBlobUrls, isStorageUrl } from '../../utils/uploadValidation';
import type {
  UseEntityFormOptions,
  EntityFormHandleSubmit,
  EntityFormReturn,
  EntityFormState,
  EntityFormSubmitOptions,
} from '../types';
import { injectScope } from '../../utils/scopeUtils';
import { getFieldsForOperation, translateFieldLabel } from '../utils';
import { createConditionAwareResolver, getFormConditionStates } from '../utils/conditionAwareResolver';
import {
  buildInitialFromRecord,
  buildSchemaDefaults,
} from '../utils/buildInitialValues';

/** Draft extras key of the joined child rows' edits: `{ [collection]: { [field]: edits } }`. */
const CHILD_ROWS_EXTRA = '@childRows';

/** Draft extras key of the stored row the edit started from (`form.record`). */
const RECORD_EXTRA = '@record';

/** Unprefixed field names of an extension's prefixed set. */
const unprefixed = (names: ReadonlySet<string>): Set<string> =>
  new Set([...names].map((name) => splitExtensionField(name)?.[1] ?? name));

/** Field names the form writes for an extension (unprefixed: its values live under its key). */
const extensionStateFields = (
  ext: ResolvedExtension,
  viewerRole: string,
  operation: 'create' | 'edit'
): Set<string> => unprefixed(extensionWritable(ext, viewerRole, operation));

/** One child list joined to this form. */
interface JoinedRows {
  /** FormStore `childEdits` key */
  key: string;
  /** The child collection (from the key) */
  collection: string;
  /** The child's field pointing at this record (from the key) */
  field: string;
  /** How it validates and writes (registered by its useChildRows) */
  writer: ChildRowsWriter;
  /** Its unsaved edits */
  edits: ChildRowEdits;
}

/** Plain object read back from storage. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A stored row's version: its `updatedAt` (technical field of every entity). */
function baseVersion(row: unknown): unknown {
  return isRecord(row) ? row.updatedAt : undefined;
}

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
      if (!isStorageUrl(obj['fullUrl'])) return null;
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
 * Automatically binds translations to `[entity.namespace, 'crud']`, including
 * language changes and the SSR request language. No `t` option is needed for
 * normal framework usage; each entity form resolves its own namespace.
 * Pass `options.t` only to override the default namespace resolution with your
 * own translator. It replaces the default translator, rather than extending it.
 * Pass the returned `form.t` to every FormFieldRenderer / DisplayFieldRenderer,
 * including nested field-array fields. Do not duplicate entity labels in page locales.
 * The viewer role is not inferred: pass the actual `viewerRole` (default: guest).
 * Prefer EntityFormRenderer from @donotdev/ui when no custom layout is needed.
 *
 * Simple, predictable behavior:
 * - Edit mode: defaultValues (DB object) is accepted as-is and becomes `form.record`;
 *   auto-save to FormStore
 * - Create mode: schema/caller defaults, auto-save to FormStore
 * - Draft restored on mount with dismissible toast (with the `form.record` it was
 *   saved with, so a concurrency token read from it stays the draft's base version)
 *
 * Form state, local draft and payload hold only the fields the form writes
 * (entity descriptor, design 3.4): inputs editable for the viewer and operation,
 * `editable: 'computed'` fields (shown read-only, written), their i18n companions,
 * and `id` on edit. Generated, technical, `editable: false` and role-denied fields
 * never enter them: read them from `form.record`. `handleSubmit(onValid)` passes
 * `onValid` the resolver's output (`FormValues<E, Op, X>`; the extensions' values
 * under their keys).
 *
 * When formId is provided:
 * - Tracks form status (uploading/validating/submitting)
 * - Orchestrates file uploads before validation
 * - Provides cleanup function for unmount
 *
 * On a valid submit the page leaves for `successPath` (default: the previous
 * breadcrumb) before the server answers, and returns on rejection. Pass
 * `successPath: null` to stay.
 *
 * `handleSubmit()` without `onValid` uses the default writer: the record
 * (update, or add on create) with the fields the form writes, plus the child
 * rows joined to this form (`useChildRows` / a nested `EntityList`), in one
 * `bulkAcross`. With `onValid`, write the joined rows from `form.pendingWrites()`
 * (the submit fails explicitly when joined rows have edits and it was not read).
 *
 * @template E - Entity type from defineEntity()
 * @template Op - Form operation (`options.operation`; both when not given)
 * @template X - 1:1 extensions (`options.extend`), none by default
 * @param entity - Entity definition from defineEntity()
 * @param options - Form configuration options
 * @returns Form instance with React Hook Form API plus entity-aware extensions
 *
 * @example
 * ```tsx
 * const viewerRole = useAuth('userRole');
 * const form = useEntityForm(productEntity, {
 *   formId: 'product-create',
 *   operation: 'create',
 *   viewerRole,
 * });
 * // In the custom layout, for each editable field from form.fields:
 * // <FormFieldRenderer name={field.name} config={field.config}
 * //   control={form.control} t={form.t} />
 * ```
 */
export function useEntityForm<
  E extends AnyEntity,
  Op extends FieldOperation = FieldOperation,
  const X extends EntityExtensions = Record<never, never>,
>(
  entity: E,
  options: UseEntityFormOptions<E, Op, X> = {}
): EntityFormReturn<E, Op, X> {
  // Submitted values (`onValid`) are keyed by Op; form state covers both operations
  type Values = FormValues<E, Op, X>;
  type State = EntityFormState<E, X>;
  type FormDefaults = DefaultValues<State>;
  const {
    formId,
    operation: operationProp,
    defaultValues,
    viewerRole: viewerRoleProp,
    mode = 'onBlur',
    t: tProp,
    loading: loadingProp = false,
    successPath,
    extend,
  } = options;
  const navigation = useFormNavigation();

  // Default viewerRole to 'guest' if not provided (most restrictive)
  const viewerRole = viewerRoleProp ?? 'guest';

  // 1:1 extensions (`extend`): fields prefixed `key.`, read and written with the record.
  const extendSignature = extensionsSignature(extend);
  const extensions = useMemo(
    () => resolveExtensions(entity, extend, viewerRole).filter((ext) => ext.readable),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: `extend` is usually an object literal; its signature identifies it
    [entity, extendSignature, viewerRole]
  );

  const { t: entityT } = useTranslation([
    entity.namespace,
    'crud',
    ...extensions.map((ext) => ext.entity.namespace),
  ]);
  const t = tProp ?? entityT;

  // Determine operation from prop or defaultValues presence
  const operation = operationProp ?? (defaultValues ? 'edit' : 'create');

  // The extension rows of the edited record (one read per extension).
  const recordIdProp = (defaultValues as { id?: string } | undefined)?.id;
  const extensionRows = useExtensionRows(
    extensions,
    operation === 'edit' && recordIdProp ? [recordIdProp] : [],
    !loadingProp
  );
  const extensionRowOf = (key: string) =>
    recordIdProp ? extensionRows[key]?.byRecord.get(recordIdProp) : undefined;
  /** An extension is updated when its row exists, else inserted. */
  const extensionOperation = (key: string): 'create' | 'edit' =>
    operation === 'edit' && extensionRowOf(key) ? 'edit' : 'create';
  const extensionRowList = extensions.map((ext) => extensionRowOf(ext.key));
  const extensionState = extensions
    .map((ext) => `${ext.key}:${extensionOperation(ext.key)}`)
    .join('|');
  // Initialization waits for the extension rows like for the record.
  const loading =
    loadingProp || Object.values(extensionRows).some((rows) => rows.loading);

  // Store selectors for form status (only when formId provided)
  const formStatus = useFormStatus(formId ?? '');
  const uploadProgress = useUploadProgress(formId ?? '');

  // why: on edit, defaultValues is the stored row (EntityFormDefaultValues); read as a plain record
  const recordDefaults = defaultValues as Record<string, unknown> | undefined;
  // Status the form starts from: the stored row's (edit) or the caller's default
  // (create); a status the viewer may not edit is not in form state. The resolver
  // and the default writer's bulkAcross both read it (same write schema).
  const baseStatus = statusOf(recordDefaults);
  // Fields the form writes (form state, local draft, default writer payload).
  const ownWritten = useMemo(
    () => writableFields(entity, viewerRole, operation),
    [entity, viewerRole, operation]
  );

  const dynamicResolver = useMemo((): Resolver<State, unknown, Values> => {
    const resolver = createConditionAwareResolver<State, Values>(
      entity,
      operation,
      ownWritten,
      recordDefaults
    );
    const own: Resolver<State, unknown, Values> = (values, context, resolverOptions) => resolver(
      operation === 'edit' ? values : injectScope(values, entity.scope),
      context,
      resolverOptions
    );
    if (extensions.length === 0) return own;
    // Each extension validates its own values (`values[key]`, link field excluded:
    // the record sets it), errors nested under the key like its field names.
    const extensionResolvers = extensions.map((ext) => ({
      key: ext.key,
      resolve: createConditionAwareResolver<Record<string, unknown>>(
        withoutLinkField(ext),
        extensionOperation(ext.key),
        extensionStateFields(ext, viewerRole, extensionOperation(ext.key))
      ),
    }));
    return async (values, context, resolverOptions) => {
      const result = await own(values, context, resolverOptions);
      const errors: Record<string, unknown> = { ...result.errors };
      const merged: Record<string, unknown> = { ...result.values };
      // The extension validates all its fields: `names` lists the record form's paths.
      const extensionOptions: ResolverOptions<Record<string, unknown>> = {
        criteriaMode: resolverOptions.criteriaMode,
        fields: resolverOptions.fields,
        shouldUseNativeValidation: resolverOptions.shouldUseNativeValidation,
      };
      for (const { key, resolve } of extensionResolvers) {
        const raw = (values as Record<string, unknown>)[key];
        const extResult = await resolve(isRecord(raw) ? raw : {}, context, extensionOptions);
        if (Object.keys(extResult.errors).length > 0) errors[key] = extResult.errors;
        else merged[key] = extResult.values;
      }
      // why: RHF's resolver result is a union keyed by the form's T; the record's and
      // the extensions' results are merged under their own keys of that same T
      return (Object.keys(errors).length > 0
        ? { values: {}, errors }
        : { values: merged, errors: {} }) as Awaited<ReturnType<Resolver<State, unknown, Values>>>;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: extensionOperation is derived from extensionState, listed
  }, [entity, operation, ownWritten, recordDefaults, extensions, extensionState, viewerRole]);
  // Initial values builders: schema-only for create, schema+record for edit,
  // projected onto the fields the form writes.
  const schemaDefaults = useMemo(
    () => buildSchemaDefaults(entity, ownWritten),
    [entity, ownWritten]
  );

  const initialValues = useMemo((): Record<string, unknown> | undefined => {
    // Defer initialization while data is loading to prevent stale defaultValues
    // from triggering draft restoration against the wrong document ID.
    if (loading) return undefined;

    const own = (() => {
      if (operation === 'edit') {
        return recordDefaults
          ? buildInitialFromRecord(entity, recordDefaults, {
              fields: ownWritten,
              keepId: true,
            })
          : undefined;
      }

      if (!recordDefaults) {
        return schemaDefaults;
      }

      // Create mode uses schema defaults as base, then applies caller defaults
      // (e.g. status: 'draft' in InquiryForm) as the final override, written fields only.
      return pickFields({ ...schemaDefaults, ...recordDefaults }, ownWritten);
    })();
    if (!own || extensions.length === 0) return own;
    // Extensions under their key: the stored row, or its schema defaults when missing,
    // projected onto the extension fields the form writes.
    const withExtensions: Record<string, unknown> = { ...own };
    extensions.forEach((ext, index) => {
      const extRow = extensionRowList[index];
      const extFields = extensionStateFields(ext, viewerRole, extRow ? 'edit' : 'create');
      withExtensions[ext.key] = extRow
        ? buildInitialFromRecord(ext.entity, extRow, { fields: extFields, keepId: true })
        : buildSchemaDefaults(ext.entity, extFields);
    });
    return withExtensions;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: extensionRowList holds the extension rows (stable references)
  }, [loading, operation, schemaDefaults, entity, recordDefaults, ownWritten, viewerRole, extensions, ...extensionRowList]);

  // form.record: the stored row the edit started from (extension rows under their
  // key), replaced by the one a restored draft was saved with.
  const storedRecord = useMemo((): InferEntityRow<E> | undefined => {
    if (operation !== 'edit' || loading || !recordDefaults) return undefined;
    const withExtensions: Record<string, unknown> = { ...recordDefaults };
    extensions.forEach((ext, index) => {
      const extRow = extensionRowList[index];
      if (extRow) withExtensions[ext.key] = extRow;
    });
    // why: the stored row as read (defaultValues on edit), plus its extension rows under their keys
    return withExtensions as InferEntityRow<E>;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: extensionRowList holds the extension rows (stable references)
  }, [operation, loading, recordDefaults, extensions, ...extensionRowList]);
  const [restoredRecord, setRestoredRecord] = useState<InferEntityRow<E> | null>(null);
  const record = restoredRecord ?? storedRecord;
  const recordRef = useRef(record);
  recordRef.current = record;

  /**
   * Values projected onto what the form writes (own written fields, `id` on edit,
   * each extension's written fields under its key, with its row id when it exists):
   * nothing else enters form state
   * or the local draft (a restored draft from an older page version included).
   */
  const projectState = (values: Record<string, unknown>): Record<string, unknown> => {
    const projected = pickFields(values, ownWritten);
    if (operation === 'edit' && Object.hasOwn(values, 'id')) projected.id = values.id;
    for (const ext of extensions) {
      const raw = values[ext.key];
      if (!isRecord(raw)) continue;
      const extOperation = extensionOperation(ext.key);
      const extValues = pickFields(raw, extensionStateFields(ext, viewerRole, extOperation));
      // An existing extension row is validated as an update (its id included).
      if (extOperation === 'edit' && Object.hasOwn(raw, 'id')) extValues.id = raw.id;
      projected[ext.key] = extValues;
    }
    return projected;
  };

  // Initialize React Hook Form
  // Create mode: defaultValues = schema defaults with caller overrides
  // Edit mode: defaultValues are set via reset(initialValues) when record arrives
  const formMethods = useForm<State, unknown, Values>({
    defaultValues:
      operation === 'create'
        ? (initialValues as FormDefaults)
        : undefined,
    mode,
    resolver: dynamicResolver,
    shouldUnregister: false,
    shouldFocusError: false,
  });

  // Watch without rendering or validating the entire form on every keystroke.
  // Only a visibility/requiredness transition revalidates the affected control.
  useEffect(() => {
    let previous = getFormConditionStates(entity, formMethods.getValues());
    let mounted = true;
    let validating = false;
    const pending = new Set<Path<State>>();
    const revalidate = async () => {
      if (validating) return;
      validating = true;
      try {
        while (mounted && pending.size > 0) {
          const names = [...pending];
          pending.clear();
          await formMethods.trigger(names);
          if (!mounted) return;
          // An older validation can finish after a field became invisible.
          // Clear it now; the queued pass will validate the latest snapshot too.
          for (const state of getFormConditionStates(entity, formMethods.getValues())) {
            if (!state.visible) formMethods.clearErrors(state.name as Path<State>);
          }
        }
      } finally {
        validating = false;
      }
    };
    const subscription = formMethods.watch(() => {
      const next = getFormConditionStates(entity, formMethods.getValues());
      const changed = next.filter((state, index) =>
        state.visible !== previous[index]?.visible || state.required !== previous[index]?.required
      );
      previous = next;
      for (const state of changed) {
        // Condition state names come directly from this entity's field map.
        const name = state.name as Path<State>;
        if (!state.visible) formMethods.clearErrors(name);
        pending.add(name);
      }
      if (pending.size > 0) void revalidate();
    });
    return () => {
      mounted = false;
      pending.clear();
      subscription.unsubscribe();
    };
  }, [entity, formMethods]);

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
          initialValues as FormDefaults
        );
        lastResetId.current = currentId;
      } else if (!currentId && lastResetId.current === null) {
        // First load without ID - reset once
        formMethodsRef.current.reset(
          initialValues as FormDefaults
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
  // formId scopes the draft so several forms on the same record keep separate drafts.
  const base = `${entity.name.toLowerCase()}-form-draft${formId ? `-${formId}` : ''}`;
  const draftKey =
    operation === 'create'
      ? base
      : documentId
        ? `${base}-${documentId}`
        : `${base}-edit`;

  // Load draft on mount (create: immediately, edit: after DB data loaded)
  const hasLoadedDraft = useRef(false);

  // Child rows of the edited record join this form (useChildRows): their edits
  // live in FormStore under this form's key and are saved in its draft.
  const formKey = useId();
  const openRecordId = operation === 'edit' ? documentId : undefined;
  /** Store keys of this record's joined lists (`[key, collection, field]`) in an entries map. */
  const ownKeys = (entries: Record<string, unknown>): Array<[string, string, string]> => {
    if (!openRecordId) return [];
    return Object.keys(entries).flatMap((key) => {
      const [owner, recordId, collection, field] = key.split('\u0000');
      return owner === formKey && recordId === openRecordId && collection && field
        ? [[key, collection, field] as [string, string, string]]
        : [];
    });
  };
  /** This form's joined child lists with edits, with the writer their useChildRows registered. */
  const joinedRows = (): JoinedRows[] => {
    const { childEdits, childWriters } = useFormStore.getState();
    return ownKeys(childEdits).flatMap(([key, collection, field]) => {
      const edits = childEdits[key]!;
      if (!hasChildEdits(edits)) return [];
      const writer = childWriters[key];
      if (!writer) {
        throw new Error(
          `useEntityForm(${entity.name}): joined rows ${collection}.${field} have edits but no useChildRows registered how to write them.`
        );
      }
      return [{ key, collection, field, writer, edits }];
    });
  };
  /**
   * Joined edits as stored in the draft (parsed ones, and ones read back but not
   * parsed yet: no list mounted), or undefined when there are none.
   */
  const collectChildRows = (): Record<string, Record<string, unknown>> | undefined => {
    const { childEdits, childDrafts } = useFormStore.getState();
    const byCollection: Record<string, Record<string, unknown>> = {};
    for (const [key, collection, field] of ownKeys(childDrafts)) {
      byCollection[collection] = { ...byCollection[collection], [field]: childDrafts[key] };
    }
    for (const [key, collection, field] of ownKeys(childEdits)) {
      const edits = childEdits[key]!;
      if (!hasChildEdits(edits)) continue;
      byCollection[collection] = { ...byCollection[collection], [field]: edits };
    }
    return Object.keys(byCollection).length > 0 ? byCollection : undefined;
  };
  /**
   * Joined edits read back from the draft (untrusted): kept raw until the list's
   * useChildRows validates them with the child entity's rules and extensions.
   */
  const restoreChildRows = (raw: unknown) => {
    if (raw === undefined || !openRecordId) return;
    if (!isRecord(raw)) {
      console.warn('[useEntityForm] draft child rows rejected: not an object');
      return;
    }
    for (const [collection, byField] of Object.entries(raw)) {
      if (!isRecord(byField)) continue;
      for (const [field, value] of Object.entries(byField)) {
        useFormStore
          .getState()
          .setChildDraft(childRowsKey(formKey, openRecordId, collection, field), value);
      }
    }
  };

  // Page state saved in this form's draft (useFormDraftState slots).
  const draftSlots = useRef(new Map<string, FormDraftSlot>());
  const restoredExtras = useRef<Record<string, unknown> | null>(null);
  /** Page-state slots only (compared after a submit to detect later edits). */
  const collectSlotExtras = (): Record<string, unknown> | undefined => {
    if (draftSlots.current.size === 0) return undefined;
    const extras: Record<string, unknown> = {};
    for (const [key, slot] of draftSlots.current) extras[key] = slot.get();
    return extras;
  };
  /**
   * Draft extras: page-state slots, joined child rows and, unless `withBase` is
   * false, the stored row the edit started from (the draft's base version).
   */
  const collectExtras = (withBase = true): Record<string, unknown> | undefined => {
    const slots = collectSlotExtras();
    const childRows = collectChildRows();
    const baseRecord = withBase && operation === 'edit' ? recordRef.current : undefined;
    if (!childRows && !baseRecord) return slots;
    return {
      ...slots,
      ...(childRows && { [CHILD_ROWS_EXTRA]: childRows }),
      ...(baseRecord && { [RECORD_EXTRA]: baseRecord }),
    };
  };
  /**
   * The stored row a draft was saved with (untrusted storage): kept only when it is
   * this record (same id). A draft saved before 0.2.5 has none: the edit keeps the
   * current stored row as its base.
   */
  const restoreRecord = (raw: unknown) => {
    if (raw === undefined) return;
    if (!isRecord(raw) || !openRecordId || raw.id !== openRecordId) {
      console.warn('[useEntityForm] draft record rejected: not the edited record');
      return;
    }
    // why: the row saved by this form's draft (same id), read back from storage
    setRestoredRecord(raw as InferEntityRow<E>);
  };
  /** A form field differs from its base (RHF `defaultValues`: the stored record, create: the defaults). */
  const fieldsDirty = (): boolean => {
    const methods = formMethodsRef.current;
    return Object.keys(methods.getValues()).some(
      (name) => methods.getFieldState(name as Path<State>).isDirty
    );
  };
  /**
   * The one draft rule: the page holds an edit when a field is dirty (RHF), a
   * page-state slot is edited or a joined child list has edits. Only then does a
   * draft exist; one without edits is cleared, never restored.
   */
  const hasEdits = (): boolean =>
    fieldsDirty() ||
    [...draftSlots.current.values()].some((slot) => slot.edited()) ||
    collectChildRows() !== undefined;
  const applyExtras = (extras: Record<string, unknown> | undefined) => {
    restoredExtras.current = extras ?? null;
    if (!extras) return;
    for (const [key, slot] of draftSlots.current) {
      if (key in extras) slot.restore(extras[key]);
    }
    restoreChildRows(extras[CHILD_ROWS_EXTRA]);
    restoreRecord(extras[RECORD_EXTRA]);
  };
  const resetSlots = () => {
    restoredExtras.current = null;
    setRestoredRecord(null);
    for (const slot of draftSlots.current.values()) slot.reset();
    const store = useFormStore.getState();
    for (const [key] of ownKeys(store.childEdits)) store.setChildEdits(key, null);
    for (const [key] of ownKeys(store.childDrafts)) store.setChildDraft(key, null);
  };
  // Debounced draft write; reassigned each render so it reads the current key.
  const scheduleDraftSave = useRef<() => void>(() => {});
  const [draftState] = useState<FormDraftStateRegistry>(() => ({
    register: (key, slot) => {
      draftSlots.current.set(key, slot);
      // A slot registering after the draft loaded still gets its restored value.
      const restored = restoredExtras.current;
      if (restored && key in restored) slot.restore(restored[key]);
      return () => {
        if (draftSlots.current.get(key) === slot) draftSlots.current.delete(key);
      };
    },
    changed: () => scheduleDraftSave.current(),
  }));

  // When loading transitions true → false, reset draft guard so it fires
  // against the freshly-loaded data with the correct draftKey.
  const prevLoading = useRef(loading);
  if (prevLoading.current && !loading) {
    hasLoadedDraft.current = false;
  }
  prevLoading.current = loading;
  /** Discard: back to the base (the stored record; create: the caller/schema defaults). */
  const discardDraft = (base: Record<string, unknown>) => {
    useFormStore.getState().clearDraft(draftKey);
    formMethodsRef.current.reset(base as FormDefaults);
    resetSlots();
  };
  /**
   * A restored draft waiting for the check of what it changes. Checked after the
   * commit that restored it, once the page's useFormDraftState slots registered
   * (they register in effects that run after this hook's).
   */
  const [restoredDraft, setRestoredDraft] = useState<{
    base: Record<string, unknown>;
    conflict: boolean;
  } | null>(null);
  useEffect(() => {
    if (!restoredDraft) return;
    setRestoredDraft(null);
    const { base, conflict } = restoredDraft;
    // No edit against the base: nothing to restore, and its saved record is not the edit base.
    if (!hasEdits()) {
      useFormStore.getState().clearDraft(draftKey);
      restoredExtras.current = null;
      setRestoredRecord(null);
      return;
    }
    // Based on an older version of the stored record: a conflict, never a silent
    // edit base. The warning stays until the owner keeps or discards the draft.
    toast({
      toastType: conflict ? 'warning' : 'info',
      title: t(conflict ? 'crud:draft.conflict' : 'crud:draft.restored'),
      description: t(conflict ? 'crud:draft.conflictDescription' : 'crud:draft.restoredDescription'),
      action: createElement(
        ToastAction,
        { altText: t('crud:draft.discard'), onClick: () => discardDraft(base) },
        t('crud:draft.discard')
      ),
      duration: conflict ? Infinity : 8000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: runs once per restored draft; the rest is read at check time
  }, [restoredDraft]);

  useEffect(() => {
    if (hasLoadedDraft.current) return;

    const savedDraft = useFormStore.getState().loadDraft(draftKey);

    /**
     * Restore a saved draft as edits on top of its base: the base stays RHF's
     * `defaultValues`, each draft value is set dirty (RHF compares it with the base:
     * an equal value stays clean). Deep merge: a partial nested draft keeps the
     * base's sibling keys. A draft edited from an older version of the stored row
     * (its base `updatedAt` differs) is a conflict.
     */
    const restoreDraft = (base: Record<string, unknown>) => {
      if (!savedDraft) return;
      const draftRecord = savedDraft.extras?.[RECORD_EXTRA];
      formMethods.reset(base as FormDefaults);
      const edited = projectState(deepMergeDraft(base, savedDraft.data));
      for (const [name, value] of Object.entries(edited)) {
        // why: names come from projectState (this form's written fields)
        formMethods.setValue(name as Path<State>, value as PathValue<State, Path<State>>, {
          shouldDirty: true,
        });
      }
      applyExtras(savedDraft.extras);
      setRestoredDraft({
        base,
        conflict:
          operation === 'edit' &&
          draftRecord !== undefined &&
          baseVersion(draftRecord) !== baseVersion(storedRecord),
      });
    };

    // Create mode: caller defaults are a legitimate base, not pending DB data.
    if (operation === 'create' && initialValues) {
      if (savedDraft) restoreDraft(initialValues);
      else formMethods.reset(initialValues as FormDefaults);
      hasLoadedDraft.current = true;
      return;
    }

    // Edit mode: wait for DB data to load (initialValues must be set first).
    if (operation === 'edit' && initialValues) {
      restoreDraft(initialValues);
      hasLoadedDraft.current = true;
    }
  }, [
    operation,
    defaultValues,
    draftKey,
    formMethods,
    initialValues,
    storedRecord,
    t,
    schemaDefaults,
  ]);

  // Auto-save subscription — debounced write to FormStore.
  // Uses form.watch(callback) instead of useWatch() to avoid re-rendering
  // the entire form tree on every keystroke. The callback is a side-effect only.
  // Non-null while a debounced draft write is pending.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDraftSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  };
  /**
   * Keep the page's draft (values, page-state slots, joined rows, base record)
   * while it holds edits; clear it once it holds none.
   */
  const persistDraft = () => {
    if (!hasEdits()) {
      useFormStore.getState().clearDraft(draftKey);
      return;
    }
    useFormStore.getState().saveDraft(
      draftKey,
      stripBlobUrls(projectState(formMethodsRef.current.getValues())) as Record<string, unknown>,
      entity.name,
      documentId,
      collectExtras()
    );
  };
  /** Write the current editor (and page-state slots) to the draft now. */
  const writeDraft = () => {
    persistDraft();
  };
  const writeDraftRef = useRef(writeDraft);
  writeDraftRef.current = writeDraft;
  scheduleDraftSave.current = () => {
    // Edits during validation/uploads/submission still belong in the local draft.
    if (!hasLoadedDraft.current) return;

    // Debounce by 3 seconds
    cancelDraftSave();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      writeDraftRef.current();
    }, 3000);
  };

  useEffect(() => {
    const subscription = formMethods.watch(() => scheduleDraftSave.current());
    // This draft key's writer: leaving mid-debounce must not drop the last edits.
    const flush = writeDraftRef.current;

    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) {
        cancelDraftSave();
        flush();
      }
    };
  }, [formMethods, draftKey, entity.name, documentId]);

  // Open record: child rows of this record join the latest form opened on it.
  // Declared after the autosave effect: on unmount its flush (which reads the
  // joined edits) runs before closeRecord drops them (the draft keeps them).
  const viewerRoleRef = useRef(viewerRole);
  viewerRoleRef.current = viewerRole;
  useEffect(() => {
    if (!openRecordId) return;
    useFormStore.getState().openRecord({
      formKey,
      collection: entity.collection,
      recordId: openRecordId,
      viewerRole: viewerRoleRef.current,
      submitting: false,
      changed: () => scheduleDraftSave.current(),
    });
    return () => useFormStore.getState().closeRecord(formKey);
  }, [formKey, entity.collection, openRecordId]);
  useEffect(() => {
    useFormStore.getState().updateOpenRecord(formKey, { viewerRole });
  }, [formKey, viewerRole]);

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

    // Not loaded: no file field ever mounted, so nothing to upload
    const useUploadStore = getLoadedUploadStore();
    if (!useUploadStore) return {};

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
              // why: upload store keys are the entity's upload field names
              fieldName as Path<State>,
              {
                type: 'upload',
                message: fieldState.error,
              }
            );
          }
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : t('crud:form.uploadFailed');
      useFormStore.getState().setError(formId, errorMessage);
      return null;
    } finally {
      clearInterval(progressInterval);
    }
  };

  /**
   * Upload results merged into the values; extension fields (`offer.image`) go
   * under their key. Without extensions: `{ ...values, ...uploads }`.
   */
  const withUploads = (
    values: Record<string, unknown>,
    uploads: Record<string, unknown>
  ): Record<string, unknown> => {
    let merged: Record<string, unknown> = { ...values };
    for (const [name, value] of Object.entries(uploads)) {
      const split = splitExtensionField(name);
      merged =
        split && extensions.some((ext) => ext.key === split[0])
          ? setAtPath(merged, name, value)
          : { ...merged, [name]: value };
    }
    return merged;
  };

  /**
   * Normalize price fields before save: { amount: null, ... } → null.
   * Prevents saving 0€ or a partial price object when the field was never filled.
   */
  const normalizePriceFields = <D extends Record<string, unknown>>(
    e: AnyEntity,
    data: D
  ): D => {
    const result = { ...data } as Record<string, unknown>;
    for (const [fieldName, fieldConfig] of Object.entries(e.fields)) {
      if (fieldConfig.type === 'price' && fieldName in result) {
        const val = result[fieldName] as
          | { amount?: number | null }
          | null
          | undefined;
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
  const scrollToFirstError = (validationErrors: Record<string, unknown>, target: unknown) => {
    if (typeof HTMLFormElement === 'undefined' || !(target instanceof HTMLFormElement)) return;
    const names = Object.keys(validationErrors).filter((name) => name !== 'root');
    const controls = target.querySelectorAll<HTMLElement>(
      'input, textarea, select, button, [tabindex]'
    );
    for (const control of controls) {
      const name = control.getAttribute('name');
      const invalid = control.getAttribute('aria-invalid') === 'true' ||
        (name !== null && names.some((field) => name === field || name.startsWith(`${field}.`)));
      if (!invalid || control.matches(':disabled, input[type="hidden"]') ||
        control.closest('[hidden], [inert], [aria-hidden="true"]') ||
        control.getClientRects().length === 0) continue;
      control.focus();
      if (control.ownerDocument.activeElement !== control) continue;
      control.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  };

  // ============================================================================
  // Joined child rows: writes, validation, default writer
  // ============================================================================

  /** Joined rows the submit in flight carries (snapshot), null outside a submit. */
  const submittedRows = useRef<JoinedRows[] | null>(null);
  /** The values the submit in flight writes (extensions included), null outside a submit. */
  const submittedData = useRef<Record<string, unknown> | null>(null);
  /** Whether `pendingWrites()` was read during the submit in flight. */
  const pendingWritesRead = useRef(false);

  /** Minted-id key of the record this create form inserts (stable until written). */
  const newRecordMintKey = `record\u0000${draftKey}`;

  /** Extensions this form writes: updated when their row exists, else inserted. */
  const writableExtensions = () =>
    extensions.filter((ext) =>
      extensionOperation(ext.key) === 'edit' ? ext.update : ext.create
    );

  /**
   * The extensions' writes for `data`: update of an existing row with the fields
   * the viewer may write, or insert of a missing one (link field = the record;
   * depends on the record's insert on create).
   */
  const extensionBatches = (
    data: Record<string, unknown>,
    recordId: string | undefined
  ): BulkAcrossBatch[] =>
    writableExtensions().map((ext) => {
      const extOperation = extensionOperation(ext.key);
      const allowed = new Set(
        [...extensionWritable(ext, viewerRole, extOperation)].map(
          (name) => splitExtensionField(name)?.[1] ?? name
        )
      );
      const raw = data[ext.key];
      const values = normalizePriceFields(
        ext.entity,
        pickFields(isRecord(raw) ? raw : {}, allowed)
      );
      const extSchemas = schemasOf(ext.entity);
      const extRow = extensionRowOf(ext.key);
      if (extRow) {
        return {
          collection: ext.entity.collection,
          // The extension row as read: the CRUD update rules run on it.
          updates: [{ id: extRow.id, patch: values, stored: extRow }],
          schemas: extSchemas,
        };
      }
      if (!recordId) {
        throw new Error(
          `useEntityForm(${entity.name}): inserting extension "${ext.key}" on create needs the record id: pendingWrites({ recordId }) (pre-mint it).`
        );
      }
      return {
        collection: ext.entity.collection,
        inserts: [
          injectScope(
            {
              ...values,
              // The same id on every call / retry until written.
              id: useFormStore
                .getState()
                .mintId(extensionMintKey(ext.entity.collection, recordId)),
              [ext.field]: recordId,
            },
            ext.entity.scope
          ),
        ],
        schemas: extSchemas,
        ...(operation === 'create' && { dependsOn: [entity.collection] }),
      };
    });

  /**
   * Logical delete of the open record (CRUD rule 3): `{ status: 'deleted' }` only, so the
   * form's values are not validated (an incomplete record can be removed). Clears the
   * local draft. Edit mode only.
   */
  const remove = async (): Promise<void> => {
    const service = getCrudServiceInstance();
    if (!service) throw new Error(t('crud:form.saveFailed'));
    if (operation !== 'edit' || !documentId) {
      throw new Error(`useEntityForm(${entity.name}): remove() needs an edited record (defaultValues.id).`);
    }
    await service.remove(entity.collection, documentId);
    useFormStore.getState().clearDraft(draftKey);
  };

  const pendingWrites = (
    writeOptions: { recordId?: string } = {}
  ): BulkAcrossBatch[] => {
    pendingWritesRead.current = true;
    const rows = submittedRows.current ?? joinedRows();
    const data =
      submittedData.current ?? (formMethodsRef.current.getValues() as Record<string, unknown>);
    return mergeBatches([
      ...extensionBatches(data, openRecordId ?? writeOptions.recordId),
      ...rows.flatMap(({ writer, edits }) => writer.batches(edits)),
    ]);
  };

  /**
   * Invalid joined rows block the Save with one message (the count of rows to
   * fix): the form error when the form has a formId, else a toast. The cells
   * already show each field's message (`rows.errors`). True when some are invalid.
   */
  const reportRowIssues = (rows: JoinedRows[]): boolean => {
    let count = 0;
    for (const { writer, edits } of rows) {
      const errors = writer.errors(edits);
      const invalid = Object.keys(errors).length;
      if (invalid === 0) continue;
      console.warn('[useEntityForm] invalid child rows:', writer.entity.collection, errors);
      count += invalid;
    }
    if (count === 0) return false;
    const message = t('crud:childRows.invalidRows', { count });
    if (formId) useFormStore.getState().setError(formId, message);
    else toast({ toastType: 'error', title: message, duration: 8000 });
    return true;
  };

  /**
   * Create: the caller's `defaultValues.status` (e.g. `'draft'`) when the form does
   * not write status (a viewer below its `editable` role): the caller's choice, like
   * the scope, not a viewer input. Otherwise nothing (DEFAULT_STATUS_VALUE applies).
   */
  const callerCreateStatus = (): { status?: string } =>
    !ownWritten.has('status') && baseStatus !== null
      ? { status: baseStatus }
      : {};

  /**
   * Default writer: the record with the fields the form writes (update, or add
   * on create), plus the joined rows, in one bulkAcross.
   */
  const writeRecord = async (
    data: Record<string, unknown>
  ): Promise<BulkAcrossResult> => {
    const service = getCrudServiceInstance();
    if (!service) {
      console.error('[useEntityForm] default writer: the CRUD service is not ready');
      throw new Error(t('crud:form.saveFailed'));
    }
    const schemas = createSchemas(entity);
    // The fields the form writes: inputs editable for the viewer, computed fields, companions.
    const values = pickFields(data, ownWritten);
    if (operation === 'edit' && !documentId) {
      throw new Error(
        `useEntityForm(${entity.name}): the default writer needs defaultValues.id in edit mode.`
      );
    }
    // On create, an extension insert references the record: pre-mint its id
    // (the same on retries until the write succeeds).
    const newId =
      operation === 'create' && writableExtensions().length > 0
        ? useFormStore.getState().mintId(newRecordMintKey)
        : undefined;
    const record: BulkAcrossBatch =
      operation === 'edit' && documentId
        ? {
            collection: entity.collection,
            // The record the edit started from (form.record): the CRUD update rules
            // run on it, as the resolver did.
            updates: [{ id: documentId, patch: values, stored: recordRef.current }],
            schemas,
          }
        : {
            collection: entity.collection,
            inserts: [
              injectScope(
                { ...values, ...callerCreateStatus(), ...(newId && { id: newId }) },
                entity.scope
              ),
            ],
            schemas,
          };
    return service.bulkAcross([record, ...pendingWrites({ recordId: newId })]);
  };

  // ============================================================================
  // Wrapped handleSubmit with upload orchestration
  // ============================================================================

  const originalHandleSubmit = formMethods.handleSubmit;

  const handleSubmitWithOrchestration: EntityFormHandleSubmit<Values, State> = <TResult = BulkAcrossResult,>(
    onValid?: SubmitHandler<Values, TResult>,
    onInvalid?: SubmitErrorHandler<State>,
    submitOptions?: EntityFormSubmitOptions
  ) => {
    return async (e?: React.BaseSyntheticEvent): Promise<Awaited<TResult> | undefined> => {
      // onValid's result, as React Hook Form resolves it (undefined when not reached).
      let result: Awaited<TResult> | undefined;
      e?.preventDefault?.();
      // React clears currentTarget after the event handler yields.
      const submitTarget = e?.currentTarget;

      // Submit mutex: block concurrent submissions
      if (isSubmittingMutex.current) {
        console.warn('[useEntityForm] BLOCKED by mutex');
        return;
      }

      const formStore = formId ? useFormStore.getState() : null;
      // Capture the editor before the resolver can yield. Parsed/normalized payloads
      // are not the editor baseline (hidden fields and upload controls may differ).
      const submittedValues = structuredClone(formMethodsRef.current.getValues());
      // Joined child rows submitted with the fields (validated in the same step).
      const rows = joinedRows().filter(({ edits }) => hasChildEdits(edits));

      // 1. Validate FIRST — before any loading state.
      //    RHF triggers field-level errors, button stays idle, user fixes and retries.
      await originalHandleSubmit(
        async (data, event) => {
          // Double-check mutex inside RHF callback (guard against race)
          if (isSubmittingMutex.current) return;
          // Invalid joined rows block the Save, like invalid fields, before any leave.
          if (reportRowIssues(rows)) return;
          isSubmittingMutex.current = true;

          // Cancel any previous in-flight submission
          submitControllerRef.current?.abort();
          const controller = new AbortController();
          submitControllerRef.current = controller;
          let returnPath: string | null = null;

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
            const mergedData: Record<string, unknown> = withUploads(
              validatedData,
              uploadResults
            );
            // Normalize price fields: { amount: null, ... } → null so DB never stores 0€ by default.
            // (Backend-generated fields never reach here: not in form state, not in the write schemas.)
            const cleanedData = normalizePriceFields(entity, mergedData);
            for (const ext of extensions) {
              const extValues = cleanedData[ext.key];
              if (isRecord(extValues)) {
                cleanedData[ext.key] = normalizePriceFields(ext.entity, extValues);
              }
            }

            // Final gate: reject blob URLs regardless of upload state.
            // Catches draft-restored blobs, standalone mode, and race conditions.
            const blobPaths = checkForBlobUrls(cleanedData);
            if (blobPaths.length > 0) {
              // Paths are internal: logged for the developer, never shown to the user.
              console.warn('[useEntityForm] blob URLs at', blobPaths.join(', '));
              if (formId && formStore) {
                formStore.setError(formId, t('crud:form.reuploadFiles'));
              }
              return;
            }

            if (controller.signal.aborted) return;

            // Upload controls replace pending previews with stored assets in RHF.
            // Acknowledge that normalization, not later live edits or other payload
            // transforms. Clone before the request yields so this baseline stays fixed.
            const acknowledgedValues = withUploads(
              submittedValues as Record<string, unknown>,
              structuredClone(uploadResults)
            );
            // Persist the editor now: the 3s debounce may not have fired yet, and
            // the page can unmount (which drops the timer) before the server answers.
            // A failed save then reopens with every edit; success clears it below.
            if (hasLoadedDraft.current) {
              cancelDraftSave();
              persistDraft();
            }
            // Page-state slots as submitted (serialized: later edits must not alias them).
            const submittedSlots = new Map(
              Object.entries(collectSlotExtras() ?? {}).map(([key, value]) => [key, JSON.stringify(value)])
            );
            // Optimistic leave: go now, come back if the write rejects.
            const leaveFor =
              submitOptions && 'successPath' in submitOptions
                ? submitOptions.successPath
                : successPath;
            if (navigation && leaveFor !== null) {
              const origin = navigation.currentPath();
              const target = leaveFor ?? navigation.parentPath();
              if (target !== origin) {
                returnPath = origin;
                navigation.navigate(target);
              }
            }
            submittedRows.current = rows;
            submittedData.current = cleanedData;
            pendingWritesRead.current = false;
            useFormStore.getState().updateOpenRecord(formKey, { submitting: true });
            result = onValid
              ? await onValid(cleanedData as Values, event)
              : // why: without onValid, TResult is its default (BulkAcrossResult), what the default writer returns
                ((await writeRecord(cleanedData)) as Awaited<TResult>);
            const unread = [
              ...rows.map(({ collection }) => collection),
              ...writableExtensions().map((ext) => ext.entity.collection),
            ];
            if (unread.length > 0 && !pendingWritesRead.current) {
              console.error(
                `[useEntityForm] ${entity.name}: ${unread.join(', ')} have writes but onValid did not read form.pendingWrites(); they were not saved.`
              );
              throw new Error(t('crud:childRows.notSaved'));
            }
            // Written: joined edits leave (edits made meanwhile stay), rows refetch.
            let laterRows = false;
            for (const { key, collection, edits } of rows) {
              const current = useFormStore.getState().childEdits[key];
              const next = current ? rebaseChildEdits(current, edits) : null;
              laterRows ||= !!next && hasChildEdits(next);
              useFormStore.getState().setChildEdits(key, next && hasChildEdits(next) ? next : null);
              void getCrudServiceInstance()?.invalidateCollection(collection);
            }
            for (const ext of extensions) {
              void getCrudServiceInstance()?.invalidateCollection(ext.entity.collection);
            }
            // Written: minted ids are spent (the next create mints new ones).
            const mintedRecordId = useFormStore.getState().mintedIds[newRecordMintKey];
            const writtenRecordId = openRecordId ?? mintedRecordId;
            useFormStore.getState().releaseMintedIds([
              newRecordMintKey,
              ...(writtenRecordId
                ? extensions.map((ext) => extensionMintKey(ext.entity.collection, writtenRecordId))
                : []),
            ]);

            const methods = formMethodsRef.current;
            const currentValues = methods.getValues();
            // Acknowledge the submitted editor plus upload normalization without
            // moving controls. Then recompute dirty fields against that baseline.
            // keepValues alone retains stale dirtyFields in RHF.
            methods.reset(acknowledgedValues as FormDefaults, { keepValues: true });
            methods.reset(currentValues as FormDefaults, { keepDefaultValues: true });

            // Cancel pre-success debounce callbacks so they cannot resurrect a
            // completed draft. Later edits stay local, visible and recoverable.
            cancelDraftSave();
            const hasLaterEdits =
              Object.keys(currentValues).some(
                (name) => methods.getFieldState(name as Path<State>).isDirty
              ) ||
              // A slot still mounted that changed since submit. A slot that unregistered
              // (the page left on save) took its submitted value with it: not an edit.
              Object.entries(collectSlotExtras() ?? {}).some(
                ([key, value]) => submittedSlots.get(key) !== JSON.stringify(value)
              ) ||
              laterRows;
            if (hasLaterEdits) {
              // Later edits are based on the row just written, not on the one the
              // edit started from: no base row (reopening takes the stored one).
              useFormStore.getState().saveDraft(
                draftKey,
                stripBlobUrls(projectState(currentValues)) as Record<string, unknown>,
                entity.name,
                documentId,
                collectExtras(false)
              );
            } else {
              useFormStore.getState().clearDraft(draftKey);
            }

            if (formId && formStore) {
              formStore.setSuccess(formId);
            }
          } catch (error) {
            // Back to the record left on submit: the kept draft restores the edits.
            if (returnPath !== null) navigation?.navigate(returnPath);
            // Server rejected — reset to idle, caller shows the error
            if (formId && formStore) {
              formStore.setError(
                formId,
                error instanceof Error ? error.message : t('crud:form.saveFailed'),
                error
              );
            }
            throw error;
          } finally {
            isSubmittingMutex.current = false;
            submittedRows.current = null;
            submittedData.current = null;
            useFormStore.getState().updateOpenRecord(formKey, { submitting: false });
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
          // RHF keeps only the fields that have an error (cleared ones are unset)
          const errorFields = Object.keys(validationErrors).filter(
            (k) => k !== 'root'
          );
          console.warn(
            '[useEntityForm] Validation failed:',
            errorFields.length,
            'field(s)',
            validationErrors
          );

          toast({
            toastType: 'error',
            title: t('crud:form.validationFailed'),
            description: t('crud:form.fixFields', {
              fields: errorFields
                .map((name) =>
                  translateFieldLabel(name, entity.fields[name], t)
                )
                .join(', '),
            }),
            duration: 8000,
          });

          // Joined rows are validated in the same step: report them too.
          reportRowIssues(rows);
          scrollToFirstError(validationErrors, submitTarget);
          onInvalid?.(validationErrors);
        }
      )(e);
      return result;
    };
  };

  // ============================================================================
  // Reset form (clears draft + resets to original values)
  // ============================================================================

  const resetForm = () => {
    useFormStore.getState().clearDraft(draftKey);
    resetSlots();

    // Reset to original values (or empty for create)
    formMethods.reset(initialValues as FormDefaults);
    hasLoadedDraft.current = false;
  };

  // ============================================================================
  // Cleanup function
  // ============================================================================

  const cleanup = () => {
    submitControllerRef.current?.abort();
    if (formId) {
      useFormStore.getState().cleanup(formId);
      getLoadedUploadStore()?.getState().cleanup(formId);
    }
  };

  useEffect(() => cleanup, []);

  // ============================================================================
  // Cancel function (abort in-flight uploads + reset state)
  // ============================================================================

  const cancel = () => {
    submitControllerRef.current?.abort();
    if (formId) {
      getLoadedUploadStore()?.getState().abortAll(formId);
      useFormStore.getState().reset(formId);
    }
    isSubmittingMutex.current = false;
  };

  // ============================================================================
  // Field filtering
  // ============================================================================

  // Edit: show all schema fields (not just keys in defaultValues) so fields
  // removed from DB or null still appear with type defaults.
  const ownFields = getFieldsForOperation(entity, {
    operation,
    viewerRole,
    availableFields: undefined,
  });
  // Extension fields, prefixed `key.` (update when the extension exists, else insert).
  const fields =
    extensions.length === 0
      ? ownFields
      : [
          ...ownFields,
          ...extensions.flatMap((ext) =>
            extensionFields(ext, viewerRole, extensionOperation(ext.key))
          ),
        ];

  // Track whether the user has interacted with the form (touched or submitted)
  const hasUserInteracted =
    formMethods.formState.isSubmitted ||
    Object.keys(formMethods.formState.touchedFields || {}).length > 0;

  return {
    ...formMethods,
    handleSubmit: handleSubmitWithOrchestration,
    fields,
    // why: Op is inferred from options.operation; without it Op is both operations, and the
    // runtime value (from defaultValues) is one of them
    operation: operation as Op,
    record,
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
    // why: initial values are the form state (FormValues projection), built field by field
    originalValues: initialValues as Partial<Values> | undefined,
    draftState,
    pendingWrites,
    remove,
  };
}
