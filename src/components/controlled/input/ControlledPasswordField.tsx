'use client';
// packages/features/crud/src/components/controlled/input/ControlledPasswordField.tsx

import { Controller } from 'react-hook-form';

import { PasswordFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledPasswordField - Explicit controlled component for password inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledPasswordField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options = {} } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <PasswordFieldComponent
          {...field}
          label={t(label)}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          placeholder={placeholder || options.placeholder}
          className={options.className}
        />
      )}
    />
  );
}
