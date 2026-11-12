'use client';
// packages/features/crud/src/components/controlled/input/ControlledTextField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { TextFieldComponent } from '../../form/fields';
import type { TextFieldComponentProps } from '../../form/fields';
import { controlledFieldOptions } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**
 * ControlledTextField - Text input controlled by react-hook-form
 *
 * Uses Controller to keep value in sync with RHF state.
 * register() is incompatible with TextFieldComponent's controlled
 * `<Input value={value}>` — default values are overwritten on re-render.
 */
export function ControlledTextField(props: ControlledFieldProps): ReactElement {
  const { control, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation } = fieldConfig;
  const options = controlledFieldOptions(fieldConfig);

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
      name={name}
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
          error={fieldState.error?.message}
          helperText={fieldState.error?.message}
          type={inputType}
          required={required}
          placeholder={placeholder || options.placeholder}
          maxLength={validation?.maxLength}
          showCharCount={options.showCharCount}
          className={options.className}
        />
      )}
    />
  );
}
