'use client';
// packages/features/crud/src/components/controlled/complex/ControlledDateField.tsx

import { Controller } from 'react-hook-form';

import { DateFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledDateField - Explicit controlled component for date inputs

 * Forwards Controller's ref for focus/validation (simple input)

 */

export function ControlledDateField(props: ControlledFieldProps): ReactElement {
  const { control, errors, fieldConfig, required, t } = props;

  const { name, label, validation, type } = fieldConfig;

  // Map field type to date mode

  const modeMap: Record<
    string,
    'date' | 'datetime-local' | 'month' | 'time' | 'week'
  > = {
    date: 'date',

    'datetime-local': 'datetime-local',

    month: 'month',

    time: 'time',

    week: 'week',
  };

  const mode = modeMap[type] || 'date';

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <DateFieldComponent
          {...field}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={fieldState.error?.message as string | undefined}
          required={required}
          mode={mode}
        />
      )}
    />
  );
}
