// packages/features/crud/src/components/fields/display/HiddenFieldDisplay.tsx

/**
 * @fileoverview HiddenFieldDisplay component
 * @description Hidden fields are not displayed
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import type { EntityField } from '@donotdev/core';

export interface HiddenFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'hidden'>;
  /** Value to display */
  value: string;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * HiddenFieldDisplay - Hidden fields are not displayed
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const HiddenFieldDisplay: ComponentType<
  HiddenFieldDisplayProps
> = () => {
  return null;
};

export default HiddenFieldDisplay;
