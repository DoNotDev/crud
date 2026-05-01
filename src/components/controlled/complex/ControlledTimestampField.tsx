'use client';
// packages/features/crud/src/components/controlled/complex/ControlledTimestampField.tsx

import { Controller } from 'react-hook-form';

import { TimestampFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledTimestampField - Explicit controlled component for timestamp inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledTimestampField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <TimestampFieldComponent
          {...field}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={fieldState.error?.message as string | undefined}
          required={required}
        />
      )}
    />
  );
}
