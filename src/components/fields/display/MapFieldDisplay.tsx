// packages/features/crud/src/components/fields/display/MapFieldDisplay.tsx

/**
 * @fileoverview MapFieldDisplay component
 * @description Displays map values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface MapFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'map'>;
  /** Value to display */
  value: { lat: number; lng: number } | null;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MapFieldDisplay - Displays map values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const MapFieldDisplay: ComponentType<MapFieldDisplayProps> = ({
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

export default MapFieldDisplay;
