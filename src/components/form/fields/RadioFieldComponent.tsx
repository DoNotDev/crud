// packages/features/crud/src/components/form/fields/RadioFieldComponent.tsx

/**
 * @fileoverview RadioFieldComponent
 * @description Radio field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { RadioGroup, Label, Stack } from '@donotdev/components';
import type { RadioOption } from '@donotdev/components';

import type { ChangeEvent, ComponentType } from 'react';

export interface RadioFieldComponentProps {
  /** Field label */
  label: string;
  /** Selected value */
  value?: string;
  /** Change handler - accepts both event and direct value */
  onChange: (value: string | ChangeEvent<HTMLInputElement>) => void;
  /** Available radio options */
  options: RadioOption[];
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
}

const RadioFieldComponent: ComponentType<RadioFieldComponentProps> = ({
  label,
  value,
  onChange,
  options,
  error,
  helperText,
  required,
}) => {
  const handleChange = (newValue: string) => {
    // Create a synthetic event with the string value
    const syntheticEvent = {
      target: { value: newValue },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <Stack gap="tight">
      <Label
        required={required}
        style={{
          display: 'block',
          fontSize: 'var(--font-size-input)',
          fontWeight: 500,
        }}
      >
        {label}
      </Label>
      <RadioGroup value={value} onValueChange={handleChange} items={options} />
      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default RadioFieldComponent;
