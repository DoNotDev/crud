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

import { useCallback, useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control, FieldValues } from 'react-hook-form';

import { evaluateFieldConditions } from '@donotdev/core';
import type { ConditionResult } from '@donotdev/core';

import type { RenderableField } from '../forms/utils/getFieldsForOperation';

/** Stable identity — forms without conditional fields must never re-render on it. */
const EMPTY_CONDITIONS: Record<string, ConditionResult> = {};

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
  // Only the fields that actually declare conditions — the rest never affect the result
  const conditionFields = useMemo(
    () => fields.filter((f) => f.config.conditions),
    [fields]
  );

  /**
   * Derive the condition results from the form values.
   *
   * Passed to useWatch as `compute`, so the subscription re-renders the caller
   * only when a condition *outcome* changes — not on every keystroke. Forms with
   * no conditional fields return the same empty object and never re-render at all.
   * Evaluating a handful of comparisons per change is far cheaper than re-rendering
   * every field in the form.
   */
  const compute = useCallback(
    (values: TFieldValues): Record<string, ConditionResult> => {
      if (conditionFields.length === 0) return EMPTY_CONDITIONS;

      const results: Record<string, ConditionResult> = {};
      for (const field of conditionFields) {
        results[field.name] = evaluateFieldConditions(
          field.config.conditions!,
          values as Record<string, unknown>
        );
      }
      return results;
    },
    [conditionFields]
  );

  return useWatch({ control, compute }) as Record<string, ConditionResult>;
}
