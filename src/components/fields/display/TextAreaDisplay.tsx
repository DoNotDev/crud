// packages/features/crud/src/components/fields/display/TextAreaDisplay.tsx

/**
 * @fileoverview TextAreaDisplay component
 * @description Displays textarea values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface TextAreaDisplayProps {
  /** Field configuration */
  config: EntityField<'textarea'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * TextAreaDisplay - Displays textarea values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const TextAreaDisplay: ComponentType<TextAreaDisplayProps> = ({
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
    <Text
      as="div"
      level="small"
      className={`whitespace-pre-wrap ${className || ''}`}
    >
      {value}
    </Text>
  );
};

export default TextAreaDisplay;
