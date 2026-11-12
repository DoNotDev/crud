'use client';
// packages/features/crud/src/components/controlled/complex/ControlledAddressField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { AddressFieldComponent } from '../../form/fields';
import { fieldSpecificOf } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledAddressField - Explicit controlled component for address inputs

 * NO ref forwarding - complex component handles its own refs

 */

export function ControlledAddressField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};

  const fieldSpecific = fieldSpecificOf<'address'>(fieldConfig);

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <AddressFieldComponent
          label={t(label)}
          value={field.value ?? undefined}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          required={required}
          enableGoogleMaps={fieldSpecific?.enableGoogleMaps}
          extractDistrictCode={fieldSpecific?.extractDistrictCode}
        />
      )}
    />
  );
}
