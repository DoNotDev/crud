'use client';
// packages/features/crud/src/components/controlled/input/ControlledNumberField.tsx

import { Controller } from 'react-hook-form';

import { NumberFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledNumberField - Explicit controlled component for number inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledNumberField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  const fieldSpecific = options.fieldSpecific as
    | { mask?: 'currency' | 'mileage' | 'number' }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          if (e.target.value === '' || e.target.value === null) {
            field.onChange(null);

            return;
          }

          try {
            const numValue = parseFloat(e.target.value);

            if (!isNaN(numValue)) {
              field.onChange(numValue);
            }
          } catch {
            field.onChange(0);
          }
        };

        return (
          <NumberFieldComponent
            {...field}
            label={t(label)}
            value={field.value ?? undefined}
            onChange={handleChange}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            min={validation?.min}
            max={validation?.max}
            step={
              fieldSpecific?.mask === 'currency'
                ? 0.01
                : fieldSpecific?.mask === 'mileage'
                  ? 1
                  : undefined
            }
            mask={fieldSpecific?.mask || 'number'}
            className={options.className}
          />
        );
      }}
    />
  );
}
