// packages/features/crud/src/components/form/fields/CheckboxFieldComponent.tsx

/**
 * @fileoverview Checkbox Field Component
 * @description Renders a checkbox input with a label. Form field component for checkbox inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ChangeEvent, ComponentType, ReactNode } from 'react';

import { Checkbox } from '@donotdev/components';

import { InlineFieldRow } from './internal/InlineFieldRow';

export interface CheckboxFieldComponentProps {
  /** The label for the checkbox - can be a string or ReactNode (e.g., with links) */
  label: string | ReactNode;
  /** Whether the checkbox is checked */
  checked?: boolean;
  /** Change handler for the checkbox */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Whether the field is required */
  required?: boolean;
}

/**
 * CheckboxFieldComponent renders a labeled checkbox.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - CheckboxFieldComponentProps
 * @returns JSX.Element
 */
const CheckboxFieldComponent: ComponentType<CheckboxFieldComponentProps> = ({
  label,
  checked = false,
  onChange,
  required,
}) => {
  const handleChange = (checked: boolean) => {
    if (onChange) {
      onChange({
        target: { checked },
      } as ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <InlineFieldRow>
      <Checkbox
        checked={checked}
        onCheckedChange={handleChange}
        label={label}
        required={required}
      />
    </InlineFieldRow>
  );
};

export default CheckboxFieldComponent;
