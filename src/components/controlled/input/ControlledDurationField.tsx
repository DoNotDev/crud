'use client';
// packages/features/crud/src/components/controlled/input/ControlledDurationField.tsx

/**
 * @fileoverview Controlled Duration Field
 * @description React Hook Form controlled wrapper for duration (minutes) input.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Controller } from 'react-hook-form';

import { DurationFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledDurationField - Controlled component for duration (minutes) with preset chips + custom slider
 */
export function ControlledDurationField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;
  const { name, label, validation } = fieldConfig;
  const options = fieldConfig.options || {};
  const fieldSpecific = options.fieldSpecific as
    | { min?: number; max?: number; step?: number }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <DurationFieldComponent
          label={t(label)}
          value={field.value ?? 0}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          disabled={field.disabled}
          min={fieldSpecific?.min ?? 0}
          max={fieldSpecific?.max ?? 480}
          step={fieldSpecific?.step ?? 5}
          t={t}
        />
      )}
    />
  );
}
