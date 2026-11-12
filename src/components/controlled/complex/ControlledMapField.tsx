'use client';
// packages/features/crud/src/components/controlled/complex/ControlledMapField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { MapFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledMapField - Explicit controlled component for map data inputs

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledMapField(props: ControlledFieldProps): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        // why: mirrors MapFieldComponent's public onChange type; `'target' in value` cannot narrow a Record<string, unknown> branch away
        const handleChange = (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: see the why: comment above
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
            helperText={fieldState.error?.message}
            required={required}
          />
        );
      }}
    />
  );
}
