'use client';
// packages/features/crud/src/components/controlled/complex/ControlledGeoPointField.tsx

import { Controller } from 'react-hook-form';

import { GeoPointFieldComponent, type GeoPoint } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledGeoPointField - Explicit controlled component for geographic coordinates

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledGeoPointField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (
          value: GeoPoint | React.ChangeEvent<HTMLInputElement>
        ) => {
          if ('target' in value) {
            // Event - parse JSON

            try {
              const parsed = JSON.parse(value.target.value);

              field.onChange(parsed);
            } catch {
              field.onChange({ lat: 0, lng: 0 });
            }
          } else {
            // Direct value

            field.onChange(value || { lat: 0, lng: 0 });
          }
        };

        return (
          <GeoPointFieldComponent
            label={t(label)}
            value={field.value || { lat: 0, lng: 0 }}
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
