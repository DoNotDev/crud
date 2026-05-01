// packages/features/crud/src/components/fields/display/BadgeFieldDisplay.tsx

/**
 * @fileoverview BadgeFieldDisplay component
 * @description Displays boolean/select values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface BadgeFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'boolean' | 'checkbox' | 'select' | 'radio'>;
  /** Value to display */
  value: boolean | string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BadgeFieldDisplay - Displays boolean/select values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const BadgeFieldDisplay: React.ComponentType<BadgeFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (value === null || value === undefined) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  const displayValue =
    typeof value === 'boolean'
      ? value
        ? t('common.yes')
        : t('common.no')
      : String(value);

  const variant =
    typeof value === 'boolean' ? (value ? 'default' : 'secondary') : 'outline';

  return (
    <Badge variant={variant} className={className}>
      {displayValue}
    </Badge>
  );
};

export default BadgeFieldDisplay;
