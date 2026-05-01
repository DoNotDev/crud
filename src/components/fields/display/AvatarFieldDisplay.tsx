// packages/features/crud/src/components/fields/display/AvatarFieldDisplay.tsx

/**
 * @fileoverview AvatarFieldDisplay component
 * @description Displays image values as avatars
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Avatar, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface AvatarFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'image'>;
  /** Value to display (image URL) */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * AvatarFieldDisplay - Displays image values as avatars
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const AvatarFieldDisplay: React.ComponentType<
  AvatarFieldDisplayProps
> = ({ config, value, t, className, size = 'md' }) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  const sizeClasses = {
    sm: 'size-touch',
    md: 'size-touch',
    lg: 'h-16 w-16',
  };

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
      alt={config.label || 'Avatar'}
      fallback={getInitials(config.label || 'AV')}
      className={`${sizeClasses[size]} ${className || ''}`}
    />
  );
};

export default AvatarFieldDisplay;
