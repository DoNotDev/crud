'use client';
// packages/features/crud/src/components/controlled/select/ControlledDropdownField.tsx

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import type { FieldValues, Path } from 'react-hook-form';

import { translateLabel } from '../../../forms/utils';
import { DropdownComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**
 * ControlledDropdownField - Explicit controlled component for select/dropdown inputs
 *
 * Forwards Controller's ref for focus/validation (simple input)
 *
 * Handles dynamic options (function-based) and dependsOn logic
 */
export function ControlledDropdownField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, t, onChange, required } = props;

  const { name, label, validation, options: fieldOptions = {} } = fieldConfig;

  const formContext = useFormContext();
  const setValue = formContext?.setValue;

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
  const dropdownOptions = useMemo(() => {
    const options = validation?.options;
    if (!options) return [];

    // Function-based options (dynamic, depends on parent value)
    if (typeof options === 'function') {
      // Build minimal context with just the dependency
      const context = dependsOnField ? { [dependsOnField]: parentValue } : {};
      return options(context);
    }

    // Static array options
    return options;
  }, [validation?.options, hasDynamicOptions, dependsOnField, parentValue]);

  // Translate option labels

  const translatedOptions = useMemo(() => {
    return dropdownOptions.map((opt) => ({
      ...opt,

      label: translateLabel(opt.label, t),
    }));
  }, [dropdownOptions, t]);

  // Handle setParentOnChange

  // why: @donotdev/core declares no fieldSpecific shape for this field type, and FieldType is erased at registry dispatch
  const fieldSpecific = fieldOptions.fieldSpecific as
    | { setParentOnChange?: (
          childValue: string,
          formValues: Record<string, unknown>
        ) => unknown }
    | undefined;

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        const handleChange = (
          value: string | React.ChangeEvent<HTMLSelectElement>
        ) => {
          const newValue =
            typeof value === 'string' ? value : value.target.value;

          field.onChange(newValue);

          // Auto-set parent when child changes
          if (dependsOn && setValue && fieldSpecific?.setParentOnChange) {
            const parentVal = fieldSpecific.setParentOnChange(
              newValue,
              dependsOnField ? { [dependsOnField]: parentValue } : {}
            );

            if (parentVal !== undefined && parentVal !== null) {
              setValue(
                dependsOn.field,

                parentVal,

                { shouldValidate: true, shouldDirty: true }
              );
            }
          }
        };

        return (
          <DropdownComponent
            label={t(label)}
            value={
              field.value !== undefined && field.value !== null
                ? String(field.value)
                : ''
            }
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
