// packages/features/crud/src/components/fields/display/TimestampFieldDisplay.tsx

/**
 * @fileoverview TimestampFieldDisplay component
 * @description Displays timestamp values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Text } from '@donotdev/components';
import { formatTimeZoneFor, getI18nInstance } from '@donotdev/core';
import type { EntityField } from '@donotdev/core';

export interface TimestampFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'timestamp'>;
  /** Value to display */
  value: string | number;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
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
    // The app's zone (i18n.timeZone): the same text on the server and in the browser;
    // a calendar date (YYYY-MM-DD) reads as written
    const timeZone = formatTimeZoneFor(value);
    const formattedDate = date.toLocaleDateString(locale, { timeZone });
    const formattedTime = date.toLocaleTimeString(locale, { timeZone });

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
