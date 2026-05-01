'use client';
// packages/features/crud/src/hooks/useFieldConditions.ts

/**
 * @fileoverview useFieldConditions hook
 * @description Evaluates field conditions against current form values using React Hook Form's useWatch.
 * Returns computed visibility, disabled, required, and readonly states per field.
 *
 * @example
 * ```typescript
 * const conditions = useFieldConditions(fields, control);
 * // conditions['licensePlate'] = { visible: false, disabled: false, required: false, readonly: false }
 *
 * if (!conditions[fieldName]?.visible) return null; // hide field
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { evaluateFieldConditions } from '@donotdev/core';
import type { ConditionResult } from '@donotdev/core';

import type { RenderableField } from '../forms/utils/getFieldsForOperation';
import type { Control, FieldValues } from 'react-hook-form';

/**
 * Evaluate field conditions against live form values.
 *
 * @param fields - Array of renderable fields (from useEntityForm or getFieldsForOperation)
 * @param control - React Hook Form control object
 * @returns Record mapping field names to their computed condition states.
 *         Fields without conditions are not included — treat missing entries as defaults.
 *
 * @example
 * ```tsx
 * function MyForm({ entity }) {
 *   const { fields, control } = useEntityForm(entity, { operation: 'create' });
 *   const conditions = useFieldConditions(fields, control);
 *
 *   return fields.map(({ name, config }) => {
 *     const cond = conditions[name];
 *     if (cond && !cond.visible) return null;
 *     return <FormField key={name} disabled={cond?.disabled} required={cond?.required} />;
 *   });
 * }
 * ```
 */
export function useFieldConditions<
  TFieldValues extends FieldValues = FieldValues,
>(
  fields: readonly RenderableField[],
  control: Control<TFieldValues>
): Record<string, ConditionResult> {
  // Watch all form values — useWatch returns the entire form state
  const formValues = useWatch({ control }) as Record<string, unknown>;

  // Check if any field has conditions (avoid unnecessary computation)
  const hasConditions = useMemo(
    () => fields.some((f) => f.config.conditions),
    [fields]
  );

  return useMemo(() => {
    if (!hasConditions) return {};

    const results: Record<string, ConditionResult> = {};
    for (const field of fields) {
      if (field.config.conditions) {
        results[field.name] = evaluateFieldConditions(
          field.config.conditions,
          formValues
        );
      }
    }
    return results;
  }, [fields, formValues, hasConditions]);
}
