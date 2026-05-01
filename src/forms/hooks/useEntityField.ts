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

import type { AnyEntity, EntityField } from '@donotdev/core';

import { useController } from './useController';
import { formatValue } from '../../components/DisplayFieldRenderer';
import { isFieldEditable } from '../utils';

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
 * - `display(options?)` formats the current value using the registered field type formatter.
 *
 * @template E - Entity type from defineEntity()
 * @template K - Field key from entity
 * @param form - Form instance from useEntityForm
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
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function useEntityField<
  E extends AnyEntity,
  K extends keyof InferEntityData<E>,
>(form: EntityFormReturn<E>, fieldName: K): EntityFieldReturn<E, K> {
  const { entity, operation, viewerRole, fields } = form;

  // Get the field definition from entity
  const fieldDef = entity.fields[fieldName as string] as
    | EntityField
    | undefined;

  // Get field config (defineEntity ensures name/label are set)
  const config: EntityField = useMemo(() => {
    if (!fieldDef) {
      // Fallback for missing field
      return {
        name: fieldName as string,
        type: 'text',
        label: fieldName as string,
        visibility: 'user',
      } as EntityField;
    }
    // defineEntity ensures name/label are set, but we ensure type safety
    return {
      ...fieldDef,
      name: fieldDef.name || (fieldName as string),
      label: fieldDef.label || (fieldName as string),
    } as EntityField;
  }, [fieldName, fieldDef]);

  // Check if field is in the filtered list (visible)
  const isVisible = useMemo(
    () => fields.some((f) => f.name === fieldName),
    [fields, fieldName]
  );

  // Compute editability
  const isEditable = useMemo(() => {
    // If not visible, not editable
    if (!isVisible) return false;

    // Technical fields default to read-only in edit mode, unless explicitly overridden
    if (
      operation === 'edit' &&
      config.visibility === 'technical' &&
      config.editable === undefined
    ) {
      return false;
    }

    return isFieldEditable(config.editable, viewerRole, operation);
  }, [isVisible, operation, config.visibility, config.editable, viewerRole]);

  // Use React Hook Form's useController for field state
  // Cast to any to avoid complex generic type issues with FieldPath
  const { field, fieldState } = useController({
    name: fieldName as any,
    control: form.control,
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

  // Display formatter using registered field type formatter
  const display = useCallback(
    (options?: { compact?: boolean; asString?: boolean }) =>
      formatValue(field.value, config, form.t, options),
    [field.value, config, form.t]
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
