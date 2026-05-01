// packages/features/crud/src/components/form/fields/MultiDropdownComponent.tsx

/**
 * @fileoverview Multi Dropdown Component
 * @description Renders a multi-select dropdown field using Combobox component.
 * Form field component for multi-select inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useId } from 'react';

import { Combobox, Tag, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { ChangeEvent, ComponentType } from 'react';

/** Show all chips up to this count; above it, collapse */
const MAX_VISIBLE = 4;
/** When collapsed, show this many chips + "+N more" */
const COLLAPSE_VISIBLE = 3;

export interface MultiDropdownComponentProps {
  /** Label for the dropdown */
  label: string;
  /** Current selected values */
  value?: string[];
  /** Options for selection */
  options: { value: string | number | boolean; label: string }[];
  /** Whether an error exists */
  error?: boolean;
  /** Helper text for the field */
  helperText?: string;
  /** Change handler - accepts both event and direct value */
  onChange: (value: string[] | ChangeEvent<HTMLSelectElement>) => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Whether the field is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MultiDropdownComponent renders a multi-select dropdown field using Radix UI's Select.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - MultiDropdownComponentProps
 * @returns JSX.Element
 */
const MultiDropdownComponent: ComponentType<MultiDropdownComponentProps> = ({
  label,
  value = [],
  options,
  error,
  helperText,
  onChange,
  onBlur,
  required,
  className,
}) => {
  const { t } = useTranslation('crud');
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
    const finalValue = Array.isArray(newValue) ? newValue : [newValue];
    const syntheticEvent = {
      target: { value: JSON.stringify(finalValue) },
    } as ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onBlur?.();
    }
  };

  const removeValue = (valueToRemove: string) => {
    const newValue = value.filter((v) => v !== valueToRemove);
    const syntheticEvent = {
      target: { value: JSON.stringify(newValue) },
    } as ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  const hasError = !!error;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const chips =
    value.length > 0 ? (
      <>
        {value
          .slice(0, value.length > MAX_VISIBLE ? COLLAPSE_VISIBLE : MAX_VISIBLE)
          .map((val, index) => {
            const optLabel =
              options.find((opt) => String(opt.value) === val)?.label || val;
            return (
              <Tag key={index} size="sm" onRemove={() => removeValue(val)}>
                {optLabel}
              </Tag>
            );
          })}
        {value.length > MAX_VISIBLE && (
          <Tag size="sm" variant="outline" disabled>
            +{value.length - COLLAPSE_VISIBLE} more
          </Tag>
        )}
      </>
    ) : undefined;

  return (
    <Stack gap="tight" className={className}>
      {/* Multi-select combobox with inline chips */}
      <Combobox
        label={label}
        value={value}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
        placeholder={t('actions.selectOptions', 'Select options...')}
        emptyMessage={t('messages.noResults', 'No results found')}
        options={comboboxOptions}
        multiple={true}
        required={required}
        variant={hasError ? 'destructive' : undefined}
        chips={chips}
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

export default MultiDropdownComponent;
