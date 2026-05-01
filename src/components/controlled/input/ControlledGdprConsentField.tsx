'use client';
// packages/features/crud/src/components/controlled/input/ControlledGdprConsentField.tsx

import { Controller } from 'react-hook-form';

import { GdprConsentFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ChangeEvent, ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledGdprConsentField - GDPR-compliant consent checkbox with automatic label generation
 * Uses standard React Hook Form Controller pattern
 */
export function ControlledGdprConsentField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required } = props;

  const { name, validation, options = {} } = fieldConfig;

  // Extract GDPR-specific options from fieldSpecific (typed via UIFieldOptions<gdprConsent>)
  const fieldSpecific = options.fieldSpecific as
    | {
        privacyPolicyPath?: string;
        termsPath?: string;
      }
    | undefined;

  const privacyPolicyPath =
    fieldSpecific?.privacyPolicyPath || '/legal/privacy';
  const termsPath = fieldSpecific?.termsPath || '/legal/terms';

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field }) => {
        // Handle both boolean (legacy) and object (new) formats
        const currentValue = field.value;
        const isChecked =
          typeof currentValue === 'object' && currentValue !== null
            ? Boolean(currentValue.gdprConsent)
            : Boolean(currentValue);

        const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
          const checked = e.target.checked;
          if (checked) {
            // When checked, set object with metadata
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            field.onChange({
              gdprConsent: true,
              gdprConsentDate: new Date().toISOString(),
              gdprConsentVersion: today,
            });
          } else {
            // When unchecked, set false - validation rules from entity will handle required check
            field.onChange(false);
          }
        };

        return (
          <GdprConsentFieldComponent
            checked={isChecked}
            onChange={handleChange}
            required={required}
            privacyPolicyPath={privacyPolicyPath}
            termsPath={termsPath}
          />
        );
      }}
    />
  );
}
