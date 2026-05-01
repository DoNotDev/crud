'use client';
// packages/features/crud/src/components/form/fields/TextAreaComponent.tsx

/**
 * @fileoverview Text Area Component
 * @description Enhanced textarea component with ARIA, auto-resize, and modern UX. Form field component for textarea inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useId, useRef, useEffect } from 'react';

import {
  Textarea,
  FloatingLabel,
  Spinner,
  cn,
  Stack,
} from '@donotdev/components';

import type { ChangeEvent, ComponentProps, ComponentType } from 'react';

export interface TextAreaComponentProps extends Omit<
  ComponentProps<typeof Textarea>,
  'value' | 'onChange'
> {
  /** Field label */
  label: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Error message */
  error?: string;
  /** Helper text to display */
  helperText?: string;
  /** Number of rows (default: 3) */
  rows?: number;
  /** Loading state */
  loading?: boolean;
  /** Maximum character count */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Auto-resize based on content */
  autoResize?: boolean;
  /** Required field indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Enhanced TextAreaComponent with modern UX features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 *
 * Features:
 * - Full ARIA compliance
 * - Auto-resize functionality
 * - Loading states with spinner
 * - Character counting
 * - Error handling
 * - Required field indicators
 * - Responsive design
 *
 * @param props - TextAreaComponentProps
 * @returns JSX.Element
 */
const TextAreaComponent: ComponentType<TextAreaComponentProps> = ({
  label,
  value = '',
  onChange,
  error,
  helperText,
  rows = 3,
  loading = false,
  maxLength,
  showCharCount = false,
  autoResize = false,
  required = false,
  disabled = false,
  className,
  ...props
}) => {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasError = !!error;
  const charCount = value.length;
  const isNearLimit = maxLength && charCount > maxLength * 0.8;
  const isOverLimit = maxLength && charCount > maxLength;

  // Auto-resize functionality
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value, autoResize]);

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  return (
    <Stack gap="tight">
      {/* Textarea Container with FloatingLabel wrapper */}
      <FloatingLabel
        htmlFor={id}
        label={label}
        disabled={disabled || loading}
        required={required}
      >
        <div className="dndev-relative">
          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={onChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled || loading}
            maxLength={maxLength}
            rows={autoResize ? 1 : rows}
            bare
            aria-describedby={cn(
              hasError && `${id}-error`,
              helperText && !hasError && `${id}-helper`,
              showCharCount && `${id}-count`
            )}
            aria-invalid={hasError}
            className={cn(
              'dndev-w-full',
              autoResize && 'dndev-overflow-hidden',
              className
            )}
            data-variant={hasError ? 'destructive' : undefined}
            style={{
              resize: autoResize ? 'none' : undefined,
            }}
            {...props}
          />

          {/* Loading Spinner */}
          {loading && (
            <div
              className="dndev-absolute"
              style={{
                right: 'var(--gap-md)',
                top: 'var(--gap-md)',
              }}
            >
              <Spinner aria-label="Loading" />
            </div>
          )}
        </div>
      </FloatingLabel>

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
          as="p"
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
};

export default TextAreaComponent;
