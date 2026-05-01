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

import { handleError } from '@donotdev/core';
import type { EntityField, FieldType, ValueTypeForField } from '@donotdev/core';

import { getFieldRegistry } from '../FieldRegistry';
import { getMetadataRegistry } from '../fieldTypeRegistry.store';
import { ControlledTextField, type ControlledFieldProps } from './controlled';
import { TextFieldComponent } from './form/fields';

import type { ReactElement } from 'react';
import type { Control, FieldValues } from 'react-hook-form';

// Base props shared between controlled and uncontrolled modes
interface FormFieldRendererBaseProps<T extends FieldType = FieldType> {
  name: string;
  config: EntityField<T>;
  t: (key: string, options?: Record<string, any>) => string;
}

interface UncontrolledProps<
  T extends FieldType,
> extends FormFieldRendererBaseProps<T> {
  value: ValueTypeForField<T>;
  onChange: (value: ValueTypeForField<T>) => void;
  error?: string;
  control?: never;
  errors?: never;
}

interface ControlledProps<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
> extends FormFieldRendererBaseProps<T> {
  control: Control<TFieldValues>;
  errors: Record<string, any>;
  value?: never;
  onChange?: never;
  error?: never;
}

/** Props for {@link FormFieldRenderer}, dispatches to the correct field component via FieldRegistry. */
export type FormFieldRendererProps<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
> = UncontrolledProps<T> | ControlledProps<T, TFieldValues>;

/**
 * FormFieldRenderer - renders fields via registry lookup
 */
export function FormFieldRenderer<
  T extends FieldType,
  TFieldValues extends FieldValues = FieldValues,
>({
  name,
  config,
  t,
  ...props
}: FormFieldRendererProps<T, TFieldValues>): ReactElement {
  const createSafeChangeHandler =
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

  const isControlled = 'control' in props && props.control;

  // Special handling: submit/reset buttons should always be uncontrolled
  // They don't need React Hook Form refs and cause "Maximum update depth exceeded" errors
  const isActionButton = config.type === 'submit' || config.type === 'reset';

  // Controlled mode (react-hook-form) - but skip for action buttons
  if (isControlled && !isActionButton) {
    const { control, errors } = props;

    // Extract placeholder from fieldSpecific if present
    const fieldSpecific = config.options?.fieldSpecific as
      | Record<string, unknown>
      | undefined;
    const placeholder = fieldSpecific?.placeholder as string | undefined;

    // Registry dispatch boundary: widen Control<TFieldValues> → Control<FieldValues>
    // Control<T> is invariant in react-hook-form — this is the standard pattern
    // for dynamic dispatch where the registry can't know the specific entity type
    const controlledProps: ControlledFieldProps = {
      control: control as Control<FieldValues>,
      errors,
      fieldConfig: { ...config, label: config.label || name },
      t,
      placeholder,
      required: config.validation?.required === true,
      onChange: createSafeChangeHandler(() => {}),
    };

    const Component = registry.getControlledComponent(config.type);
    if (Component) {
      return <Component {...controlledProps} />;
    }

    // Unregistered type fallback
    handleError(new Error(`Unregistered field type: ${config.type}`), {
      userMessage: t('errors.unsupportedFieldType', { type: config.type }),
      context: { fieldName: name, fieldType: config.type },
      severity: 'warning',
    });
    return (
      <ControlledTextField
        {...{ ...controlledProps, fieldConfig: { ...config, type: 'text' } }}
      />
    );
  }

  // Uncontrolled mode (or action buttons forced to uncontrolled)
  // For action buttons in controlled forms, use undefined/null values
  // Note: submit/reset have ValueTypeForField<T> = never, so we need to cast through unknown
  const uncontrolledProps =
    isControlled && isActionButton
      ? ({
          name,
          config,
          t,
          value: undefined as unknown as ValueTypeForField<T>,
          onChange: () => {},
          error: undefined,
        } as UncontrolledProps<T>)
      : (props as UncontrolledProps<T>);

  const { value, onChange, error } = uncontrolledProps;
  const safeChangeHandler = createSafeChangeHandler(onChange);

  const Component = registry.getUncontrolledComponent(config.type);
  if (Component) {
    return (
      <Component
        name={name}
        label={config.label || name}
        value={value}
        onChange={safeChangeHandler}
        error={error}
        t={t}
        config={config}
        {...config.options}
      />
    );
  }

  // Fallback
  return (
    <TextFieldComponent
      label={config.label || name}
      value={value as string}
      onChange={safeChangeHandler}
      error={error || undefined}
      {...config.options}
    />
  );
}

export default FormFieldRenderer;
