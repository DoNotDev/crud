'use client';
// packages/features/crud/src/components/controlled/input/ControlledRatingField.tsx

/**
 * @fileoverview Controlled Rating Field
 * @description React Hook Form controlled wrapper for star rating input.
 * Accepts whole numbers (1-5) for input.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Controller } from 'react-hook-form';

import { RatingFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledRatingField - Controlled component for star rating inputs
 * Wraps RatingFieldComponent with react-hook-form Controller
 */
export function ControlledRatingField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;
  const { name, label, validation } = fieldConfig;
  const options = fieldConfig.options || {};

  const fieldSpecific = options.fieldSpecific as
    | { showValue?: boolean; max?: number }
    | undefined;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <RatingFieldComponent
          label={t(label)}
          value={field.value ?? 0}
          onChange={(value) => {
            field.onChange(value);
          }}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          max={fieldSpecific?.max ?? validation?.max ?? 5}
          showValue={fieldSpecific?.showValue}
        />
      )}
    />
  );
}
