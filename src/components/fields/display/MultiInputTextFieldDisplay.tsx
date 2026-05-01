// packages/features/crud/src/components/fields/display/MultiInputTextFieldDisplay.tsx

/**
 * @fileoverview MultiInputTextFieldDisplay component
 * @description Displays array values as multiple badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, BADGE_VARIANT, Text, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface MultiInputTextFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'array'>;
  /** Value to display */
  value: any[];
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MultiInputTextFieldDisplay - Displays array values as multiple badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const MultiInputTextFieldDisplay: ComponentType<
  MultiInputTextFieldDisplayProps
> = ({ config, value, t, className }) => {
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

export default MultiInputTextFieldDisplay;
