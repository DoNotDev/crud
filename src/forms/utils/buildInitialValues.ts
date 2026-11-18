// packages/features/crud/src/forms/utils/buildInitialValues.ts

/**
 * @fileoverview Initial values builders for CRUD forms
 * @description
 * - buildSchemaDefaults: compute create-mode defaults from entity definition only.
 * - buildInitialFromRecord: project an existing DB record onto the form values
 *   (the fields the form writes) and apply type-specific normalizations
 *   (switch, price, etc.).
 *
 * These helpers provide a single, canonical "initialValues" snapshot that
 * React Hook Form can use as its dirty baseline. Fields the form does not write
 * (generated, technical, `editable: false`, role-denied) never enter it: the
 * form reads them from `form.record`.
 */

import { createStatus } from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

import { EMPTY_VALUE } from './emptyValue';

/** Field types edited through a text input: empty is EMPTY_VALUE, never ''. */
const TEXT_LIKE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textarea',
  'email',
  'url',
  'tel',
  'iban',
  'password',
  'color',
]);

/** What the form state holds: the fields the form writes (`writableFields`). */
export interface FormProjection {
  /** Field names the form writes, i18n companions included (`writableFields`) */
  fields: ReadonlySet<string>;
  /** Keep the record's `id` (edit of the record itself, not of an extension row) */
  keepId?: boolean;
}

/**
 * Build initial values for an existing DB record, projected onto the form values.
 *
 * - Keeps only the fields the form writes (`projection.fields`) and, with
 *   `keepId`, the record id: generated, technical, `editable: false` and
 *   role-denied values never enter form state, the local draft or the payload.
 * - For each written field:
 *   - If the record has a non-null, non-undefined value, keep it.
 *   - Otherwise, apply the same type-specific defaults we use in forms.
 *
 * @param entity - Entity from `defineEntity()`
 * @param record - Stored row (or create defaults), already filtered by the backend
 * @param projection - Fields the form writes (`writableFields(entity, role, op)`)
 * @returns The form values
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function buildInitialFromRecord(
  entity: AnyEntity,
  record: Readonly<Record<string, unknown>>,
  projection: FormProjection
): Record<string, unknown> {
  const { fields, keepId = false } = projection;
  const normalized: Record<string, unknown> = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => fields.has(key) || (keepId && key === 'id')
    )
  );

  Object.entries(entity.fields).forEach(([fieldName, fieldConfig]) => {
    if (!fields.has(fieldName)) return;
    // Adapters return rows keyed by entity field names (Supabase: entity-aware mapper).
    const value = normalized[fieldName];
    const absent = !(fieldName in normalized);
    const useDefault = absent || value === null || value === undefined;

    // Status: CRUD rule 7 (`createStatus`, core/schemas crud/create): the default
    // `available`; a draft is opt-in (the caller passes `status: 'draft'`).
    if (fieldName === 'status' && useDefault) {
      normalized[fieldName] = createStatus(undefined);
    } else if (TEXT_LIKE_TYPES.has(fieldConfig.type)) {
      // Not filled in = EMPTY_VALUE, also for a '' stored by older form versions.
      if (useDefault || value === '') normalized[fieldName] = EMPTY_VALUE;
    } else if (fieldConfig.type === 'switch') {
      if (value === null || value === undefined) {
        const fieldSpecific = fieldConfig.options?.fieldSpecific as
          | { uncheckedValue?: string | boolean }
          | undefined;
        normalized[fieldName] = fieldSpecific?.uncheckedValue ?? false;
      }
    } else if (useDefault) {
      // Schema field missing or null in DB: use type default so field shows in form.
      if (fieldConfig.type === 'price') {
        normalized[fieldName] = null;
      } else if (
        fieldConfig.type === 'checkbox' ||
        fieldConfig.type === 'boolean'
      ) {
        normalized[fieldName] = false;
      } else if (
        fieldConfig.type === 'number' ||
        fieldConfig.type === 'range' ||
        fieldConfig.type === 'rating'
      ) {
        // Empty number-like inputs: prefer undefined so we don't force 0,
        // and let the component decide how to render the empty state.
        normalized[fieldName] = undefined;
      }
      // Other types: leave undefined so field still renders with empty value.
    }
  });

  return normalized;
}

/**
 * Build schema defaults for create-mode forms.
 *
 * - Starts from an empty record and applies the same type-specific defaults as
 *   buildInitialFromRecord, for the fields the form writes.
 * - This represents "what a brand-new object would look like" before any user edits.
 *
 * @param entity - Entity from `defineEntity()`
 * @param fields - Field names the form writes on create (`writableFields(entity, role, 'create')`)
 * @returns The create defaults
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function buildSchemaDefaults(
  entity: AnyEntity,
  fields: ReadonlySet<string>
): Record<string, unknown> {
  // Reuse the same normalization logic on an empty record.
  return buildInitialFromRecord(entity, {}, { fields });
}
