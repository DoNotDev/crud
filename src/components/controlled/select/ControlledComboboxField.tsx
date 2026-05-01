'use client';
// packages/features/crud/src/components/controlled/select/ControlledComboboxField.tsx

import { useMemo, useEffect, useRef } from 'react';
import { Controller, useWatch, useFormContext } from 'react-hook-form';

import { translateLabel } from '../../../forms/utils';
import { ComboboxComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

import type { ReactElement } from 'react';
import type { FieldValues, Path } from 'react-hook-form';

/**

 * ControlledComboboxField - Explicit controlled component for combobox inputs

 * Forwards Controller's ref for focus/validation (simple input)

 * Handles dynamic options and creatable mode

 */

export function ControlledComboboxField(
  props: ControlledFieldProps
): ReactElement {
  const { control, errors, fieldConfig, t, placeholder, required } = props;

  const { name, label, validation, options: fieldOptions = {} } = fieldConfig;

  const formContext = useFormContext();

  const setValue = formContext?.setValue;
  const resetField = formContext?.resetField;

  const formValues = useWatch({ control });

  // Handle dependsOn

  const dependsOn =
    'dependsOn' in fieldConfig ? fieldConfig.dependsOn : undefined;

  const parentValue =
    dependsOn && formValues
      ? formValues[(dependsOn as { field: Path<FieldValues> }).field]
      : undefined;

  // Resolve options - support static arrays and dynamic functions

  const comboboxOptions = useMemo(() => {
    const options = validation?.options;

    if (!options) return [];

    if (typeof options === 'function') {
      return options(formValues || {});
    }

    return options as Array<{ value: string; label: string }>;
  }, [validation?.options, formValues, parentValue]);

  // Reset this field when parent changes and current value is no longer valid
  const prevParentRef = useRef<unknown>(undefined);
  useEffect(() => {
    const prev = prevParentRef.current;
    prevParentRef.current = parentValue;
    if (prev === undefined) return; // skip mount
    if (prev === parentValue) return;
    const currentValue = formValues?.[name];
    if (!currentValue) return;
    const validValues = comboboxOptions.map((o) => o.value);
    if (!validValues.includes(currentValue as string) && resetField) {
      resetField(name as Path<FieldValues>);
    }
  }, [parentValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Translate option labels

  const translatedOptions = useMemo(() => {
    return comboboxOptions.map((opt) => ({
      ...opt,

      label: translateLabel(opt.label, t),
    }));
  }, [comboboxOptions, t]);

  const fieldSpecific = fieldOptions.fieldSpecific as
    | {
        setParentOnChange?: (childValue: any, formValues: any) => any;
        creatable?: boolean;
      }
    | undefined;

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

          field.onChange(newValue);

          if (dependsOn && setValue && fieldSpecific?.setParentOnChange) {
            const parentValue = fieldSpecific.setParentOnChange(
              newValue,
              formValues || {}
            );

            if (parentValue !== undefined && parentValue !== null) {
              setValue(
                (dependsOn as { field: Path<FieldValues> }).field,

                parentValue,

                { shouldValidate: true, shouldDirty: true }
              );
            }
          }
        };

        return (
          <ComboboxComponent
            {...field}
            label={t(label)}
            value={field.value ?? ''}
            onChange={handleChange}
            onBlur={field.onBlur}
            options={translatedOptions}
            error={!!fieldState.error}
            helperText={fieldState.error?.message as string | undefined}
            required={required}
            placeholder={placeholder || fieldOptions.placeholder}
            creatable={fieldSpecific?.creatable ?? false}
          />
        );
      }}
    />
  );
}
