// packages/features/crud/src/components/form/fields/RatingFieldComponent.tsx

/**
 * @fileoverview Rating Field Component
 * @description Form field component for star ratings in CRUD forms.
 * Input accepts whole numbers (1-5), display renders fractional values.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ComponentType } from 'react';

import {
  Label,
  Rating,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';

export interface RatingFieldComponentProps {
  /** Label for the field */
  label: string;
  /** Current rating value (1-5) */
  value?: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Maximum rating value */
  max?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Read-only mode (display only) */
  readonly?: boolean;
  /** Show numeric value next to stars */
  showValue?: boolean;
}

/**
 * RatingFieldComponent renders a star rating input
 *
 * Used by the built-in entity field type `rating`. Supports whole-number input
 * (1–max), optional fractional display, and optional numeric value display.
 *
 * @see Entity field type: `rating` (registered in registerBuiltinFieldTypes)
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const RatingFieldComponent: ComponentType<RatingFieldComponentProps> = ({
  label,
  value = 0,
  onChange,
  error,
  helperText,
  max = 5,
  disabled,
  required,
  readonly,
  showValue = false,
}) => {
  const id = useId();

  return (
    <Stack gap="tight">
      <Label
        required={required}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
        }}
      >
        {label}
      </Label>

      <Rating
        value={value}
        onChange={onChange}
        max={max}
        disabled={disabled}
        readonly={readonly}
        showValue={showValue}
        aria-label={label}
        {...fieldMessageAria({
          id: `${id}-message`,
          error,
          helperText,
        })}
      />

      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default RatingFieldComponent;
