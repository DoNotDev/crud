'use client';
// packages/features/crud/src/components/controlled/input/ControlledPriceField.tsx

import { Controller } from 'react-hook-form';

import { PriceFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { PriceValue } from '../../form/fields';
import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledPriceField - Controlled component for structured price (amount, currency, VAT, discount %).
 * Value: { amount, currency?, vatIncluded?, discountPercent? }.
 */
export function ControlledPriceField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};
  const fieldSpecific = options.fieldSpecific as
    | {
        defaultCurrency?: string;
        optionsTitle?: string;
        /** Allowed currencies (e.g. ['EUR'] for single-currency) */
        currencies?: string[];
      }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const value = field.value as PriceValue | null | undefined;
        const handleChange = (next: PriceValue) => {
          field.onChange(next);
        };

        return (
          <PriceFieldComponent
            label={t(label)}
            value={value ?? undefined}
            onChange={handleChange}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            placeholder={placeholder}
            defaultCurrency={fieldSpecific?.defaultCurrency ?? 'EUR'}
            optionsTitle={fieldSpecific?.optionsTitle}
            currencies={fieldSpecific?.currencies}
          />
        );
      }}
    />
  );
}
