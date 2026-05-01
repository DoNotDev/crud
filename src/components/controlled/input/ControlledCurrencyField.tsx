'use client';
// packages/features/crud/src/components/controlled/input/ControlledCurrencyField.tsx

import { Controller } from 'react-hook-form';

import { CurrencyFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledCurrencyField - Explicit controlled component for currency inputs
 * Uses CurrencyFieldComponent with currency code from field options
 */
export function ControlledCurrencyField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  const fieldSpecific = options.fieldSpecific as
    | { currency?: string; locale?: string }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        // CurrencyFieldComponent expects value in cents, but we store as regular number
        // Convert to cents for display/input, convert back on change
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          // CurrencyFieldComponent returns value in cents via e.target.value
          const cents = e.target.value;
          if (cents === null || cents === undefined || cents === '') {
            field.onChange(null);
            return;
          }
          // Convert cents back to regular number
          const numValue =
            typeof cents === 'number'
              ? cents / 100
              : parseFloat(String(cents)) / 100;
          if (!isNaN(numValue)) {
            field.onChange(numValue);
          } else {
            field.onChange(null);
          }
        };

        // Convert regular number to cents for CurrencyFieldComponent
        const centsValue =
          field.value != null && !isNaN(field.value as number)
            ? Math.round((field.value as number) * 100)
            : undefined;

        return (
          <CurrencyFieldComponent
            label={t(label)}
            value={centsValue}
            onChange={handleChange}
            currency={fieldSpecific?.currency || 'EUR'}
            locale={fieldSpecific?.locale}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            placeholder={placeholder}
          />
        );
      }}
    />
  );
}
