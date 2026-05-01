'use client';
// packages/features/crud/src/components/controlled/file/ControlledMultiFileField.tsx

import { Controller } from 'react-hook-form';

import { FileFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledMultiFileField - Explicit controlled component for multiple file uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledMultiFileField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        // Normalize value to array

        const arrayValue = Array.isArray(field.value)
          ? field.value
          : field.value
            ? [field.value]
            : null;

        return (
          <FileFieldComponent
            name={name}
            label={t(label)}
            value={arrayValue}
            onChange={(value) => field.onChange(value)}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            multiple={true}
            maxFiles={(options as any).maxFiles ?? 10}
            maxSize={(options as any).maxSize}
            storagePath={(options as any).storagePath}
          />
        );
      }}
    />
  );
}
