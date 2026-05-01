'use client';
// packages/features/crud/src/components/controlled/complex/ControlledRichTextField.tsx

import { Controller } from 'react-hook-form';

import { RichTextComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledRichTextField - Explicit controlled component for rich text editor

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledRichTextField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, placeholder, required, t } = props;

  const { name, label, validation, options = {} } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <RichTextComponent
          label={t(label)}
          value={field.value ?? ''}
          onChange={(value) => field.onChange(value)}
          error={fieldState.error?.message as string | undefined}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          placeholder={placeholder || options.placeholder}
          className={options.className}
        />
      )}
    />
  );
}
