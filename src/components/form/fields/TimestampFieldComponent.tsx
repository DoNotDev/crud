// packages/features/crud/src/components/form/fields/TimestampFieldComponent.tsx

/**
 * @fileoverview TimestampFieldComponent
 * @description Timestamp field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import DateFieldComponent from './DateFieldComponent';

import type { ChangeEvent, ComponentType } from 'react';

export interface TimestampFieldComponentProps {
  /** Field label */
  label: string;
  /** Current Date value or null */
  value?: Date | null;
  /** Change handler - accepts both event and direct value */
  onChange: (date: Date | null | ChangeEvent<HTMLInputElement>) => void;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Mode for underlying date field (defaults to "datetime-local") */
  mode?: 'datetime-local' | 'date';
  /** Whether the field is required */
  required?: boolean;
}

const TimestampFieldComponent: ComponentType<TimestampFieldComponentProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  mode = 'datetime-local',
  required,
}) => {
  const stringValue = value ? new Date(value).toISOString() : '';

  const handleChange = (newDateString: string | null) => {
    if (newDateString) {
      const date = new Date(newDateString);
      // Create a synthetic event with the date value
      const syntheticEvent = {
        target: { value: date.toISOString() },
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    } else {
      // Create a synthetic event with null value
      const syntheticEvent = {
        target: { value: '' },
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <DateFieldComponent
      label={label}
      value={stringValue}
      onChange={handleChange}
      error={error}
      helperText={helperText}
      mode={mode}
      required={required}
    />
  );
};

export default TimestampFieldComponent;
