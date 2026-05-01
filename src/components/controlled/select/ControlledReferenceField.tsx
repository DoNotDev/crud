'use client';
// packages/features/crud/src/components/controlled/select/ControlledReferenceField.tsx

import { useMemo } from 'react';
import { Controller } from 'react-hook-form';

import { useCrudList } from '../../../useCrudList';
import ReferenceFieldComponent from '../../form/fields/ReferenceFieldComponent';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/** Auto-detect fields to use as label from an item's keys */
const AUTO_DETECT_FIELDS = ['name', 'title', 'label', 'displayName'];

/**
 * Build a display label for a referenced item.
 *
 * Resolution order:
 * 1. `labelFields` — join multiple fields (e.g. `['first_name', 'last_name']` → "John Doe")
 * 2. `displayField` — single field
 * 3. Auto-detect: first match from name/title/label/displayName
 * 4. Fallback: document `id`
 */
export function buildReferenceLabel(
  item: Record<string, any>,
  labelFields?: string[],
  displayField?: string
): string {
  // 1. labelFields — join multiple
  if (labelFields?.length) {
    const parts = labelFields
      .map((f) => item[f])
      .filter((v) => v != null && v !== '');
    if (parts.length) return parts.join(' ');
  }

  // 2. displayField — single
  if (displayField && item[displayField] != null && item[displayField] !== '') {
    return String(item[displayField]);
  }

  // 3. Auto-detect
  for (const key of AUTO_DETECT_FIELDS) {
    if (item[key] != null && item[key] !== '') return String(item[key]);
  }

  // 4. Fallback
  return item.id ?? '?';
}

/**
 * ControlledReferenceField — Controlled component for `type: 'reference'` fields.
 *
 * Reads `validation.reference` to determine the collection, auto-fetches items
 * via `useCrudList`, and renders the existing `ReferenceFieldComponent` (Combobox).
 */
export function ControlledReferenceField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options: fieldOptions = {} } = fieldConfig;

  const collectionName = validation?.reference as string | undefined;

  const fieldSpecific = fieldOptions.fieldSpecific as
    | {
        labelFields?: string[];
        displayField?: string;
        searchFields?: string[];
        preloadLimit?: number;
      }
    | undefined;

  // Fetch referenced collection
  const { items, loading } = useCrudList<{ id: string }>(
    collectionName ?? '__disabled__',
    { enabled: !!collectionName }
  );

  // Build combobox options
  const referenceOptions = useMemo(() => {
    return items.map((item: Record<string, any>) => ({
      id: item.id,
      label: buildReferenceLabel(
        item,
        fieldSpecific?.labelFields,
        fieldSpecific?.displayField
      ),
    }));
  }, [items, fieldSpecific?.labelFields, fieldSpecific?.displayField]);

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <ReferenceFieldComponent
          label={t(label)}
          value={field.value ?? ''}
          onChange={(value) => field.onChange(value)}
          onBlur={field.onBlur}
          options={referenceOptions}
          isLoading={loading}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          placeholder={
            placeholder || (fieldOptions.placeholder as string | undefined)
          }
        />
      )}
    />
  );
}
