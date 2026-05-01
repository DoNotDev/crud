'use client';
// packages/features/crud/src/components/form/fields/MultiInputTextFieldComponent.tsx

/**
 * @fileoverview MultiInputTextFieldComponent
 * @description Multi-input text field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';

import { Input, Button, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { ChangeEvent, ComponentType } from 'react';

export interface MultiInputTextFieldComponentProps {
  /** Label for the input field */
  label: string;
  /** Array of current text entries */
  value: string[];
  /** Handler for value changes - accepts both event and direct value */
  onChange: (value: string[] | ChangeEvent<HTMLInputElement>) => void;
  /** Optional classname for styling */
  className?: string;
  /** Whether the field is required */
  required?: boolean;
}

const MultiInputTextFieldComponent: ComponentType<
  MultiInputTextFieldComponentProps
> = ({ label, value = [], onChange, className, required }) => {
  const { t } = useTranslation('crud');
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      const newValue = [...value, inputValue.trim()];
      // Create a synthetic event with the array value
      const syntheticEvent = {
        target: { value: JSON.stringify(newValue) },
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
      setInputValue('');
    }
  };

  const handleRemove = (index: number) => {
    const newValue = value.filter((_, i) => i !== index);
    // Create a synthetic event with the array value
    const syntheticEvent = {
      target: { value: JSON.stringify(newValue) },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <Stack className={className}>
      <Stack direction="row" align="end">
        <Input
          label={label}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          required={required}
          className="dndev-flex-1"
          placeholder={t('form.typeAndPressAdd', 'Type and press Add...')}
        />
        <Button type="button" onClick={handleAdd} disabled={!inputValue.trim()}>
          {t('form.add', 'Add')}
        </Button>
      </Stack>
      <Stack direction="row" wrap="wrap">
        {value.map((item, index) => (
          <span
            key={index}
            className="dndev-surface"
            data-variant="muted"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--gap-sm)',
              padding: 'var(--gap-sm) var(--gap-md)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 500,
              borderRadius: 'var(--radius-lg)',
            }}
          >
            {item}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={{
                color: 'var(--muted-foreground)',
                marginInlineStart: 'var(--gap-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--foreground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--muted-foreground)';
              }}
              aria-label={`${t('form.remove', 'Remove')} ${item}`}
            >
              ×
            </button>
          </span>
        ))}
      </Stack>
    </Stack>
  );
};

export default MultiInputTextFieldComponent;
