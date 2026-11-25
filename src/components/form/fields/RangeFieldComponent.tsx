// packages/features/crud/src/components/form/fields/RangeFieldComponent.tsx

/**
 * @fileoverview Range Field Component
 * @description Renders a slider input with min/max values. Form field component for range/slider inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ChangeEvent, ComponentType } from 'react';

import {
  Label,
  Slider,
  cn,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';

export interface RangeFieldComponentProps {
  /** Label for the field */
  label: string;
  /** Current numeric value */
  value?: number;
  /** Change handler - accepts both event and direct value */
  onChange: (value: number | ChangeEvent<HTMLInputElement>) => void;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step value for increments */
  step?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Show value label */
  showValue?: boolean;
}

/**
 * RangeFieldComponent renders a slider input with optional value display
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - RangeFieldComponentProps
 * @returns JSX.Element
 */
const RangeFieldComponent: ComponentType<RangeFieldComponentProps> = ({
  label,
  value = 0,
  onChange,
  error,
  helperText,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  required,
  showValue = true,
}) => {
  const id = useId();

  const handleChange = (newValue: number) => {
    // Create a synthetic event with the numeric value
    const syntheticEvent = {
      target: { value: newValue.toString() },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <Stack gap="tight">
      <Stack direction="row" justify="between" align="center">
        <Label
          required={required}
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
          }}
        >
          {label}
        </Label>
        {showValue && (
          <span
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            {value}
          </span>
        )}
      </Stack>

      <Slider
        {...fieldMessageAria({ id: `${id}-message`, error, helperText })}
        value={[value ?? min]}
        onValueChange={([newValue]) => handleChange(newValue ?? min)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        style={{
          borderColor: error ? 'var(--destructive)' : undefined,
          opacity: disabled ? 'var(--opacity-muted)' : undefined,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
        aria-label={label}
      />

      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default RangeFieldComponent;
