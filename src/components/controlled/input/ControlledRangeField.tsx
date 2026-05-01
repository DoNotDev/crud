'use client';
// packages/features/crud/src/components/controlled/input/ControlledRangeField.tsx

import { Controller } from 'react-hook-form';

import { RangeFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledRangeField - Explicit controlled component for range inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledRangeField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  const fieldSpecific = options.fieldSpecific as
    | { showValue?: boolean }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <RangeFieldComponent
          label={t(label)}
          value={field.value ?? undefined}
          onChange={(value) => {
            if (typeof value === 'number') {
              field.onChange(value);
            } else {
              field.onChange(Number(value.target.value) || 0);
            }
          }}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          min={validation?.min}
          max={validation?.max}
          step={options.step}
          showValue={fieldSpecific?.showValue}
        />
      )}
    />
  );
}
