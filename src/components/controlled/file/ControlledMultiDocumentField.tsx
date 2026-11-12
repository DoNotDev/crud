'use client';
// packages/features/crud/src/components/controlled/file/ControlledMultiDocumentField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { DocumentFieldComponent } from '../../form/fields';
import { controlledFieldOptions, uploadFieldSpecific } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledMultiDocumentField - Explicit controlled component for multiple document uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledMultiDocumentField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = controlledFieldOptions(fieldConfig);
  const fieldSpecific = uploadFieldSpecific(fieldConfig);

  return (
    <Controller
      name={name}
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
            helperText={fieldState.error?.message}
            required={required}
            multiple={true}
            maxFiles={options.maxFiles ?? 10}
            maxSize={fieldSpecific?.maxSize}
            storagePath={fieldSpecific?.storagePath}
          />
        );
      }}
    />
  );
}
