// packages/features/crud/src/components/form/fields/ReferenceFieldComponent.tsx

/**
 * @fileoverview ReferenceFieldComponent
 * @description Reference field component for selecting related documents.
 * Receives options as props (no internal data fetching).
 * Supports inline creation via modal callback.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Plus } from 'lucide-react';
import { useMemo, useId } from 'react';

import {
  Combobox,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

/** Option format for reference field */
export interface ReferenceOption {
  /** Document ID */
  id: string;
  /** Display label (e.g., name) */
  label: string;
  /** Optional description for search */
  description?: string;
}

/**
 * Reference field component props
 */
export interface ReferenceFieldComponentProps {
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Selected reference document ID */
  value?: string;
  /** Change handler - receives selected ID */
  onChange: (value: string) => void;
  /** Available options to select from */
  options: ReferenceOption[];
  /** Loading state */
  isLoading?: boolean;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Blur handler */
  onBlur?: () => void;
  /** Callback to create new item - opens modal, returns new ID */
  onCreate?: () => void;
  /** Placeholder text (default: `crud:reference.placeholder`, "Select {{label}}") */
  placeholder?: string;
}

/**
 * Reference field component for selecting related documents
 *
 * Pattern: Receives options as props, doesn't fetch its own data.
 * Use ControlledReferenceField for automatic data fetching via useCrud.
 *
 * @component
 * @example
 * ```tsx
 * <ReferenceFieldComponent
 *   label="Customer"
 *   value={customerId}
 *   onChange={setCustomerId}
 *   options={customers.map(c => ({ id: c.id, label: c.name }))}
 *   isLoading={loading}
 *   onCreate={() => openCustomerModal()}
 * />
 * ```
 */
const ReferenceFieldComponent = ({
  label,
  info,
  value,
  onChange,
  options,
  isLoading = false,
  error,
  helperText,
  required,
  onBlur,
  onCreate,
  placeholder,
}: ReferenceFieldComponentProps) => {
  const { t } = useTranslation('crud');
  const id = useId();

  // Convert to Combobox format
  const comboboxOptions = useMemo(() => {
    return options.map((opt) => ({
      value: opt.id,
      label: opt.label,
      description: opt.description,
    }));
  }, [options]);

  const handleValueChange = (newValue: string | string[]) => {
    const finalValue = Array.isArray(newValue) ? newValue[0] || '' : newValue;
    onChange(finalValue);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
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
        placeholder={placeholder ?? t('reference.placeholder', { label })}
        emptyMessage={t('messages.noResults')}
        options={comboboxOptions}
        required={required}
        variant={hasError ? 'destructive' : undefined}
        isLoading={isLoading}
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

export default ReferenceFieldComponent;
