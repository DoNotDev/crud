'use client';
// packages/features/crud/src/components/controlled/select/ControlledReferenceField.tsx

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { useCrudList } from '../../../useCrudList';
import { resolveReferenceEntity } from '../../../utils/referenceEntity';
import ReferenceFieldComponent from '../../form/fields/ReferenceFieldComponent';
import { fieldSpecificOf } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
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
  const { control, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options: fieldOptions = {} } = fieldConfig;

  const collectionName = validation?.reference;

  const fieldSpecific = fieldSpecificOf<'reference'>(fieldConfig);

  // Fetch referenced collection with its entity (registered by defineEntity)
  const referencedEntity = collectionName
    ? resolveReferenceEntity(collectionName, name)
    : undefined;
  const { items, loading } = useCrudList<{ id: string }>(
    referencedEntity ? referencedEntity.collection : '__disabled__',
    { enabled: !!referencedEntity, entity: referencedEntity }
  );

  // Build combobox options
  const referenceOptions = useMemo(() => {
    return items.map((item) => ({
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
      name={name}
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
          helperText={fieldState.error?.message}
          required={required}
          placeholder={placeholder || fieldOptions.placeholder}
        />
      )}
    />
  );
}
