'use client';
// packages/features/crud/src/components/controlled/complex/ControlledTimestampField.tsx

import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { TimestampFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledTimestampField - Explicit controlled component for timestamp inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledTimestampField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <TimestampFieldComponent
          {...field}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={fieldState.error?.message}
          required={required}
        />
      )}
    />
  );
}
