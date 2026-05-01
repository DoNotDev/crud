'use client';
// packages/features/crud/src/components/form/fields/TextFieldComponent.tsx

/**
 * @fileoverview Text Field Component
 * @description Enhanced text field component with ARIA, loading states, and modern UX. Form field component for text inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';

import { Input, Label, Spinner, cn, Stack } from '@donotdev/components';

import type { ChangeEvent, ComponentProps } from 'react';

export interface TextFieldComponentProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
> {
  /** Field label */
  label: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  /** Error message */
  error?: string;
  /** Helper text to display */
  helperText?: string;
  /** Input type (default: text) */
  type?: string;
  /** Loading state */
  loading?: boolean;
  /** Maximum character count */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Required field indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Enhanced TextFieldComponent with modern UX features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 *
 * Features:
 * - Full ARIA compliance
 * - Loading states with spinner
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * - Character counting
 * - Error handling
 * - Required field indicators
 * - Responsive design
 *
 * @param props - TextFieldComponentProps
 * @returns JSX.Element
 */
function TextFieldComponent({
  label,
  value = '',
  onChange,
  error,
  helperText,
  type = 'text',
  loading = false,
  maxLength,
  showCharCount = false,
  required = false,
  disabled = false,
  className,
  ref,
  ...props
}: TextFieldComponentProps) {
  const id = useId();

  const hasError = !!error;
  // charCount is only accurate in controlled mode (value prop provided).
  // In uncontrolled mode (react-hook-form register), value is always '' here;
  // showCharCount will render 0/maxLength. Avoid using showCharCount uncontrolled.
  const charCount = value.length;
  const isNearLimit = maxLength && charCount > maxLength * 0.8;
  const isOverLimit = maxLength && charCount > maxLength;

  // Exclude non-DOM props before spreading to native element
  const { children: _children, ...inputProps } = props;

  return (
    <Stack gap="tight">
      {/* Input with native floating label support */}
      <Input
        ref={ref}
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        label={label}
        disabled={disabled || loading}
        maxLength={maxLength}
        required={required}
        aria-describedby={cn(
          hasError && `${id}-error`,
          helperText && !hasError && `${id}-helper`,
          showCharCount && `${id}-count`
        )}
        aria-invalid={hasError}
        className={cn('dndev-w-full', className)}
        data-variant={hasError ? 'destructive' : undefined}
        {...inputProps}
      />

      {/* Character Count */}
      {showCharCount && maxLength && (
        <div
          id={`${id}-count`}
          style={{
            fontSize: 'var(--font-size-xs)',
            textAlign: 'right',
            color: isOverLimit
              ? 'var(--destructive-foreground)'
              : isNearLimit
                ? 'var(--warning)'
                : 'var(--muted-foreground)',
          }}
        >
          {charCount}/{maxLength}
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <Stack
          id={`${id}-error`}
          direction="row"
          align="center"
          gap="tight"
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--destructive-foreground)',
          }}
          role="alert"
        >
          <span>⚠</span>
          {error}
        </Stack>
      )}

      {/* Helper Text */}
      {helperText && !hasError && (
        <p
          id={`${id}-helper`}
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
}

export default TextFieldComponent;
