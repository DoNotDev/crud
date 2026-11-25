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
import type { ChangeEvent, ComponentProps } from 'react';

import {
  FieldMessage,
  Input,
  cn,
  fieldMessageAria,
  Stack,
} from '@donotdev/components';

export interface TextFieldComponentProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
> {
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
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
  info,
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
        info={info}
        disabled={disabled || loading}
        maxLength={maxLength}
        required={required}
        {...fieldMessageAria({
          id: `${id}-message`,
          error,
          helperText,
          describedBy: showCharCount && maxLength ? `${id}-count` : undefined,
        })}
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
              ? 'var(--destructive)'
              : isNearLimit
                ? 'var(--warning)'
                : 'var(--muted-foreground)',
          }}
        >
          {charCount}/{maxLength}
        </div>
      )}

      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
}

export default TextFieldComponent;
