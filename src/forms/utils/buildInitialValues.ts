// packages/features/crud/src/forms/utils/buildInitialValues.ts

/**
 * @fileoverview Initial values builders for CRUD forms
 * @description
 * - buildSchemaDefaults: compute create-mode defaults from entity definition only.
 * - buildInitialFromRecord: overlay schema defaults with an existing DB record
 *   and apply type-specific normalizations (switch, price, etc.).
 *
 * These helpers provide a single, canonical "initialValues" snapshot that
 * React Hook Form can use as its dirty baseline.
 */

import type { AnyEntity } from '@donotdev/core';

import type { InferEntityData } from '../types';

/** Try fieldName first, then camelCase variant (handles Supabase fieldMapper output). */
function resolveValue(
  record: Record<string, unknown>,
  fieldName: string
): unknown {
  if (fieldName in record) return record[fieldName];
  // snake_case → camelCase fallback
  const camel = fieldName.replace(/_([a-z])/g, (_, c: string) =>
    c.toUpperCase()
  );
  if (camel !== fieldName && camel in record) return record[camel];
  return undefined;
}

function isPresent(
  record: Record<string, unknown>,
  fieldName: string
): boolean {
  if (fieldName in record) return true;
  const camel = fieldName.replace(/_([a-z])/g, (_, c: string) =>
    c.toUpperCase()
  );
  return camel !== fieldName && camel in record;
}

/**
 * Build initial values for an existing DB record.
 *
 * - Starts from the raw record (already filtered/masked by the backend).
 * - For each field in the entity:
 *   - If the record has a non-null, non-undefined value, keep it.
 *   - Otherwise, apply the same type-specific defaults we use in forms.
 */
export function buildInitialFromRecord<E extends AnyEntity>(
  entity: E,
  record: Partial<InferEntityData<E>>
): Partial<InferEntityData<E>> {
  const defaultValues = (record ?? {}) as Record<string, unknown>;
  const normalized = { ...defaultValues } as Record<string, unknown>;

  Object.entries(entity.fields).forEach(([fieldName, fieldConfig]) => {
    // Resolve value with camelCase fallback (Supabase fieldMapper returns camelCase)
    const value = resolveValue(normalized, fieldName);
    // Write back under the entity field name so RHF field names match
    if (value !== undefined && !(fieldName in normalized)) {
      normalized[fieldName] = value;
    }
    const absent = !isPresent(defaultValues, fieldName);
    const useDefault = absent || value === null || value === undefined;

    // Status field defaults to 'draft' on create (empty record).
    // Entities start as drafts — this activates draftResolver in useEntityForm
    // so partial saves work without hitting required-field validation.
    if (fieldName === 'status' && useDefault) {
      normalized[fieldName] = 'draft';
    } else if (fieldConfig.type === 'switch') {
      if (value === null || value === undefined) {
        const fieldSpecific = fieldConfig.options?.fieldSpecific as
          | { uncheckedValue?: string | boolean }
          | undefined;
        normalized[fieldName] = fieldSpecific?.uncheckedValue ?? false;
      }
    } else if (useDefault) {
      // Schema field missing or null in DB: use type default so field shows in form.
      // Use same empty values as controlled inputs so RHF does not mark form dirty on load.
      if (fieldConfig.type === 'price') {
        normalized[fieldName] = null;
      } else if (
        fieldConfig.type === 'checkbox' ||
        fieldConfig.type === 'boolean'
      ) {
        normalized[fieldName] = false;
      } else if (
        fieldConfig.type === 'text' ||
        fieldConfig.type === 'textarea' ||
        fieldConfig.type === 'email' ||
        fieldConfig.type === 'url' ||
        fieldConfig.type === 'tel' ||
        fieldConfig.type === 'iban' ||
        fieldConfig.type === 'password' ||
        fieldConfig.type === 'color'
      ) {
        normalized[fieldName] = '';
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

  return normalized as Partial<InferEntityData<E>>;
}

/**
 * Build schema defaults for create-mode forms.
 *
 * - Starts from an empty record and applies the same type-specific defaults as
 *   buildInitialFromRecord.
 * - This represents "what a brand-new object would look like" before any user edits.
 */
export function buildSchemaDefaults<E extends AnyEntity>(
  entity: E
): Partial<InferEntityData<E>> {
  // Reuse the same normalization logic on an empty record.
  return buildInitialFromRecord(entity, {} as Partial<InferEntityData<E>>);
}
