// packages/features/crud/src/components/fields/display/RangeFieldDisplay.tsx

/**
 * @fileoverview RangeFieldDisplay component
 * @description Displays range values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface RangeFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'range'>;
  /** Value to display */
  value: number;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
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
