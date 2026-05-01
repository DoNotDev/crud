'use client';
// packages/features/crud/src/components/controlled/input/ControlledSwitchField.tsx

import { Controller } from 'react-hook-form';

import { SwitchFieldComponent } from '../../form/fields';
import { type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledSwitchField - Switch with custom value mapping

 * Supports uncheckedValue/checkedValue for string values like 'Manual'/'Automatic'

 */

export function ControlledSwitchField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, onChange } = props;

  const { name, label, options = {} } = fieldConfig;

  const fieldSpecific = options.fieldSpecific as
    | {
        uncheckedLabel?: string;

        checkedLabel?: string;

        uncheckedValue?: string | boolean;

        checkedValue?: string | boolean;
      }
    | undefined;

  // Default values

  const uncheckedValue = fieldSpecific?.uncheckedValue ?? false;

  const checkedValue = fieldSpecific?.checkedValue ?? true;

  const uncheckedLabel = fieldSpecific?.uncheckedLabel;

  const checkedLabel = fieldSpecific?.checkedLabel;

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      render={({ field: { value, onChange: fieldOnChange }, fieldState }) => {
        // Value is normalized in useEntityForm to never be null/undefined

        // Direct comparison - no fallback needed

        const isChecked = value === checkedValue;

        const handleChange = (checked: boolean) => {
          const newValue = checked ? checkedValue : uncheckedValue;

          fieldOnChange(newValue);

          if (onChange) onChange(newValue);
        };

        return (
          <SwitchFieldComponent
            label={t(label)}
            checked={isChecked}
            onChange={(e) => handleChange(e.target.checked)}
            uncheckedLabel={uncheckedLabel ? t(uncheckedLabel) : undefined}
            checkedLabel={checkedLabel ? t(checkedLabel) : undefined}
            helperText={fieldState.error?.message as string | undefined}
          />
        );
      }}
    />
  );
}
