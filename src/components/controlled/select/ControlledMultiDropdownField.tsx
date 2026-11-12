'use client';
// packages/features/crud/src/components/controlled/select/ControlledMultiDropdownField.tsx

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { FieldValues, Path } from 'react-hook-form';

import { translateLabel } from '../../../forms/utils';
import { MultiDropdownComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**
 * ControlledMultiDropdownField - Explicit controlled component for multiselect inputs
 *
 * Forwards Controller's ref for focus/validation (simple input)
 *
 * Handles dynamic options
 */
export function ControlledMultiDropdownField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, required } = props;

  const { name, label, validation } = fieldConfig;

  // dependsOn: watch only the parent field, not the entire form
  const dependsOn =
    'dependsOn' in fieldConfig ? fieldConfig.dependsOn : undefined;
  const dependsOnField = dependsOn
    ? dependsOn.field
    : undefined;

  const hasDynamicOptions = typeof validation?.options === 'function';

  // Watch ONLY the parent field (scoped subscription, no cascade re-renders)
  const parentValue = useWatch({
    control,
    // why: useWatch has no overload for an optional name; `disabled` skips the watch when there is no parent
    name: dependsOnField as Path<FieldValues>,
    disabled: !dependsOnField,
  });

  // Resolve options - support static arrays and dynamic functions
  const multiselectOptions = useMemo(() => {
    const options = validation?.options;
    if (!options) return [];

    if (typeof options === 'function') {
      const context = dependsOnField ? { [dependsOnField]: parentValue } : {};
      return options(context);
    }

    return options;
  }, [validation?.options, hasDynamicOptions, dependsOnField, parentValue]);

  // Translate option labels

  const translatedOptions = useMemo(() => {
    return multiselectOptions.map((opt) => ({
      value: String(opt.value),

      label: translateLabel(opt.label, t),
    }));
  }, [multiselectOptions, t]);

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (
          value: string[] | React.ChangeEvent<HTMLSelectElement>
        ) => {
          let newValue: string[];

          if (Array.isArray(value)) {
            newValue = value;
          } else {
            try {
              newValue = JSON.parse(value.target.value);
            } catch {
              newValue = [];
            }
          }

          field.onChange(newValue);
        };

        return (
          <MultiDropdownComponent
            {...field}
            label={t(label)}
            value={Array.isArray(field.value) ? field.value : []}
            onChange={handleChange}
            onBlur={field.onBlur}
            options={translatedOptions}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            required={required}
          />
        );
      }}
    />
  );
}
