'use client';
// packages/features/crud/src/components/controlled/file/ControlledDocumentField.tsx

import { Controller } from 'react-hook-form';

import { DocumentFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledDocumentField - Explicit controlled component for document uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledDocumentField(
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
      render={({ field, fieldState }) => (
        <DocumentFieldComponent
          name={name}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          multiple={false}
          maxFiles={1}
          maxSize={(options as any).maxSize}
          storagePath={(options as any).storagePath}
        />
      )}
    />
  );
}
