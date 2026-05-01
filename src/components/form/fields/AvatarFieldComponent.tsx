// packages/features/crud/src/components/form/fields/AvatarFieldComponent.tsx

/**
 * @fileoverview AvatarFieldComponent
 * @description Input field for avatar URLs with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Avatar, Input, cn, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentProps, ComponentType } from 'react';

export interface AvatarFieldComponentProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
> {
  /** Field configuration */
  config: EntityField<'avatar'>;
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
}

/**
 * AvatarFieldComponent - Input field for avatar URLs with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const AvatarFieldComponent: ComponentType<AvatarFieldComponentProps> = ({
  config,
  value,
  onChange,
  error,
  helperText,
  t,
  className,
  ...props
}) => {
  const getInitials = (label: string): string => {
    return label
      .split(' ')
      .map((word) => word.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <Stack>
      <Stack direction="row" align="center">
        <Avatar
          src={value}
          alt={config.label || 'Avatar'}
          fallback={getInitials(config.label || 'AV')}
          style={{
            height: 'var(--touch-target)',
            width: 'var(--touch-target)',
          }}
        />
        <div className="dndev-flex-1">
          <Input
            type="url"
            className={cn('dndev-w-full', className)}
            placeholder={t('common.enterAvatarUrl')}
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

export default AvatarFieldComponent;
