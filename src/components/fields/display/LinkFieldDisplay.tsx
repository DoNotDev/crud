// packages/features/crud/src/components/fields/display/LinkFieldDisplay.tsx

/**
 * @fileoverview LinkFieldDisplay component
 * @description Displays URL/email/tel values as clickable links
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface LinkFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'url' | 'email' | 'tel'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * LinkFieldDisplay - Displays URL/email/tel values as clickable links
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const LinkFieldDisplay: ComponentType<LinkFieldDisplayProps> = ({
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

  const getLinkProps = () => {
    switch (config.type) {
      case 'email':
        return {
          href: `mailto:${value}`,
          'aria-label': t('common.sendEmailTo', { email: value }),
        };
      case 'tel':
        return {
          href: `tel:${value}`,
          'aria-label': t('common.callNumber', { number: value }),
        };
      case 'url':
      default:
        return {
          href: value,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': t('common.openLink'),
        };
    }
  };

  const linkProps = getLinkProps();

  return (
    <a
      {...linkProps}
      className={className || ''}
      style={{ color: 'var(--primary)', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
    >
      {value}
    </a>
  );
};

export default LinkFieldDisplay;
