// packages/features/crud/src/components/fields/display/RadioFieldDisplay.tsx

/**
 * @fileoverview RadioFieldDisplay component
 * @description Displays radio values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Badge, BADGE_VARIANT, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface RadioFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'radio'>;
  /** Value to display */
  value: string;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * RadioFieldDisplay - Displays radio values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const RadioFieldDisplay: ComponentType<RadioFieldDisplayProps> = ({
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

export default RadioFieldDisplay;
