// packages/features/crud/src/components/form/fields/AvatarFieldComponent.tsx

/**
 * @fileoverview AvatarFieldComponent
 * @description Input field for avatar URLs with preview
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ComponentProps, ComponentType } from 'react';

import {
  Avatar,
  Input,
  cn,
  Stack,
  FieldMessage,
  fieldMessageAria,
} from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

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
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
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
  const id = useId();

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

export default AvatarFieldComponent;
