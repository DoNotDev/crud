'use client';
// packages/features/crud/src/components/controlled/input/ControlledPasswordField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { fromInputValue } from '../../../forms/utils';
import { PasswordFieldComponent } from '../../form/fields';
import { fieldInfo } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledPasswordField - Explicit controlled component for password inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledPasswordField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options = {} } = fieldConfig;

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <PasswordFieldComponent
          {...field}
          label={t(label)}
          info={fieldInfo(fieldConfig, t)}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(fromInputValue(e.target.value))}
          error={fieldState.error?.message}
          required={required}
          placeholder={placeholder || options.placeholder}
          className={options.className}
        />
      )}
    />
  );
}
