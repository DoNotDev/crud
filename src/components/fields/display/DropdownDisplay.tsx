// packages/features/crud/src/components/fields/display/DropdownDisplay.tsx

/**
 * @fileoverview DropdownDisplay component
 * @description Displays select values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, BADGE_VARIANT, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface DropdownDisplayProps {
  /** Field configuration */
  config: EntityField<'select'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * DropdownDisplay - Displays select values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const DropdownDisplay: React.ComponentType<DropdownDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Badge variant={BADGE_VARIANT.OUTLINE} className={className}>
      {value}
    </Badge>
  );
};

export default DropdownDisplay;
