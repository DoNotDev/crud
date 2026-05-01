'use client';
// packages/features/crud/src/components/controlled/file/ControlledMultiDocumentField.tsx

import { Controller } from 'react-hook-form';

import { DocumentFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledMultiDocumentField - Explicit controlled component for multiple document uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledMultiDocumentField(
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
          <DocumentFieldComponent
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
