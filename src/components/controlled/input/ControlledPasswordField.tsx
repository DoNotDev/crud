'use client';
// packages/features/crud/src/components/controlled/input/ControlledPasswordField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { PasswordFieldComponent } from '../../form/fields';
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
          value={field.value ?? ''}
          onChange={field.onChange}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          required={required}
          placeholder={placeholder || options.placeholder}
          className={options.className}
        />
      )}
    />
  );
}
