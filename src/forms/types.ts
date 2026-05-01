// packages/features/crud/src/forms/types.ts

/**
 * @fileoverview Form type exports
 * @description Type utilities for type-safe form building with entity definitions.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type {
  AnyEntity,
  CrudCreateInput,
  Entity,
  EntityField,
  FieldType,
  InferEntityRow,
  Visibility,
  Editable,
  ValidationRules,
  dndevSchema,
} from '@donotdev/core';

import type { RenderableField, ViewerRole } from './utils';
import type { FormStatus } from '../stores/FormStore';
import type { ReactElement } from 'react';
import type {
  UseFormReturn,
  ControllerRenderProps,
  FieldPath,
} from 'react-hook-form';

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
 * Payload for {@link useCrud} `add` and bulk `inserts`: document shape without a
 * stable row `id` (matches {@link CrudCreateInput} over {@link InferEntityRow}).
 *
 * @template E - Entity from `defineEntity()`
 *
 * @version 0.1.0
 * @since 0.2.0
 */
export type InferEntityCreate<E extends AnyEntity> = CrudCreateInput<
  InferEntityRow<E>
>;

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
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface UseEntityFormOptions<E extends AnyEntity> {
  /**
   * Form ID for tracking form/upload state.
   * Required for deferred file uploads and form status tracking.
   * Generate with useId() in the parent component.
   */
  formId?: string;

  /**
   * Form operation type.
   * - 'create': Excludes technical fields, all other fields editable
   * - 'edit': Shows all fields from defaultValues, technical fields read-only
   * @default 'create' (or 'edit' if defaultValues provided)
   */
  operation?: 'create' | 'edit';

  /**
   * Initial form values.
   * For edit mode, should come from backend (already visibility-filtered).
   */
  defaultValues?: Partial<InferEntityData<E>>;

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
   * Translation function for field labels.
   * If not provided, uses entity labels or generates from field names.
   */
  t?: (key: string, options?: Record<string, unknown>) => string;

  /**
   * Whether the form data is still loading (e.g. async fetch in edit mode).
   * When true, form initialization and draft restoration are deferred until false.
   * Transitions from true → false reset the draft guard so draft loads against the correct data.
   * @default false
   */
  loading?: boolean;
}

/**
 * Return type for useEntityForm hook.
 *
 * Extends React Hook Form's UseFormReturn with entity-aware additions.
 *
 * @template E - Entity type from defineEntity()
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface EntityFormReturn<E extends AnyEntity> extends UseFormReturn<
  InferEntityData<E>
> {
  /**
   * Pre-filtered fields ready for rendering.
   * Already filtered by operation and visibility.
   */
  fields: RenderableField[];

  /**
   * Current operation type.
   */
  operation: 'create' | 'edit';

  /**
   * Original entity definition.
   */
  entity: E;

  /**
   * Translation function for labels.
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
   * Original values the form was initialized with.
   * For create mode: schema-based defaults.
   * For edit mode: schema defaults overlaid with the DB record.
   */
  originalValues: Partial<InferEntityData<E>> | undefined;
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
