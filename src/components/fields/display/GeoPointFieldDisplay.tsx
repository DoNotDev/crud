// packages/features/crud/src/components/fields/display/GeoPointFieldDisplay.tsx

/**
 * @fileoverview GeoPointFieldDisplay component
 * @description Displays geopoint values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface GeoPointFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'geopoint'>;
  /** Value to display */
  value: { lat: number; lng: number } | null;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * GeoPointFieldDisplay - Displays geopoint values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const GeoPointFieldDisplay: ComponentType<GeoPointFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (!value || (value.lat === undefined && value.lng === undefined)) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Text as="div" level="small" className={`font-mono ${className || ''}`}>
      {value.lat?.toFixed(6)}, {value.lng?.toFixed(6)}
    </Text>
  );
};

export default GeoPointFieldDisplay;
