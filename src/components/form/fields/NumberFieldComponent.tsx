// packages/features/crud/src/components/form/fields/NumberFieldComponent.tsx

/**
 * @fileoverview Number Field Component
 * @description Renders a number input field with validation and formatting. Form field component for number inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect, useCallback } from 'react';

import { Input, Label, cn, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { ChangeEvent, ComponentType } from 'react';

export interface NumberFieldComponentProps {
  /** Label for the field */
  label: string;
  /** Current numeric value */
  value?: number;
  /** Change handler */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Whether the field is in error state */
  error?: boolean;
  /** Helper text to display */
  helperText?: string;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step value for increments/decrements */
  step?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Optional className */
  className?: string;
  /** Input mask type: 'currency' (commas + 2 decimals), 'mileage' (commas, no decimals), or 'number' (no formatting) */
  mask?: 'currency' | 'mileage' | 'number';
}

/**
 * NumberFieldComponent renders a styled number input with validation.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - NumberFieldComponentProps
 * @returns JSX.Element
 */
const NumberFieldComponent: ComponentType<NumberFieldComponentProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  min,
  max,
  step,
  disabled,
  required,
  className,
  mask = 'number',
  ...props
}) => {
  const { i18n } = useTranslation();
  const locale =
    i18n?.language ||
    (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  // Format number based on mask type (locale-aware)
  const formatValue = useCallback(
    (val: number | undefined): string => {
      if (val === undefined || val === null || isNaN(val)) return '';

      if (mask === 'currency') {
        return val.toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } else if (mask === 'mileage') {
        return Math.round(val).toLocaleString(locale);
      }
      return val.toString();
    },
    [mask, locale]
  );

  // Parse formatted string back to number (locale-aware)
  const parseValue = useCallback(
    (input: string): number | null => {
      if (!input || input.trim() === '') return null;

      // Get locale-specific number format info
      const formatter = new Intl.NumberFormat(locale);
      const parts = formatter.formatToParts(1234.56);
      const groupSeparator =
        parts.find((p) => p.type === 'group')?.value || ',';
      const decimalSeparator =
        parts.find((p) => p.type === 'decimal')?.value || '.';

      // Remove group separators and normalize decimal separator
      let cleaned = input.replace(new RegExp(`\\${groupSeparator}`, 'g'), '');
      cleaned = cleaned.replace(decimalSeparator, '.');

      // Remove any remaining non-numeric characters except minus sign and decimal point
      cleaned = cleaned.replace(/[^\d.\-]/g, '');

      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    },
    [locale]
  );

  const [displayValue, setDisplayValue] = useState(() => formatValue(value));

  // Update display value when prop value or locale changes
  useEffect(() => {
    setDisplayValue(formatValue(value));
  }, [value, formatValue]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;
    setDisplayValue(inputValue);

    if (mask === 'number') {
      // For unmasked numbers, use original behavior
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        onChange({
          ...event,
          target: {
            ...event.target,
            value: numValue.toString(),
          },
        } as ChangeEvent<HTMLInputElement>);
      } else {
        onChange(event);
      }
    } else {
      // For masked numbers, parse and emit numeric value
      const parsed = parseValue(inputValue);
      if (parsed !== null) {
        onChange({
          ...event,
          target: {
            ...event.target,
            value: parsed.toString(),
          },
        } as ChangeEvent<HTMLInputElement>);
      } else if (inputValue === '') {
        // Allow clearing the field
        onChange({
          ...event,
          target: {
            ...event.target,
            value: '',
          },
        } as ChangeEvent<HTMLInputElement>);
      }
    }
  };

  return (
    <Stack gap="tight">
      <Input
        type={mask === 'number' ? 'number' : 'text'}
        inputMode={mask === 'number' ? undefined : 'decimal'}
        label={label}
        value={displayValue}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        className={cn('dndev-w-full', className)}
        data-variant={error ? 'destructive' : undefined}
        style={{
          opacity: disabled ? 'var(--opacity-muted)' : undefined,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
        {...props}
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

export default NumberFieldComponent;
