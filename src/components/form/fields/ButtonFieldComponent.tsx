// packages/features/crud/src/components/form/fields/ButtonFieldComponent.tsx

/**
 * @fileoverview ButtonFieldComponent
 * @description Button field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Button } from '@donotdev/components';
import type { ButtonVariant } from '@donotdev/components';

import type { ComponentType } from 'react';

export interface ButtonFieldComponentProps {
  /** The button label */
  label: string;
  /** The button type: submit, reset, or button */
  type: 'submit' | 'reset' | 'button';
  /** Optional click handler */
  onClick?: () => void;
  /** Button variant */
  variant?: ButtonVariant;
  /** Disabled state */
  disabled?: boolean;
}

const ButtonFieldComponent: ComponentType<ButtonFieldComponentProps> = ({
  label,
  type,
  onClick,
  variant,
  disabled = false,
}) => {
  return (
    <Button type={type} onClick={onClick} variant={variant} disabled={disabled}>
      {label}
    </Button>
  );
};

export default ButtonFieldComponent;
