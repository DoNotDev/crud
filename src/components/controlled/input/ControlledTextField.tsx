'use client';
// packages/features/crud/src/components/controlled/input/ControlledTextField.tsx

import { Controller } from 'react-hook-form';

import { TextFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { TextFieldComponentProps } from '../../form/fields';
import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledTextField - Text input controlled by react-hook-form
 *
 * Uses Controller to keep value in sync with RHF state.
 * register() is incompatible with TextFieldComponent's controlled
 * `<Input value={value}>` — default values are overwritten on re-render.
 */
export function ControlledTextField(props: ControlledFieldProps): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options = {} } = fieldConfig;

  const rules = validation ? convertValidationRules(validation) : undefined;

  const inputType: TextFieldComponentProps['type'] =
    fieldConfig.type === 'email'
      ? 'email'
      : fieldConfig.type === 'url'
        ? 'url'
        : fieldConfig.type === 'color'
          ? 'color'
          : 'text';

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={rules}
      render={({ field, fieldState }) => (
        <TextFieldComponent
          ref={field.ref}
          name={field.name}
          value={field.value ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          label={t(label)}
          error={fieldState.error?.message as string | undefined}
          helperText={fieldState.error?.message as string | undefined}
          type={inputType}
          required={required}
          placeholder={placeholder || (options as any).placeholder}
          maxLength={validation?.maxLength}
          showCharCount={(options as any).showCharCount}
          className={(options as any).className}
        />
      )}
    />
  );
}
