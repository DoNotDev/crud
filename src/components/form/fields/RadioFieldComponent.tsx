// packages/features/crud/src/components/form/fields/RadioFieldComponent.tsx

/**
 * @fileoverview RadioFieldComponent
 * @description Radio field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ChangeEvent, ComponentType } from 'react';

import {
  RadioGroup,
  Label,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';
import type { RadioOption } from '@donotdev/components';

export interface RadioFieldComponentProps {
  /** Field label */
  label: string;
  /** Selected value */
  value?: string;
  /** Change handler - accepts both event and direct value */
  onChange: (value: string | ChangeEvent<HTMLInputElement>) => void;
  /** Available radio options */
  options: RadioOption[];
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
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
  const id = useId();
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
      <RadioGroup
        value={value}
        onValueChange={handleChange}
        items={options}
        {...fieldMessageAria({
          id: `${id}-message`,
          error,
          helperText,
        })}
      />
      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default RadioFieldComponent;
