'use client';
// packages/features/crud/src/components/controlled/select/ControlledYearField.tsx

import { useMemo } from 'react';
import { Controller } from 'react-hook-form';

import { translateLabel } from '../../../forms/utils';
import { ComboboxComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**
 * ControlledYearField - Year input using Combobox (type or select)
 * Auto-generates year options from validation.min/max or defaults to 1900-2100
 * Stores value as number, displays as string in combobox
 */
export function ControlledYearField(props: ControlledFieldProps): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;
  const { name, label, validation, options: fieldOptions = {} } = fieldConfig;

  // Generate year options from min/max validation or use defaults
  const yearOptions = useMemo(() => {
    const minYear = validation?.min ?? 1900;
    const maxYear = validation?.max ?? new Date().getFullYear() + 10; // Default to current year + 10

    const years: Array<{ value: string; label: string }> = [];
    // Generate descending (newest first) for better UX
    for (let y = maxYear; y >= minYear; y--) {
      years.push({ value: String(y), label: String(y) });
    }

    return years;
  }, [validation?.min, validation?.max]);

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (
          value: string | React.ChangeEvent<HTMLSelectElement>
        ) => {
          const newValue =
            typeof value === 'string' ? value : value.target.value;
          // Convert to number for storage (combobox works with strings)
          const numValue = newValue === '' ? undefined : Number(newValue);
          field.onChange(numValue);
        };

        return (
          <ComboboxComponent
            {...field}
            label={translateLabel(label, t)}
            value={
              field.value !== undefined && field.value !== null
                ? String(field.value)
                : ''
            }
            onChange={handleChange}
            onBlur={field.onBlur}
            options={yearOptions}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            placeholder={placeholder || fieldOptions.placeholder}
            translationNamespace="crud"
            placeholderKey="actions.selectYear"
            placeholderDefault="Select or type year"
            creatable={true} // Allow typing custom years
          />
        );
      }}
    />
  );
}
