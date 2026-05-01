// packages/features/crud/src/components/form/fields/RangeFieldComponent.tsx

/**
 * @fileoverview Range Field Component
 * @description Renders a slider input with min/max values. Form field component for range/slider inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Label, Slider, cn, Stack } from '@donotdev/components';

import type { ChangeEvent, ComponentType } from 'react';

export interface RangeFieldComponentProps {
  /** Label for the field */
  label: string;
  /** Current numeric value */
  value?: number;
  /** Change handler - accepts both event and direct value */
  onChange: (value: number | ChangeEvent<HTMLInputElement>) => void;
  /** Whether the field is in error state */
  error?: boolean;
  /** Helper text to display */
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

      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
            marginTop: 'var(--gap-sm)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default RangeFieldComponent;
