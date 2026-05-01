// packages/features/crud/src/components/fields/display/TextFieldDisplay.tsx

/**
 * @fileoverview TextFieldDisplay component
 * @description Enhanced text field display with modern UX features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Copy, Mail, Calendar, Clock } from 'lucide-react';
import { useState } from 'react';

import {
  Skeleton,
  Badge,
  BADGE_VARIANT,
  Button,
  Text,
  cn,
  CopyToClipboard,
  Stack,
} from '@donotdev/components';
import type { EntityField } from '@donotdev/core';
import { getWeekFromISOString, getI18nInstance } from '@donotdev/core';

import type { ComponentType } from 'react';

export interface TextFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'text' | 'email' | 'month' | 'week' | 'time'>;
  /** Value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the field is loading */
  loading?: boolean;
  /** Show copy button */
  showCopy?: boolean;
  /** Show as badge */
  asBadge?: boolean;
  /** Truncate long text */
  truncate?: boolean;
  /** Maximum length before truncation */
  maxLength?: number;
  /** Show field label */
  showLabel?: boolean;
}

/**
 * Enhanced TextFieldDisplay with modern UX features
 *
 * Features:
 * - Smart formatting based on field type
 * - Copy to clipboard functionality
 * - Truncation with tooltips
 * - Badge display option
 * - Loading states
 * - Responsive design
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const TextFieldDisplay: ComponentType<TextFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
  loading = false,
  showCopy = false,
  asBadge = false,
  truncate = false,
  maxLength = 50,
  showLabel = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const getFieldIcon = () => {
    switch (config.type) {
      case 'email':
        return <Mail />;
      case 'month':
      case 'week':
        return <Calendar />;
      case 'time':
        return <Clock />;
      default:
        return null;
    }
  };

  const formatValue = (val: string) => {
    if (!val) return null;

    switch (config.type) {
      case 'email':
        return (
          <a
            href={`mailto:${val}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-sm)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.textDecoration = 'underline')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.textDecoration = 'none')
            }
          >
            {getFieldIcon()}
            {val}
          </a>
        );
      case 'month':
        return new Date(val).toLocaleDateString(getI18nInstance()?.language, {
          year: 'numeric',
          month: 'long',
        });
      case 'week':
        // Use the centralized date utility for week calculation
        return getWeekFromISOString(val);
      case 'time':
        return new Date(`2000-01-01T${val}`).toLocaleTimeString(
          getI18nInstance()?.language
        );
      default:
        return val;
    }
  };

  const getTruncatedValue = (val: string) => {
    if (!truncate || val.length <= maxLength) return val;
    return `${val.substring(0, maxLength)}...`;
  };

  if (loading) {
    return (
      <Stack gap="tight">
        {showLabel && <Skeleton style={{ height: '1rem', width: '6rem' }} />}
        <Skeleton className="dndev-w-full" style={{ height: '1.5rem' }} />
      </Stack>
    );
  }

  if (!value) {
    return (
      <Stack gap="tight">
        {showLabel && (
          <Text as="span" variant="muted">
            {config.label || config.name}
          </Text>
        )}
        <Text
          as="span"
          variant="muted"
          className={cn(className)}
          style={{ fontStyle: 'italic' }}
        >
          {t('common.noValue', { defaultValue: 'No value' })}
        </Text>
      </Stack>
    );
  }

  const displayValue = formatValue(value);
  const truncatedValue = getTruncatedValue(String(displayValue));

  if (asBadge) {
    return (
      <Stack direction="row" align="center" gap="tight">
        {getFieldIcon()}
        <Badge variant={BADGE_VARIANT.SECONDARY} className={className}>
          {truncatedValue}
        </Badge>
        {showCopy && (
          <CopyToClipboard
            text={value}
            tooltipText={t('copyToClipboard') || 'Copy to clipboard'}
            copiedTooltipText={t('copied') || 'Copied!'}
            ariaLabel={t('copyToClipboard') || 'Copy to clipboard'}
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="tight">
      {showLabel && (
        <Text as="span" variant="muted">
          {config.label || config.name}
        </Text>
      )}
      <Stack direction="row" align="center" gap="tight">
        <div
          className={cn('dndev-flex-1', truncate && 'truncate', className)}
          title={truncate && value.length > maxLength ? value : undefined}
        >
          <Text as="span">{truncatedValue}</Text>
        </div>
        {showCopy && (
          <CopyToClipboard
            text={value}
            tooltipText={t('copyToClipboard') || 'Copy to clipboard'}
            copiedTooltipText={t('copied') || 'Copied!'}
            ariaLabel={t('copyToClipboard') || 'Copy to clipboard'}
          />
        )}
      </Stack>
    </Stack>
  );
};

export default TextFieldDisplay;
