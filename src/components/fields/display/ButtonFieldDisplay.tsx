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
  value: any;
  /** Translation function */
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
