'use client';
// packages/features/crud/src/components/controlled/input/ControlledPhoneField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { fromInputValue } from '../../../forms/utils';
import { PhoneNumberComponent } from '../../form/fields';
import { fieldInfo } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledPhoneField - Explicit controlled component for phone inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledPhoneField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <PhoneNumberComponent
          ref={field.ref}
          name={field.name}
          onBlur={field.onBlur}
          label={t(label)}
          info={fieldInfo(fieldConfig, t)}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={(e) => field.onChange(fromInputValue(e.target.value))}
          error={fieldState.error?.message}
          required={required}
        />
      )}
    />
  );
}
