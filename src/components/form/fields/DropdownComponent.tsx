// packages/features/crud/src/components/form/fields/DropdownComponent.tsx

/**
 * @fileoverview Dropdown Component
 * @description Renders a select input using Radix UI components. Form field component for dropdown/select inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Select, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { ChangeEvent, ComponentType } from 'react';

export interface DropdownComponentProps {
  /** Field label */
  label: string;
  /** Current value */
  value?: string | number | boolean;
  /** Available options */
  options: { value: string | number | boolean; label: string }[];
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Change handler - accepts both event and direct value */
  onChange?: (value: string | ChangeEvent<HTMLSelectElement>) => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Whether the field is required */
  required?: boolean;
}

/**
 * DropdownComponent renders a styled select input.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - DropdownComponentProps
 * @returns JSX.Element
 */
const DropdownComponent: ComponentType<DropdownComponentProps> = ({
  label,
  value,
  options,
  error,
  helperText,
  onChange,
  onBlur,
  required,
}) => {
  const { t } = useTranslation('crud');

  // Convert value to string - preserve undefined to maintain form state
  // Only convert to empty string if value is explicitly null or empty
  const displayValue =
    value !== undefined && value !== null ? String(value) : '';

  const handleChange = (newValue: string) => {
    if (onChange) {
      const syntheticEvent = {
        target: { value: newValue },
      } as ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <Stack gap="tight">
      <Select
        label={label}
        value={displayValue}
        onValueChange={handleChange}
        onOpenChange={(open) => !open && onBlur?.()}
        placeholder={t('actions.select', 'Select')}
        required={required}
        options={options.map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
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

export default DropdownComponent;
