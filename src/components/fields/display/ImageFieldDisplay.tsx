// packages/features/crud/src/components/fields/display/ImageFieldDisplay.tsx

/**
 * @fileoverview ImageFieldDisplay component
 * @description Displays image values as avatars
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Avatar, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

/** Box per `size`: sm / md the 48px touch target, lg 64px (inline: wins over the Avatar's 32px default) */
const SIZE_STYLES = {
  sm: { width: 'var(--touch-target)', height: 'var(--touch-target)' },
  md: { width: 'var(--touch-target)', height: 'var(--touch-target)' },
  lg: { width: '4rem', height: '4rem' },
} as const;

export interface ImageFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'image'>;
  /** Value to display (image URL) */
  value: string;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Size: `sm` / `md` 48px (touch target), `lg` 64px. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * ImageFieldDisplay - Displays image values as avatars
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ImageFieldDisplay: ComponentType<ImageFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
  size = 'md',
}) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        —
      </Text>
    );
  }


  const getInitials = (label: string): string => {
    return label
      .split(' ')
      .map((word) => word.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <Avatar
      src={value}
      alt={config.label || 'Image'}
      fallback={getInitials(config.label || 'IMG')}
      className={className}
      style={SIZE_STYLES[size]}
    />
  );
};

export default ImageFieldDisplay;
