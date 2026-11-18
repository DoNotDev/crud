'use client';
// packages/features/crud/src/components/controlled/input/ControlledTextareaField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { fromInputValue } from '../../../forms/utils';
import { TextAreaComponent } from '../../form/fields';
import { controlledFieldOptions, fieldInfo } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledTextareaField - Explicit controlled component for textarea inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledTextareaField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;

  const options = controlledFieldOptions(fieldConfig);

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <TextAreaComponent
          {...field}
          label={t(label)}
          info={fieldInfo(fieldConfig, t)}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(fromInputValue(e.target.value))}
          error={fieldState.error?.message}
          helperText={fieldState.error?.message}
          required={required}
          placeholder={placeholder || options.placeholder}
          maxLength={validation?.maxLength}
          showCharCount={options.showCharCount}
          autoResize={options.autoResize}
          rows={options.rows}
          className={options.className}
        />
      )}
    />
  );
}
