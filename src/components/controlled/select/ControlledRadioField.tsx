'use client';
// packages/features/crud/src/components/controlled/select/ControlledRadioField.tsx

import { useMemo } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { translateLabel } from '../../../forms/utils';
import { RadioFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledRadioField - Explicit controlled component for radio inputs
 *
 * Forwards Controller's ref for focus/validation (simple input)
 *
 * Handles dynamic options
 */
export function ControlledRadioField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  // dependsOn: watch only the parent field, not the entire form
  const dependsOn =
    'dependsOn' in fieldConfig ? fieldConfig.dependsOn : undefined;
  const dependsOnField = dependsOn
    ? (dependsOn as { field: Path<FieldValues> }).field
    : undefined;

  const hasDynamicOptions = typeof validation?.options === 'function';

  // Watch ONLY the parent field (scoped subscription, no cascade re-renders)
  const parentValue = useWatch({
    control,
    name: dependsOnField as Path<FieldValues>,
    disabled: !dependsOnField,
  });

  // Resolve options - support static arrays and dynamic functions
  const radioOptions = useMemo(() => {
    const options = validation?.options;
    if (!options) return [];

    if (typeof options === 'function') {
      const context = dependsOnField ? { [dependsOnField]: parentValue } : {};
      return options(context);
    }

    return options as Array<{ value: string; label: string }>;
  }, [validation?.options, hasDynamicOptions, dependsOnField, parentValue]);

  // Translate option labels

  const translatedOptions = useMemo(() => {
    return radioOptions.map((opt) => ({
      value: String(opt.value),

      label: translateLabel(opt.label, t),
    }));
  }, [radioOptions, t]);

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <RadioFieldComponent
          {...field}
          label={t(label)}
          value={field.value ?? undefined}
          onChange={(value) => {
            const newValue =
              typeof value === 'string' ? value : value.target.value;

            field.onChange(newValue);
          }}
          options={translatedOptions}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
        />
      )}
    />
  );
}
