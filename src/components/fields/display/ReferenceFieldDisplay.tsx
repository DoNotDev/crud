// packages/features/crud/src/components/fields/display/ReferenceFieldDisplay.tsx

/**
 * @fileoverview ReferenceFieldDisplay component
 * @description Displays reference values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Badge, BADGE_VARIANT, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface ReferenceFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'reference'>;
  /** Value to display */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
  value: any;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ReferenceFieldDisplay - Displays reference values as badges
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ReferenceFieldDisplay: ComponentType<
  ReferenceFieldDisplayProps
> = ({ config, value, t, className }) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  const displayValue = value.displayName || value.name || value.id || value;

  return (
    <Badge variant={BADGE_VARIANT.OUTLINE} className={className}>
      {String(displayValue)}
    </Badge>
  );
};

export default ReferenceFieldDisplay;
