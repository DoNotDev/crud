// packages/features/crud/src/components/fields/display/TimestampFieldDisplay.tsx

/**
 * @fileoverview TimestampFieldDisplay component
 * @description Displays timestamp values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import { getI18nInstance } from '@donotdev/core';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface TimestampFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'timestamp'>;
  /** Value to display */
  value: string | number;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * TimestampFieldDisplay - Displays timestamp values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const TimestampFieldDisplay: ComponentType<
  TimestampFieldDisplayProps
> = ({ config, value, t, className }) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  try {
    const date = new Date(value);
    const locale = getI18nInstance()?.language;
    const formattedDate = date.toLocaleDateString(locale);
    const formattedTime = date.toLocaleTimeString(locale);

    return (
      <div className={className}>
        <Text as="span">{formattedDate}</Text>
        <Text as="span" variant="muted" level="small">
          {formattedTime}
        </Text>
      </div>
    );
  } catch (error) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }
};

export default TimestampFieldDisplay;
