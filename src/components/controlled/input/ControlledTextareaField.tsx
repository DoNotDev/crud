'use client';
// packages/features/crud/src/components/controlled/input/ControlledTextareaField.tsx

import { Controller } from 'react-hook-form';

import { TextAreaComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledTextareaField - Explicit controlled component for textarea inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledTextareaField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <TextAreaComponent
          {...field}
          label={t(label)}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={fieldState.error?.message as string | undefined}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          placeholder={placeholder || options.placeholder}
          maxLength={validation?.maxLength}
          showCharCount={(options as any).showCharCount}
          autoResize={(options as any).autoResize}
          rows={(options as any).rows}
          className={(options as any).className}
        />
      )}
    />
  );
}
