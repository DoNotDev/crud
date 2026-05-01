// packages/features/crud/src/components/fields/display/MultiDropdownDisplay.tsx

/**
 * @fileoverview MultiDropdownDisplay component
 * @description Displays multiselect values as multiple badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, BADGE_VARIANT, Text, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface MultiDropdownDisplayProps {
  /** Field configuration */
  config: EntityField<'multiselect'>;
  /** Value to display */
  value: string[];
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MultiDropdownDisplay - Displays multiselect values as multiple badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const MultiDropdownDisplay: ComponentType<MultiDropdownDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (!value || !Array.isArray(value) || value.length === 0) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Stack direction="row" wrap="wrap" className={className}>
      {value.map((item, index) => (
        <Badge key={index} variant={BADGE_VARIANT.OUTLINE}>
          {String(item)}
        </Badge>
      ))}
    </Stack>
  );
};

export default MultiDropdownDisplay;
