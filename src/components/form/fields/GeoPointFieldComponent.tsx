// packages/features/crud/src/components/form/fields/GeoPointFieldComponent.tsx

/**
 * @fileoverview Geo Point Field Component
 * @description Provides a coordinate input field. Form field component for geographic coordinate inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Label, Input, cn, Stack } from '@donotdev/components';

import type { ChangeEvent, ComponentType } from 'react';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPointFieldComponentProps {
  /** Field label */
  label: string;
  /** Current coordinates */
  value?: GeoPoint;
  /** Change handler - accepts both event and direct value */
  onChange: (point: GeoPoint | ChangeEvent<HTMLInputElement>) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
}

/**
 * GeoPointFieldComponent renders latitude and longitude input fields
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const GeoPointFieldComponent: ComponentType<GeoPointFieldComponentProps> = ({
  label,
  value = { lat: 0, lng: 0 },
  onChange,
  error,
  helperText,
  disabled,
  required,
}) => {
  const handleLatChange = (e: ChangeEvent<HTMLInputElement>) => {
    const lat = parseFloat(e.target.value) || 0;
    if (lat >= -90 && lat <= 90) {
      const newPoint = { ...value, lat };
      // Create a synthetic event with the coordinate value
      const syntheticEvent = {
        target: { value: JSON.stringify(newPoint) },
      } as unknown as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const handleLngChange = (e: ChangeEvent<HTMLInputElement>) => {
    const lng = parseFloat(e.target.value) || 0;
    if (lng >= -180 && lng <= 180) {
      const newPoint = { ...value, lng };
      // Create a synthetic event with the coordinate value
      const syntheticEvent = {
        target: { value: JSON.stringify(newPoint) },
      } as unknown as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <Stack gap="tight">
      <Label
        required={required}
        style={{
          display: 'block',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
        }}
      >
        {label}
      </Label>
      <Stack direction="row">
        <Input
          label="Latitude"
          type="number"
          value={value.lat}
          onChange={handleLatChange}
          min="-90"
          max="90"
          step="0.000001"
          disabled={disabled}
          data-variant={error ? 'destructive' : undefined}
          className="dndev-w-full"
        />
        <Input
          label="Longitude"
          type="number"
          value={value.lng}
          onChange={handleLngChange}
          min="-180"
          max="180"
          step="0.000001"
          disabled={disabled}
          data-variant={error ? 'destructive' : undefined}
          className="dndev-w-full"
        />
      </Stack>
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

export default GeoPointFieldComponent;
