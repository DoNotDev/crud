'use client';
// packages/features/crud/src/components/controlled/input/ControlledPhoneField.tsx

import { Controller } from 'react-hook-form';

import { PhoneNumberComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledPhoneField - Explicit controlled component for phone inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledPhoneField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <PhoneNumberComponent
          label={t(label)}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={(e) => field.onChange(e.target.value || '')}
          error={fieldState.error?.message as string | undefined}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
        />
      )}
    />
  );
}
