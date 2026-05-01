// packages/features/crud/src/components/fields/display/NumberFieldDisplay.tsx

/**
 * @fileoverview NumberFieldDisplay component
 * @description Displays number values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text, Spinner } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';
import { getI18nInstance } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface NumberFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'number' | 'range'>;
  /** Value to display */
  value: number;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the field is loading */
  loading?: boolean;
}

/**
 * NumberFieldDisplay - Displays number values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const NumberFieldDisplay: ComponentType<NumberFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
  loading = false,
}) => {
  if (loading) {
    return <Spinner className={className} />;
  }

  if (value === null || value === undefined) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Text as="span" className={`font-mono ${className || ''}`}>
      {value.toLocaleString(getI18nInstance()?.language)}
    </Text>
  );
};

export default NumberFieldDisplay;
