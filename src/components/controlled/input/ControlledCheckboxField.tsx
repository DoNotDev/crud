'use client';
// packages/features/crud/src/components/controlled/input/ControlledCheckboxField.tsx

import { Controller } from 'react-hook-form';

import { CheckboxFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledCheckboxField - Explicit controlled component for checkbox inputs

 * Uses standard React Hook Form Controller pattern

 */

export function ControlledCheckboxField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  // Use translated string label
  const labelContent = typeof label === 'string' ? t(label) : label;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field }) => (
        <CheckboxFieldComponent
          label={labelContent}
          checked={Boolean(field.value)}
          onChange={(e) => field.onChange(e.target.checked)}
          required={required}
        />
      )}
    />
  );
}
