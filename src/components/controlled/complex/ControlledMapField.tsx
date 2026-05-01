'use client';
// packages/features/crud/src/components/controlled/complex/ControlledMapField.tsx

import { Controller } from 'react-hook-form';

import { MapFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledMapField - Explicit controlled component for map data inputs

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledMapField(props: ControlledFieldProps): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (
          value: Record<string, any> | React.ChangeEvent<HTMLInputElement>
        ) => {
          if ('target' in value) {
            // Event - parse JSON

            try {
              const parsed = JSON.parse(value.target.value);

              field.onChange(parsed);
            } catch {
              field.onChange({});
            }
          } else {
            // Direct value

            field.onChange(value || {});
          }
        };

        return (
          <MapFieldComponent
            label={t(label)}
            value={field.value || {}}
            onChange={handleChange}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
          />
        );
      }}
    />
  );
}
