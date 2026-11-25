// packages/features/crud/src/components/form/fields/ComboboxComponent.tsx

/**
 * @fileoverview Combobox Component
 * @description Renders a searchable combobox input with optional creatable mode.
 * Form field component for combobox inputs in CRUD forms.
 * Uses existing Combobox component.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useId } from 'react';
import type { ChangeEvent, ComponentType } from 'react';

import {
  Combobox,
  Stack,
  cn,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

export interface ComboboxComponentProps {
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Current value */
  value?: string;
  /** Available options */
  options: { value: string; label: string }[];
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Change handler - accepts both event and direct value */
  onChange?: (value: string | ChangeEvent<HTMLSelectElement>) => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Translation namespace for placeholder fallback (default: 'dndev') */
  translationNamespace?: string;
  /** Translation key for placeholder fallback (default: 'actions.select') */
  placeholderKey?: string;
  /** Default placeholder text if translation not found (default: 'Select') */
  placeholderDefault?: string;
  /** Enable creating new values */
  creatable?: boolean;
  /** Label for create option */
  createLabel?: string;
  /** Empty message */
  emptyMessage?: string;
}

/**
 * ComboboxComponent renders a searchable combobox with autocomplete.
 * Input + Dropdown pattern: user types in input, dropdown appears below.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - ComboboxComponentProps
 * @returns JSX.Element
 */
const ComboboxComponent: ComponentType<ComboboxComponentProps> = ({
  label,
  info,
  value,
  options,
  error,
  helperText,
  onChange,
  onBlur,
  required,
  placeholder,
  translationNamespace = 'dndev',
  placeholderKey = 'actions.select',
  placeholderDefault = 'Select',
  creatable = false,
  createLabel,
  emptyMessage,
}) => {
  const { t } = useTranslation(translationNamespace);
  const id = useId();

  const comboboxOptions = useMemo(
    () =>
      options.map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      })),
    [options]
  );

  const handleValueChange = (newValue: string | string[]) => {
    if (onChange) {
      const finalValue = Array.isArray(newValue) ? newValue[0] || '' : newValue;
      const syntheticEvent = {
        target: { value: finalValue },
      } as ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onBlur?.();
    }
  };

  const hasError = !!error;

  return (
    <Stack gap="tight">
      <Combobox
        {...fieldMessageAria({ id: `${id}-message`, error, helperText })}
        label={label}
        info={info}
        value={value || ''}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
        placeholder={placeholder || t(placeholderKey, placeholderDefault)}
        emptyMessage={emptyMessage || t('messages.noResults')}
        creatable={creatable}
        createLabel={createLabel || t('actions.create')}
        options={comboboxOptions}
        required={required}
        variant={hasError ? 'destructive' : undefined}
        clearable={!!value}
      />
      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default ComboboxComponent;
