'use client';
// packages/features/crud/src/components/controlled/input/ControlledRangeField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { RangeFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledRangeField - Explicit controlled component for range inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledRangeField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  return (
    <Controller
      name={name}
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
          helperText={fieldState.error?.message}
          required={required}
          min={validation?.min}
          max={validation?.max}
          step={options.step}
          showValue={options.showValue}
        />
      )}
    />
  );
}
