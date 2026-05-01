// packages/features/crud/src/components/fields/display/ImageFieldDisplay.tsx

/**
 * @fileoverview ImageFieldDisplay component
 * @description Displays image values as avatars
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Avatar, Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface ImageFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'image'>;
  /** Value to display (image URL) */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Image size */
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
      alt={config.label || 'Image'}
      fallback={getInitials(config.label || 'IMG')}
      className={`${sizeClasses[size]} ${className || ''}`}
    />
  );
};

export default ImageFieldDisplay;
