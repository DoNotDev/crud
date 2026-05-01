// packages/features/crud/src/components/fields/display/RangeFieldDisplay.tsx

/**
 * @fileoverview RangeFieldDisplay component
 * @description Displays range values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface RangeFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'range'>;
  /** Value to display */
  value: number;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * RangeFieldDisplay - Displays range values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const RangeFieldDisplay: ComponentType<RangeFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (value === null || value === undefined) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Text as="span" className={`font-mono ${className || ''}`}>
      {value}
    </Text>
  );
};

export default RangeFieldDisplay;
