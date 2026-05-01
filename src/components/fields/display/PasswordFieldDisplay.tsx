// packages/features/crud/src/components/fields/display/PasswordFieldDisplay.tsx

/**
 * @fileoverview PasswordFieldDisplay component
 * @description Displays password values with show/hide toggle and copy functionality
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Skeleton, Button, CopyToClipboard, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface PasswordFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'password'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the field is loading */
  loading?: boolean;
}

/**
 * PasswordFieldDisplay - Displays password values with show/hide toggle and copy functionality
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const PasswordFieldDisplay: ComponentType<PasswordFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
  loading = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  if (loading) {
    return <Skeleton className={className} />;
  }

  if (!value) {
    return <div style={{ color: 'var(--muted-foreground)' }}>-</div>;
  }

  return (
    <Stack direction="row" align="center" className={className}>
      <span style={{ fontFamily: 'monospace' }}>
        {isVisible ? value : '••••••••'}
      </span>

      <Stack direction="row" align="center" gap="tight">
        <Button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
        >
          {isVisible ? <EyeOff /> : <Eye />}
        </Button>

        <CopyToClipboard
          text={value}
          tooltipText={t('copyToClipboard') || 'Copy to clipboard'}
          copiedTooltipText={t('copied') || 'Copied!'}
          ariaLabel={t('copyPassword') || 'Copy password'}
        />
      </Stack>
    </Stack>
  );
};

export default PasswordFieldDisplay;
