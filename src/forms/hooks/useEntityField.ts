'use client';
// packages/features/crud/src/forms/hooks/useEntityField.ts

/**
 * @fileoverview useEntityField hook
 * @description Granular hook for single field control within an entity form.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useCallback } from 'react';
import type { Control, FieldPath } from 'react-hook-form';

import type {
  AnyEntity,
  EntityExtensions,
  EntityField,
  FieldOperation,
} from '@donotdev/core';

import { useController } from './useController';
import { formatValue } from '../../components/DisplayFieldRenderer';
import type {
  EntityFormReturn,
  InferEntityData,
  EntityFieldReturn,
} from '../types';

/**
 * Granular hook for single field control within an entity form.
 *
 * Useful when you need fine-grained control over field rendering,
 * such as custom components, conditional logic, or complex layouts.
 *
 * Returns `{ field, meta, config, isEditable, isVisible, display }`.
 * - `isEditable` / `isVisible`: as `form.fields` (entity descriptor, viewer role, operation).
 * - `display(options?)` formats the value using the registered field type formatter:
 *   the form value for fields the form writes, `form.record` for the others
 *   (technical, `editable: false`, role-denied: not in form state).
 *
 * @template E - Entity type from defineEntity()
 * @template K - Field key from entity
 * @template Op - The form's operation (inferred from `form`)
 * @template X - The form's 1:1 extensions (inferred from `form`)
 * @param form - Form instance from useEntityForm (any operation, any extensions)
 * @param fieldName - Name of the field to control
 * @returns Field state, config, editability info, and display formatter
 *
 * @example
 * ```tsx
 * // Custom field with display()
 * const { field, display, isEditable } = useEntityField(form, 'price');
 * // display() → "€42.00" (uses registered formatter)
 * // display({ compact: true }) → compact format for lists
 * if (!isEditable) return <span>{display()}</span>;
 * ```
 *
 * @example
 * ```tsx
 * // Full custom field
 * function CustomEmailField({ form }) {
 *   const { field, meta, config, isEditable } = useEntityField(form, 'email');
 *
 *   if (!isEditable) return <span>{field.value}</span>;
 *
 *   return (
 *     <div>
 *       <label>{config.label}</label>
 *       <input
 *         type="email"
 *         value={field.value ?? ''}
 *         onChange={field.onChange}
 *         onBlur={field.onBlur}
 *       />
 *       {meta.error && <span className="error">{meta.error}</span>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useEntityForm} for creating the form instance
 * @see {@link EntityFieldReturn} for return type
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function useEntityField<
  E extends AnyEntity,
  K extends string & keyof InferEntityData<E> & FieldPath<InferEntityData<E>>,
  Op extends FieldOperation = FieldOperation,
  X extends EntityExtensions = Record<never, never>,
>(form: EntityFormReturn<E, Op, X>, fieldName: K): EntityFieldReturn<E, K> {
  const { entity, fields } = form;

  // Get the field definition from entity
  const fieldDef = entity.fields[fieldName];

  // Get field config (defineEntity ensures name/label are set)
  const config: EntityField = useMemo(() => {
    // Typed callers cannot reach this (K is keyof the entity); only an erased entity type can.
    if (!fieldDef) {
      throw new Error(
        `useEntityField: entity "${entity.name}" has no field "${fieldName}".`
      );
    }
    // defineEntity ensures name/label are set, but we ensure type safety
    return {
      ...fieldDef,
      name: fieldDef.name || fieldName,
      label: fieldDef.label || fieldName,
    } as EntityField;
  }, [fieldName, fieldDef]);

  // The field as the form renders it (visible, editable, written), from the descriptor
  const renderable = useMemo(
    () => fields.find((f) => f.name === fieldName),
    [fields, fieldName]
  );
  const isVisible = renderable !== undefined;
  const isEditable = renderable?.editable ?? false;

  // Use React Hook Form's useController for field state
  const { field, fieldState } = useController({
    name: fieldName,
    // why: form state is FormValues (the fields the form writes); useEntityField takes any
    // row field: one the form does not write reads undefined here and displays form.record
    control: form.control as unknown as Control<InferEntityData<E>>,
  });

  // Build meta object
  const meta = useMemo(
    () => ({
      error: fieldState.error?.message,
      touched: fieldState.isTouched,
      isDirty: fieldState.isDirty,
    }),
    [fieldState.error?.message, fieldState.isTouched, fieldState.isDirty]
  );

  // Display formatter: form state for written fields, the stored record for the others
  // (technical, `editable: false`, role-denied: never in form state)
  const displayed = renderable?.written
    ? field.value
    : (form.record as Record<string, unknown> | undefined)?.[fieldName];
  const display = useCallback(
    (options?: { compact?: boolean; asString?: boolean }) =>
      formatValue(displayed, config, form.t, options),
    [displayed, config, form.t]
  );

  return {
    field,
    meta,
    config,
    isEditable,
    isVisible,
    display,
  };
}
