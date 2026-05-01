// packages/features/crud/src/components/form/fields/CurrencyFieldComponent.tsx

/**
 * @fileoverview Currency Field Component
 * @description Currency input with locale-aware formatting and currency symbol
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect, useId } from 'react';

import { Input, FloatingLabel, Stack } from '@donotdev/components';

import type { ChangeEvent, ComponentType } from 'react';

export interface CurrencyFieldComponentProps {
  /** Field label */
  label: string;
  /** Current value (number in cents/smallest unit) */
  value?: number;
  /** Change handler */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Currency code (e.g., 'EUR', 'USD') */
  currency?: string;
  /** Locale for formatting (e.g., 'fr-FR', 'en-US') */
  locale?: string;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Required field */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder */
  placeholder?: string;
}

/**
 * Currency field with locale-aware formatting
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const CurrencyFieldComponent: ComponentType<CurrencyFieldComponentProps> = ({
  label,
  value,
  onChange,
  currency = 'EUR',
  locale,
  error,
  helperText,
  required = false,
  disabled = false,
  placeholder,
}) => {
  const id = useId();

  // Detect locale from browser if not provided
  const effectiveLocale =
    locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  // Format value for display
  const formatValue = (val: number | undefined): string => {
    if (val === undefined || val === null || isNaN(val)) return '';
    const num = val / 100;
    // Don't force .00 or trailing zeros if not needed, as requested by users
    return num.toString();
  };

  // Parse input to cents
  const parseValue = (input: string): number | null => {
    if (!input || input.trim() === '') return null;
    // Support both dot and comma as decimal separators
    const cleaned = input.replace(/[^\d.,\-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    // Round to avoid floating point issues when converting to cents
    return Math.round(parsed * 100);
  };

  const [displayValue, setDisplayValue] = useState(formatValue(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Only update display value from prop if not focused or if numerical value changed from outside
    if (!isFocused) {
      setDisplayValue(formatValue(value));
    } else {
      const currentCents = parseValue(displayValue);
      if (currentCents !== value) {
        setDisplayValue(formatValue(value));
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);

    const cents = parseValue(inputValue);
    const syntheticEvent = {
      target: { value: cents },
    } as unknown as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  // Get currency symbol
  const getCurrencySymbol = (): string => {
    try {
      return (
        new Intl.NumberFormat(effectiveLocale, {
          style: 'currency',
          currency,
          currencyDisplay: 'symbol',
        })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value || currency
      );
    } catch {
      return currency;
    }
  };

  const currencySymbol = getCurrencySymbol();

  return (
    <Stack gap="tight">
      <FloatingLabel
        htmlFor={id}
        label={label}
        disabled={disabled}
        required={required}
      >
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 'var(--gap-md)',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-foreground)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {currencySymbol}
          </span>
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            bare
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder || '0'}
            data-variant={error ? 'destructive' : undefined}
            style={{
              paddingLeft: `calc(var(--gap-md) + ${currencySymbol.length * 0.6}em + var(--gap-sm))`,
            }}
          />
        </div>
      </FloatingLabel>
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

export default CurrencyFieldComponent;
