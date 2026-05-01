// packages/features/crud/src/components/fields/display/DateFieldDisplay.tsx

/**
 * @fileoverview DateFieldDisplay component
 * @description Displays date values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text, Spinner } from '@donotdev/components';
import { getI18nInstance } from '@donotdev/core';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface DateFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'date' | 'datetime-local'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the field is loading */
  loading?: boolean;
}

/**
 * DateFieldDisplay - Displays date values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const DateFieldDisplay: ComponentType<DateFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
  loading = false,
}) => {
  if (loading) {
    return <Spinner className={className} />;
  }

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

    if (config.type === 'date') {
      return (
        <Text as="span" className={className}>
          {formattedDate}
        </Text>
      );
    } else {
      return (
        <div className={className}>
          <Text as="span">{formattedDate}</Text>
          <Text as="span" variant="muted" level="small">
            {formattedTime}
          </Text>
        </div>
      );
    }
  } catch (error) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }
};

export default DateFieldDisplay;
