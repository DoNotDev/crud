// packages/features/crud/src/components/fields/display/ButtonFieldDisplay.tsx

/**
 * @fileoverview ButtonFieldDisplay component
 * @description Button fields are not displayed in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { EntityField } from '@donotdev/core';

export interface ButtonFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'submit' | 'reset'>;
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
 * ButtonFieldDisplay - Button fields are not displayed in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ButtonFieldDisplay: React.ComponentType<
  ButtonFieldDisplayProps
> = () => {
  return null;
};

export default ButtonFieldDisplay;
