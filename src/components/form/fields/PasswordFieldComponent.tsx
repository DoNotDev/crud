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
import type { ChangeEvent, ComponentProps, ComponentType } from 'react';

import {
  PasswordInput,
  cn,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';

export interface PasswordFieldComponentProps extends Omit<
  ComponentProps<typeof PasswordInput>,
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
  info,
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
        info={info}
        className="dndev-w-full"
        required={props.required}
        {...fieldMessageAria({
          id: `${id}-message`,
          error,
          helperText,
        })}
        {...props}
      />
      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default PasswordFieldComponent;
