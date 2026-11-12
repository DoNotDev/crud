'use client';
// packages/features/crud/src/components/controlled/input/ControlledPriceField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { PriceFieldComponent } from '../../form/fields';
import type { PriceValue } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**
 * ControlledPriceField - Controlled component for structured price (amount, currency, VAT, discount %).
 * Value: { amount, currency?, vatIncluded?, discountPercent? }.
 */
export function ControlledPriceField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};
  // why: @donotdev/core declares no fieldSpecific shape for this field type, and FieldType is erased at registry dispatch
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
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        // why: RHF types field.value as any for FieldValues; this names the stored price shape
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
            helperText={fieldState.error?.message}
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
