'use client';
// packages/features/crud/src/components/controlled/file/ControlledFileField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { FileFieldComponent } from '../../form/fields';
import { uploadFieldSpecific } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledFileField - Explicit controlled component for file uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledFileField(props: ControlledFieldProps): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const fieldSpecific = uploadFieldSpecific(fieldConfig);

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <FileFieldComponent
          name={name}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          required={required}
          multiple={false}
          maxFiles={1}
          maxSize={fieldSpecific?.maxSize}
          storagePath={fieldSpecific?.storagePath}
        />
      )}
    />
  );
}
