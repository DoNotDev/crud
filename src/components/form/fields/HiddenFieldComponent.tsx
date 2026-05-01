// packages/features/crud/src/components/form/fields/HiddenFieldComponent.tsx

/**
 * @fileoverview HiddenFieldComponent
 * @description Hidden field component for form inputs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

export interface HiddenFieldComponentProps {
  name: string;
  value: string;
}

const HiddenFieldComponent: ComponentType<HiddenFieldComponentProps> = ({
  name,
  value,
}) => {
  return <input type="hidden" name={name} value={value} />;
};

export default HiddenFieldComponent;
