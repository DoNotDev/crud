// packages/features/crud/src/components/fields/display/CheckboxFieldDisplay.tsx

/**
 * @fileoverview CheckboxFieldDisplay component
 * @description Displays checkbox/boolean values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface CheckboxFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'checkbox' | 'boolean'>;
  /** Value to display */
  value: boolean;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CheckboxFieldDisplay - Displays checkbox/boolean values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const CheckboxFieldDisplay: React.ComponentType<
  CheckboxFieldDisplayProps
> = ({ config, value, t, className }) => {
  if (value === null || value === undefined) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  const displayValue = value ? t('common.yes') : t('common.no');
  const variant = value ? 'default' : 'secondary';

  return (
    <Badge variant={variant} className={className}>
      {displayValue}
    </Badge>
  );
};

export default CheckboxFieldDisplay;
