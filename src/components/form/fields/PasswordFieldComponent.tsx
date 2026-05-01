'use client';
// packages/features/crud/src/components/form/fields/PasswordFieldComponent.tsx

/**
 * @fileoverview Password Field Component
 * @description Renders a password input with label, error, and helper text. Form field component for password inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';

import { PasswordInput, Label, cn, Stack } from '@donotdev/components';

import type { ChangeEvent, ComponentProps, ComponentType } from 'react';

export interface PasswordFieldComponentProps extends Omit<
  ComponentProps<typeof PasswordInput>,
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
  /** Error state */
  error?: boolean;
  /** Helper text to display */
  helperText?: string;
}

/**
 * PasswordFieldComponent renders a styled password input.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - PasswordFieldComponentProps
 * @returns JSX.Element
 */
const PasswordFieldComponent: ComponentType<PasswordFieldComponentProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  ...props
}) => {
  const id = useId();

  return (
    <Stack gap="tight">
      {/* PasswordInput with native floating label support */}
      <PasswordInput
        id={id}
        value={value ?? ''}
        onChange={onChange}
        label={label}
        className="dndev-w-full"
        required={props.required}
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

export default PasswordFieldComponent;
