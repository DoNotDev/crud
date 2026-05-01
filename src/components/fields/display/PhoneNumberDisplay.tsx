// packages/features/crud/src/components/fields/display/PhoneNumberDisplay.tsx

/**
 * @fileoverview PhoneNumberDisplay component
 * @description Displays phone number values as clickable links
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface PhoneNumberDisplayProps {
  /** Field configuration */
  config: EntityField<'tel'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * PhoneNumberDisplay - Displays phone number values as clickable links
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const PhoneNumberDisplay: ComponentType<PhoneNumberDisplayProps> = ({
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
    <a
      href={`tel:${value}`}
      className={className || ''}
      style={{ color: 'var(--primary)', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
      aria-label={t('common.callNumber', { number: value })}
    >
      {value}
    </a>
  );
};

export default PhoneNumberDisplay;
