// packages/features/crud/src/components/form/fields/BadgeFieldComponent.tsx

/**
 * @fileoverview BadgeFieldComponent
 * @description Input field for badge text with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, Input, cn, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentProps, ComponentType } from 'react';

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
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Translation function */
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
            {...props}
          />
        </div>
      </Stack>

      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default BadgeFieldComponent;
