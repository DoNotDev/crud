'use client';
// packages/features/crud/src/components/FormFieldRenderer.tsx

/**
 * @fileoverview FormFieldRenderer component
 * @description Renders form fields using FieldRegistry - no switch statement
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Suspense } from 'react';
import type { ReactElement } from 'react';
import type { Control, FieldValues } from 'react-hook-form';

import { Skeleton } from '@donotdev/components';
import { handleError } from '@donotdev/core';
import type { EntityField, FieldType, ValueTypeForField } from '@donotdev/core';

import { getFieldRegistry } from '../FieldRegistry';
import {
  getMetadataRegistry,
} from '../fieldTypeRegistry.store';
import type { ControlledFieldProps } from './controlled';

// Base props shared between controlled and uncontrolled modes
interface FormFieldRendererBaseProps<T extends FieldType = FieldType> {
  name: string;
  config: EntityField<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /**
   * Offer only these values of the field's declared `validation.options`, in this order
   * (select, multiselect, radio, combobox). For a form that lets the user pick a subset,
   * e.g. the reasons a person may record while the database writes the others.
   *
   * Display only: form validation still accepts every declared value, and a stored value
   * outside the subset is not offered. Throws when the field declares no static options
   * or when a value is not one of them.
   *
   * @example
   * ```tsx
   * <FormFieldRenderer name="reason" config={config} control={form.control} t={t}
   *   onlyOptions={['breakage', 'loss', 'theft']} />
   * ```
   */
  onlyOptions?: readonly string[];
}

interface UncontrolledProps<
  T extends FieldType,
> extends FormFieldRendererBaseProps<T> {
  value: ValueTypeForField<T>;
  onChange: (value: ValueTypeForField<T>) => void;
  error?: string;
  control?: never;
}

interface ControlledProps<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
  TTransformedValues = TFieldValues,
> extends FormFieldRendererBaseProps<T> {
  /** The form's control (`form.control`: form state, submitted values) */
  control: Control<TFieldValues, unknown, TTransformedValues>;
  value?: never;
  onChange?: never;
  error?: never;
}

/** Props for {@link FormFieldRenderer}, dispatches to the correct field component via FieldRegistry. */
export type FormFieldRendererProps<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
  TTransformedValues = TFieldValues,
> =
  | UncontrolledProps<T>
  | ControlledProps<T, TFieldValues, TTransformedValues>;

/**
 * The field with its `validation.options` narrowed to `values`, in the order given.
 *
 * @param config - Entity field declaring static `validation.options`
 * @param name - Field name, for the error message
 * @param values - Declared option values to keep
 * @returns A copy of the field offering only `values`
 * @throws When the field has no static options or a value is not declared
 */
function restrictOptions(
  config: EntityField,
  name: string,
  values: readonly string[]
): EntityField {
  const declared = config.validation?.options;
  if (!Array.isArray(declared)) {
    throw new Error(
      `FormFieldRenderer: field "${name}" got onlyOptions but declares no static validation.options.`
    );
  }
  const options = values.map((value) => {
    const option = declared.find((o) => o.value === value);
    if (!option) {
      throw new Error(
        `FormFieldRenderer: onlyOptions value "${value}" is not an option of field "${name}" (declared: ${declared.map((o) => o.value).join(', ')}).`
      );
    }
    return option;
  });
  return { ...config, validation: { ...config.validation, options } };
}

/** Placeholder of a lazy field editor: about one input row, so the form does not jump. */
const FIELD_FALLBACK_STYLE = { height: '2.5rem', width: '100%' } as const;

/**
 * FormFieldRenderer - renders fields via registry lookup
 */
export function FormFieldRenderer<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
  TTransformedValues = TFieldValues,
>({
  name,
  config,
  t,
  onlyOptions,
  ...props
}: FormFieldRendererProps<T, TFieldValues, TTransformedValues>): ReactElement {
  const fieldConfig: EntityField = onlyOptions
    ? restrictOptions(config, name, onlyOptions)
    : config;

  // why: one wrapper feeds registry components whose onChange value type is erased at dispatch (FieldType)
  const createSafeChangeHandler =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: see the why: comment above
    (onChange: (value: any) => void) => (value: any) => {
      try {
        onChange(value);
      } catch (error) {
        handleError(error, {
          userMessage: `Error updating field ${config.label || name}`,
          context: { fieldName: name, fieldType: config.type },
          severity: 'warning',
        });
      }
    };

  // Ensure builtin field types are registered (lazy init — safe at render time,
  // unsafe at module level because evaluation order isn't guaranteed).
  getMetadataRegistry();
  const registry = getFieldRegistry();

  const unregistered = () =>
    new Error(
      `FormFieldRenderer: field "${name}" has type "${config.type}", which has no registered component. Call registerFieldType({ type: '${config.type}', ... }) at app startup.`
    );

  // Action buttons (submit/reset) are not form fields: no value, no RHF binding
  // (binding them causes "Maximum update depth exceeded").
  if (config.type === 'submit' || config.type === 'reset') {
    const Button = registry.getUncontrolledComponent(config.type);
    if (!Button) throw unregistered();
    return (
      <Button
        name={name}
        label={config.label || name}
        value={undefined}
        onChange={() => {}}
        t={t}
        config={config}
        {...config.options}
      />
    );
  }

  // Controlled mode (react-hook-form)
  if (props.control) {
    const fieldSpecific = config.options?.fieldSpecific as
      | Record<string, unknown>
      | undefined;
    const placeholder = fieldSpecific?.placeholder as string | undefined;

    // why: registry dispatch boundary. Registered components are typed for any entity
    // (FieldType), so the entity's Control<TFieldValues> is widened to Control<FieldValues> here, once.
    const controlledProps: ControlledFieldProps = {
      control: props.control as Control<FieldValues>,
      fieldConfig: { ...fieldConfig, label: config.label || name },
      t,
      placeholder,
      required: config.validation?.required === true,
      onChange: createSafeChangeHandler(() => {}),
    };

    const Component = registry.getControlledComponent(config.type);
    if (!Component) throw unregistered();
    // Heavy editors are lazy (registerBuiltinFieldTypes): hold their slot while they load
    return (
      <Suspense fallback={<Skeleton style={FIELD_FALLBACK_STYLE} />}>
        <Component {...controlledProps} />
      </Suspense>
    );
  }

  // Uncontrolled mode: the caller owns value / onChange
  const { value, onChange, error } = props;
  const Component = registry.getUncontrolledComponent(config.type);
  if (!Component) throw unregistered();
  return (
    <Component
      name={name}
      label={config.label || name}
      value={value}
      onChange={createSafeChangeHandler(onChange)}
      error={error}
      t={t}
      config={fieldConfig}
      {...config.options}
    />
  );
}

export default FormFieldRenderer;
