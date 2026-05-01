// packages/features/crud/src/components/fields/display/ReferenceFieldDisplay.tsx

/**
 * @fileoverview ReferenceFieldDisplay component
 * @description Displays reference values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, BADGE_VARIANT, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface ReferenceFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'reference'>;
  /** Value to display */
  value: any;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ReferenceFieldDisplay - Displays reference values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ReferenceFieldDisplay: ComponentType<
  ReferenceFieldDisplayProps
> = ({ config, value, t, className }) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  const displayValue = value.displayName || value.name || value.id || value;

  return (
    <Badge variant={BADGE_VARIANT.OUTLINE} className={className}>
      {String(displayValue)}
    </Badge>
  );
};

export default ReferenceFieldDisplay;
