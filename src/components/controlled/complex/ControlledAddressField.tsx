'use client';
// packages/features/crud/src/components/controlled/complex/ControlledAddressField.tsx

import { Controller } from 'react-hook-form';

import { AddressFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledAddressField - Explicit controlled component for address inputs

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledAddressField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  const fieldSpecific = options.fieldSpecific as
    | { enableGoogleMaps?: boolean; extractDistrictCode?: boolean }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <AddressFieldComponent
          label={t(label)}
          value={field.value ?? undefined}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          enableGoogleMaps={fieldSpecific?.enableGoogleMaps}
          extractDistrictCode={fieldSpecific?.extractDistrictCode}
        />
      )}
    />
  );
}
