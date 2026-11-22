// packages/features/crud/src/forms/types.ts

/**
 * @fileoverview Form type exports
 * @description Type utilities for type-safe form building with entity definitions.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { BaseSyntheticEvent, ReactElement } from 'react';
import type {
  UseFormReturn,
  SubmitHandler,
  SubmitErrorHandler,
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import type { FormDraftStateRegistry } from './hooks/useFormDraftState';
import type {
  AnyEntity,
  BulkAcrossBatch,
  BulkAcrossResult,
  CreateInput,
  EntityExtensions,
  EntityFormDefaultValues,
  Entity,
  EntityField,
  FieldOperation,
  FieldType,
  FormValues,
  InferEntityRow,
  Visibility,
  Editable,
  ValidationRules,
  dndevSchema,
} from '@donotdev/core';

import type { RenderableField, ViewerRole } from './utils';
import type { FormStatus } from '../stores/FormStore';

// Re-export commonly needed types for convenience
export type {
  AnyEntity,
  Entity,
  EntityField,
  FieldType,
  Visibility,
  Editable,
  ValidationRules,
  dndevSchema,
  RenderableField,
  ViewerRole,
};

/**
 * Infers the data type from an entity definition.
 *
 * Alias of {@link InferEntityRow} — single source of truth with CRUD hooks and `defineEntity` field maps.
 *
 * @template E - Entity type from defineEntity()
 *
 * @example
 * ```typescript
 * const productEntity = defineEntity({
 *   name: 'Product',
 *   collection: 'products',
 *   fields: {
 *     name: { type: 'text', visibility: 'guest' },
 *     price: { type: 'number', visibility: 'guest' },
 *     active: { type: 'boolean', visibility: 'user' }
 *   }
 * });
 *
 * type ProductData = InferEntityData<typeof productEntity>;
 * // { name: string; price: number; active: boolean; id: string; ... }
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type InferEntityData<E extends AnyEntity> = InferEntityRow<E>;

/**
 * Create payload of an entity: {@link CreateInput} (`createSchemas(e).create`, from
 * the entity descriptor). Written fields only (`user`, `derived`, `program` write
 * classes); required → key required, value; optional / conditional → key optional,
 * value or `null`.
 *
 * @template E - Entity from `defineEntity()`
 *
 * @version 0.2.0
 * @since 0.2.0
 */
export type InferEntityCreate<E extends AnyEntity> = CreateInput<E>;

/**
 * Infers form input type (values before validation).
 * All fields are optional/partial since form may be incomplete.
 *
 * @template E - Entity type from defineEntity()
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type InferEntityInput<E extends AnyEntity> = Partial<InferEntityData<E>>;

/**
 * Infers form output type (values after validation).
 * Represents validated, complete data ready for submission.
 *
 * @template E - Entity type from defineEntity()
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type InferEntityOutput<E extends AnyEntity> = InferEntityData<E>;

/**
 * Options for useEntityForm hook.
 *
 * @template E - Entity type from defineEntity()
 * @template Op - Form operation (`operation`), both when not given
 * @template X - 1:1 extensions (`extend`), none by default
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface UseEntityFormOptions<
  E extends AnyEntity,
  Op extends FieldOperation = FieldOperation,
  X extends EntityExtensions = Record<never, never>,
> {
  /**
   * Form ID for tracking form/upload state.
   * Required for deferred file uploads and form status tracking.
   * Also scopes the auto-saved draft: give each form on the same record its own
   * stable formId (e.g. 'product-prices') so their drafts never overwrite each other.
   */
  formId?: string;

  /**
   * Form operation type.
   * - 'create': Excludes technical fields, all other fields editable
   * - 'edit': Shows all fields from defaultValues, technical fields read-only
   * @default 'create' (or 'edit' if defaultValues provided)
   */
  operation?: Op;

  /**
   * Initial form values ({@link EntityFormDefaultValues}).
   * - edit: the stored row as read (already visibility-filtered), accepted as-is.
   *   It becomes `form.record`; form state holds only the fields the form writes.
   * - create: create defaults (e.g. `status: 'draft'`, a parent reference).
   * Fields the form does not write (generated, technical, `editable: false`,
   * role-denied) never enter form state, the local draft or the payload.
   */
  defaultValues?: EntityFormDefaultValues<E, Op>;

  /**
   * Viewer role for editability checks.
   * Determines which fields render as inputs vs read-only.
   * If not provided, defaults to 'guest' (most restrictive)
   * @default 'guest'
   */
  viewerRole?: string;

  /**
   * React Hook Form mode.
   * @default 'onSubmit'
   */
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'onTouched' | 'all';

  /**
   * Optional override for labels, hints, options and nested field-array fields.
   * Omit for normal usage: useEntityForm automatically uses
   * `useTranslation([entity.namespace, 'crud'])` with language/SSR support.
   * Supply your own translator only to bypass that namespace resolution; it
   * replaces the default translator completely. Pass returned `form.t` to the
   * field renderers in either case.
   */
  t?: (key: string, options?: Record<string, unknown>) => string;

  /**
   * Whether the form data is still loading (e.g. async fetch in edit mode).
   * When true, form initialization and draft restoration are deferred until false.
   * Transitions from true → false reset the draft guard so draft loads against the correct data.
   * @default false
   */
  loading?: boolean;

  /**
   * Where the page goes once a submit passes validation and uploads.
   * The form leaves right away, before the server answers (optimistic); if the
   * write rejects, it returns to the page it left and the saved draft restores
   * every edit.
   * - omitted: the previous breadcrumb (nearest existing parent route, else `/`)
   * - a path: that path
   * - `null`: stay on the page (dialogs, wizards, settings, create flows that
   *   open the new record, pages holding other unsaved state, and every form of
   *   a nested submit: leaving would unmount the inner form and cancel its save)
   *
   * Needs the router access `@donotdev/ui` provides; without it the form stays.
   */
  successPath?: string | null;

  /**
   * The form's own toasts: "fields to correct" when a submit fails validation,
   * and "draft restored" (default `true`). `false`: neither; the field messages,
   * the scroll to the first one and the draft restoring itself remain (a form in
   * a sheet or dialog). Success toasts have their own opt-outs:
   * `showSuccessToast` per mutation, `setHideSuccessToasts` on the CRUD store.
   * @default true
   */
  toasts?: boolean;

  /**
   * 1:1 extensions edited with the record (a record split across two tables,
   * e.g. `{ offer: { entity: productOfferEntity, field: 'productId' } }`): their
   * fields join `form.fields` prefixed `key.` (`offer.priceExclVat`; values under
   * `values.offer`), with conditions, validation, draft and uploads. In edit mode
   * the extension row is read (the form waits for it); the default writer and
   * `pendingWrites()` update it, or insert it when missing (after the record on
   * create). A viewer without read access to an extension entity gets none of it.
   * Keep the same keys while mounted.
   * @since 0.2.5
   */
  extend?: X;
}

/** Per-submit options for {@link EntityFormHandleSubmit}. */
export interface EntityFormSubmitOptions {
  /**
   * Overrides the hook's `successPath` for this submit only, e.g. Save on a draft
   * stays (`null`) while Publish on the same form leaves. When the key is present
   * it wins, `undefined` included (= previous breadcrumb); when absent the hook
   * option applies.
   */
  successPath?: string | null;
}

/**
 * React Hook Form's `handleSubmit` (resolves `onValid`'s result, `undefined` when
 * the submit did not reach it) plus per-submit {@link EntityFormSubmitOptions}.
 *
 * `onValid` is optional: without it the default writer saves the record (update,
 * or add on create) with the fields the entity allows, plus the child rows joined
 * to the form, in one `bulkAcross`, and resolves its {@link BulkAcrossResult}.
 * With it, the app writes; joined rows' writes come from `form.pendingWrites()`.
 *
 * @template T - What `onValid` receives (the resolver's output)
 * @template S - Form state `onInvalid`'s errors are keyed by, `T` by default
 */
export type EntityFormHandleSubmit<
  T extends FieldValues,
  S extends FieldValues = T,
> = <TResult = BulkAcrossResult>(
  onValid?: SubmitHandler<T, TResult>,
  onInvalid?: SubmitErrorHandler<S>,
  options?: EntityFormSubmitOptions
) => (event?: BaseSyntheticEvent) => Promise<Awaited<TResult> | undefined>;

/**
 * Form state of an entity form (React Hook Form's `TFieldValues` in
 * {@link EntityFormReturn}): {@link FormValues} for both operations. Not keyed by
 * the operation: React Hook Form's types are invariant in their field values, so a
 * state per operation would make a `create` / `edit` form unassignable to
 * `EntityFormReturn<E>`. The operation keys what is submitted (`TTransformedValues`:
 * `handleSubmit`'s `onValid`), in which they are covariant.
 *
 * @template E - Entity type from defineEntity()
 * @template X - 1:1 extensions (`extend`), none by default
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */
export type EntityFormState<
  E extends AnyEntity,
  X extends EntityExtensions = Record<never, never>,
> = FormValues<E, FieldOperation, X>;

/**
 * Return type for useEntityForm hook.
 *
 * Extends React Hook Form's UseFormReturn with entity-aware additions. Form state
 * ({@link EntityFormState}) is {@link FormValues} for both operations: the fields
 * the form writes (inputs editable for the viewer, `editable: 'computed'` fields,
 * i18n companions, `id` on edit). Other fields of the stored row are read from
 * {@link EntityFormReturn.record}. `Op` keys `operation`, what `handleSubmit`'s
 * `onValid` receives (React Hook Form's `TTransformedValues`) and `originalValues`; every form of `E` (any `Op`) is an
 * `EntityFormReturn<E>`, so helpers typed `<E extends AnyEntity>(form:
 * EntityFormReturn<E>)` take a `create` or `edit` form. A helper taking a form
 * with 1:1 extensions declares `X` (`EntityFormReturn<E, FieldOperation, X>`).
 *
 * @template E - Entity type from defineEntity()
 * @template Op - Form operation
 * @template X - 1:1 extensions (`extend`), none by default
 *
 * @version 0.3.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface EntityFormReturn<
  E extends AnyEntity,
  Op extends FieldOperation = FieldOperation,
  X extends EntityExtensions = Record<never, never>,
> extends UseFormReturn<EntityFormState<E, X>, unknown, FormValues<E, Op, X>> {
  /**
   * Validates, uploads, writes the draft, leaves for `successPath`, then calls
   * `onValid` with the resolver's output ({@link FormValues} for `Op`: the fields
   * the form writes); `onInvalid` gets the errors keyed by form state. Third
   * argument: per-submit {@link EntityFormSubmitOptions}.
   */
  handleSubmit: EntityFormHandleSubmit<
    FormValues<E, Op, X>,
    EntityFormState<E, X>
  >;

  /**
   * Stored row the edit started from (`defaultValues` on edit, 1:1 extension rows
   * under their key), saved with the local draft and restored with it: a value read
   * from it (a concurrency token such as `revision`) stays the base version of a
   * restored draft. Read-only displays read fields the form does not write
   * (technical, `editable: false`, role-denied) from it. `undefined` on create and
   * while the record loads.
   * @since 0.2.5
   */
  record: InferEntityRow<E> | undefined;

  /**
   * Page-state slots kept in this form's draft. Pass the form to
   * `useFormDraftState`; do not call it directly.
   */
  draftState: FormDraftStateRegistry;

  /**
   * Writes besides the record itself: the 1:1 extensions (`extend`: update, or
   * insert when missing) and the child rows joined to this form (`useChildRows`
   * / a nested `EntityList` on this record), one `bulkAcross` batch per
   * collection (inserts with pre-minted ids, updates, deletes, schemas). During
   * a submit, what that submit carries. Call it in your `handleSubmit(onValid)`
   * and add the batches to your write; if there is something to write and it
   * was not read during the submit, the submit fails with an explicit error (no
   * silent loss). Empty when nothing joined, no extension and no edits.
   *
   * On create, inserting an extension needs the record id: pre-mint it and pass
   * `{ recordId }` (its batch depends on the record's collection, so include the
   * record insert in the same call).
   *
   * @example
   * ```tsx
   * const save = form.handleSubmit(async (values) => {
   *   await bulkAcross([
   *     { collection: 'campaigns', updates: [{ id, patch: toPatch(values) }], schemas: createSchemas(campaign) },
   *     ...form.pendingWrites(),
   *   ]);
   * });
   * ```
   * @since 0.2.5
   */
  pendingWrites: (options?: { recordId?: string }) => BulkAcrossBatch[];
  /**
   * Logical delete of the open record (CRUD rule 3): `{ status: 'deleted' }` only, the
   * form's values are not validated. Clears the local draft. Edit mode only.
   * @since 0.3.0
   */
  remove: () => Promise<void>;

  /**
   * Pre-filtered fields ready for rendering.
   * Already filtered by operation and visibility.
   */
  fields: RenderableField[];

  /**
   * Current operation type.
   */
  operation: Op;

  /**
   * Original entity definition.
   */
  entity: E;

  /**
   * Resolved entity + crud translator, or options.t when explicitly overridden.
   * Pass it to FormFieldRenderer / DisplayFieldRenderer in custom layouts.
   */
  t: (key: string, options?: Record<string, unknown>) => string;

  /**
   * Current viewer role.
   * Always has a value (defaults to 'guest' if not provided).
   */
  viewerRole: string;

  /**
   * Form ID for state tracking.
   * Undefined if not provided in options.
   */
  formId: string | undefined;

  /**
   * Current form status from FormStore.
   * Tracks: idle → uploading → validating → submitting → success/error
   */
  formStatus: FormStatus;

  /**
   * Upload progress 0-100 when status is 'uploading'.
   */
  uploadProgress: number;

  /**
   * Cleanup function to call on unmount.
   * Cleans up FormStore and UploadStore state for this form.
   */
  cleanup: () => void;

  /**
   * Cancel in-flight uploads and reset form submission state.
   * Aborts the AbortController, resets FormStore, and releases the submit mutex.
   */
  cancel: () => void;

  /**
   * Whether the form has unsaved changes.
   * True if any field value differs from original/default values.
   */
  isDirty: boolean;

  /**
   * Whether the user has interacted with the form.
   * True if any field has been touched or the form has been submitted.
   * Used to gate navigation blocking so we don't warn on untouched forms.
   */
  hasUserInteracted: boolean;

  /**
   * Reset form to original values and clear any saved draft.
   * Use this for "Cancel" button functionality.
   */
  resetForm: () => void;

  /**
   * Original values the form was initialized with (form state: the fields the form writes).
   * For create mode: schema-based defaults with the caller's defaults.
   * For edit mode: the DB record projected onto the written fields, type defaults for empty ones.
   */
  originalValues: Partial<FormValues<E, Op, X>> | undefined;
}

/**
 * Return type for useEntityField hook.
 *
 * @template E - Entity type from defineEntity()
 * @template K - Field key from entity
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface EntityFieldReturn<
  E extends AnyEntity,
  K extends keyof InferEntityData<E>,
> {
  /**
   * React Hook Form field props (value, onChange, onBlur, etc.)
   */
  field: ControllerRenderProps<
    InferEntityData<E>,
    FieldPath<InferEntityData<E>>
  >;

  /**
   * Field metadata (error, touched, dirty state).
   */
  meta: {
    error: string | undefined;
    touched: boolean;
    isDirty: boolean;
  };

  /**
   * Normalized field configuration.
   */
  config: EntityField;

  /**
   * Whether field is editable (based on role, operation, config).
   */
  isEditable: boolean;

  /**
   * Whether field is visible (based on filtering).
   */
  isVisible: boolean;

  /**
   * Format the current field value for display using registered formatter.
   * Returns the formatted value as string or ReactElement.
   *
   * @param options - Formatting options
   * @param options.compact - Use compact formatting (smaller images, plain spans for empty)
   * @param options.asString - Prefer string output when possible
   */
  display: (options?: {
    compact?: boolean;
    asString?: boolean;
  }) => string | ReactElement;
}
