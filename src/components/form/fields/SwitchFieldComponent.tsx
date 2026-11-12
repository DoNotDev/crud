// packages/features/crud/src/components/form/fields/SwitchFieldComponent.tsx

/**
 * @fileoverview Switch Field Component
 * @description Thin wrapper around Switch component for CRUD forms.
 * Handles field label and helper text, delegates switch logic to Switch component.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ChangeEvent, ComponentType } from 'react';

import { Switch, Text, Stack } from '@donotdev/components';

import { InlineFieldRow } from './internal/InlineFieldRow';

export interface SwitchFieldComponentProps {
  /** Field label */
  label: string;
  /** Whether the toggle is checked */
  checked?: boolean;
  /** Change handler */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Label for unchecked state (e.g., "Manual") */
  uncheckedLabel?: string;
  /** Label for checked state (e.g., "Automatic") */
  checkedLabel?: string;
  /** Helper text */
  helperText?: string;
}

/**
 * SwitchFieldComponent renders a switch field for CRUD forms.
 * Displays field label, delegates switch rendering to Switch component.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - SwitchFieldComponentProps
 * @returns JSX.Element
 */
const SwitchFieldComponent: ComponentType<SwitchFieldComponentProps> = ({
  label,
  checked = false,
  onChange,
  uncheckedLabel,
  checkedLabel,
  helperText,
}) => {
  const handleChange = (checked: boolean) => {
    if (onChange) {
      // Create a synthetic event with the checked value
      onChange({
        target: { checked },
      } as ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <Stack gap="tight">
      {/* [switch] label, like a checkbox. The track is muted while off, primary while on;
          the label keeps its colour (muted text reads as disabled). */}
      <InlineFieldRow>
        <Switch
          checked={checked}
          onCheckedChange={handleChange}
          label={label}
          variant={checked ? 'primary' : 'muted'}
          uncheckedLabel={uncheckedLabel}
          checkedLabel={checkedLabel}
        />
      </InlineFieldRow>
      {helperText && (
        <Text as="p" variant="muted" level="small">
          {helperText}
        </Text>
      )}
    </Stack>
  );
};

export default SwitchFieldComponent;
