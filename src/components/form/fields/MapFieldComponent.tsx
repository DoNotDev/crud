// packages/features/crud/src/components/form/fields/MapFieldComponent.tsx

/**
 * @fileoverview MapFieldComponent
 * @description Map field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ChangeEvent, ComponentType } from 'react';

import { Input, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

export interface MapFieldComponentProps {
  /** Field label */
  label: string;
  /** Map data as an object */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
  value?: Record<string, any>;
  /** Change handler - accepts both event and direct value */
  onChange: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
    value: Record<string, any> | ChangeEvent<HTMLInputElement>
  ) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
}

const MapFieldComponent: ComponentType<MapFieldComponentProps> = ({
  label,
  value = {},
  onChange,
  error,
  helperText,
  required,
}) => {
  const { t } = useTranslation('crud');
  // Placeholder implementation: Replace with an actual map integration as needed.
  return (
    <Stack gap="tight">
      <div
        className="dndev-surface"
        data-variant={error ? 'destructive' : 'default'}
        style={{
          border: '1px solid',
          borderColor: error ? 'var(--destructive)' : 'var(--input)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--gap-md)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--muted-foreground)',
            marginBottom: 'var(--gap-md)',
          }}
        >
          Map component placeholder
        </p>
        <Input
          label={label}
          type="text"
          required={required}
          className="dndev-w-full"
          placeholder={t(
            'form.enterLocationData',
            'Enter location data (JSON)'
          )}
          value={JSON.stringify(value)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              // Create a synthetic event with the map value
              const syntheticEvent = {
                target: { value: JSON.stringify(parsed) },
              } as unknown as ChangeEvent<HTMLInputElement>;
              onChange(syntheticEvent);
            } catch {
              // Create a synthetic event with empty map value
              const syntheticEvent = {
                target: { value: '{}' },
              } as unknown as ChangeEvent<HTMLInputElement>;
              onChange(syntheticEvent);
            }
          }}
        />
      </div>
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

export default MapFieldComponent;
