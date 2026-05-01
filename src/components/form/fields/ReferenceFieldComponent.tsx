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

import { Combobox, Stack } from '@donotdev/components';
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
  /** Selected reference document ID */
  value?: string;
  /** Change handler - receives selected ID */
  onChange: (value: string) => void;
  /** Available options to select from */
  options: ReferenceOption[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Blur handler */
  onBlur?: () => void;
  /** Callback to create new item - opens modal, returns new ID */
  onCreate?: () => void;
  /** Placeholder text */
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
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <Stack gap="tight">
      <Combobox
        label={label}
        value={value || ''}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
        placeholder={
          placeholder ||
          t('reference.placeholder', { label }) ||
          `Select ${label}`
        }
        emptyMessage={t('reference.noResults') || 'No results found'}
        options={comboboxOptions}
        required={required}
        variant={hasError ? 'destructive' : undefined}
        isLoading={isLoading}
        clearable={!!value}
      />
      {hasError && (
        <Stack
          id={errorId}
          direction="row"
          align="center"
          gap="tight"
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--destructive-foreground)',
          }}
          role="alert"
        >
          <span>⚠</span>
          {helperText}
        </Stack>
      )}
      {helperText && !hasError && (
        <p
          id={helperId}
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default ReferenceFieldComponent;
