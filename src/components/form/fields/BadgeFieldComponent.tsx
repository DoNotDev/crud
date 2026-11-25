// packages/features/crud/src/components/form/fields/BadgeFieldComponent.tsx

/**
 * @fileoverview BadgeFieldComponent
 * @description Input field for badge text with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ComponentProps, ComponentType } from 'react';

import {
  Badge,
  Input,
  cn,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface BadgeFieldComponentProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
> {
  /** Field configuration */
  config: EntityField<'badge'>;
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Badge variant */
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

/**
 * BadgeFieldComponent - Input field for badge text with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const BadgeFieldComponent: ComponentType<BadgeFieldComponentProps> = ({
  config,
  value,
  onChange,
  error,
  helperText,
  t,
  variant = 'default',
  className,
  ...props
}) => {
  const id = useId();

  return (
    <Stack>
      <Stack direction="row" align="center">
        <Badge variant={variant} style={{ minWidth: 0 }}>
          {value || t('common.badgePreview')}
        </Badge>
        <div className="dndev-flex-1">
          <Input
            type="text"
            className={cn('dndev-w-full', className)}
            placeholder={t('common.enterBadgeText')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...fieldMessageAria({
              id: `${id}-message`,
              error,
              helperText,
            })}
            {...props}
          />
        </div>
      </Stack>

      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default BadgeFieldComponent;
