'use client';
// packages/features/crud/src/components/controlled/complex/ControlledMultiInputField.tsx

import { Controller } from 'react-hook-form';

import { MultiInputTextFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledMultiInputField - Explicit controlled component for array of text inputs

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledMultiInputField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation, options = {} } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field }) => {
        const handleChange = (
          value: string[] | React.ChangeEvent<HTMLInputElement>
        ) => {
          if (Array.isArray(value)) {
            field.onChange(value);
          } else {
            // Event - parse JSON

            try {
              const parsed = JSON.parse(value.target.value);

              field.onChange(Array.isArray(parsed) ? parsed : []);
            } catch {
              field.onChange([]);
            }
          }
        };

        return (
          <MultiInputTextFieldComponent
            label={t(label)}
            value={Array.isArray(field.value) ? field.value : []}
            onChange={handleChange}
            required={required}
            className={options.className}
          />
        );
      }}
    />
  );
}
