'use client';
// packages/features/crud/src/components/DisplayFieldRenderer.tsx

/**
 * @fileoverview DisplayFieldRenderer component
 * @description Renders field values as read-only display (not editable inputs)
 * Used when editable=false or user doesn't have edit permissions
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text, Stack } from '@donotdev/components';
import { handleError, getI18nInstance } from '@donotdev/core';
import type { FieldType, EntityField } from '@donotdev/core';

import { getDisplayFormatter } from '../fieldTypeRegistry';
import { translateFieldLabel } from '../forms/utils';

import type { DisplayFormatterOptions } from '../fieldTypeRegistry';
import type { ReactElement } from 'react';

/** Props for {@link DisplayFieldRenderer}, renders a field value as read-only text. */
export interface DisplayFieldRendererProps<T extends FieldType = FieldType> {
  /** Field identifier */
  name: string;
  /** Field configuration */
  config: EntityField<T>;
  /** Current field value */
  value: any;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
}

/**
 * Formats a value for display based on field type
 *
 * @param value - Field value to format
 * @param config - Field configuration
 * @param t - Translation function
 * @param options - Formatting options
 * @param options.compact - Use compact formatting (smaller images, plain spans for empty)
 * @param options.asString - Prefer string output when possible (e.g. for price in text placeholders)
 * @returns Formatted value as string or ReactElement
 */
export function formatValue(
  value: any,
  config: EntityField,
  t: (key: string, options?: Record<string, any>) => string,
  options?: DisplayFormatterOptions
): string | ReactElement {
  // Auto-resolve locale from i18n singleton when not explicitly provided
  if (options && !options.locale) {
    options.locale = getI18nInstance()?.language;
  } else if (!options) {
    options = { locale: getI18nInstance()?.language };
  }
  const compact = options?.compact ?? false;
  const asString = options?.asString ?? false;

  // displayValue resolver: cross-field conditional display at entity level
  // Returns null to hide the field, string to override display
  const displayValueFn = config.options?.displayValue;
  if (displayValueFn && options?.item) {
    const resolved = displayValueFn(value, options.item, t);
    if (resolved === null) return asString ? '' : <></>;
    return resolved;
  }

  if (value === null || value === undefined || value === '') {
    if (asString) return '—';
    return compact ? (
      <span style={{ color: 'var(--muted-foreground)' }}>—</span>
    ) : (
      <Text variant="muted">—</Text>
    );
  }

  const formatter = getDisplayFormatter(config.type);

  // displayKey composes with type formatter: format first, then interpolate
  const displayKey = config.options?.displayKey;
  if (displayKey) {
    let formatted = String(value);
    if (formatter) {
      try {
        const result = formatter(value, config, t, options);
        formatted = typeof result === 'string' ? result : String(value);
      } catch {
        /* fall through with raw value */
      }
    }
    const keys = (Array.isArray(displayKey) ? displayKey : [displayKey]).map(
      (k) => k.replace('{{value}}', formatted)
    );
    return t(keys as unknown as string, { value: formatted });
  }

  if (formatter) {
    try {
      return formatter(value, config, t, options);
    } catch (error) {
      // Log error but don't crash - return safe fallback
      handleError(error as Error, {
        userMessage: `Error formatting field "${config.label || config.name}"`,
        context: {
          fieldType: config.type,
          fieldName: config.label || 'unknown',
          operation: 'display_format',
        },
        severity: 'warning',
      });
      if (asString) return String(value);
      return compact ? (
        <span style={{ color: 'var(--muted-foreground)' }}>
          {String(value)}
        </span>
      ) : (
        <Text variant="muted">{String(value)}</Text>
      );
    }
  }

  // Fallback for unregistered types - return safe display instead of crashing
  handleError(
    new Error(
      `Display formatter not registered for field type: ${config.type}`
    ),
    {
      userMessage: `Field type "${config.type}" is missing display formatter`,
      context: {
        fieldType: config.type,
        fieldName: config.label || 'unknown',
        operation: 'display_format',
        fix: 'Add displayFormatter to registerBuiltinFieldType() in registerBuiltinFieldTypes.tsx',
      },
      severity: 'warning',
    }
  );
  if (asString) return String(value);
  return compact ? (
    <span style={{ color: 'var(--muted-foreground)' }}>{String(value)}</span>
  ) : (
    <Text variant="muted">{String(value)}</Text>
  );
}

/**
 * DisplayFieldRenderer - Renders a field value as read-only display
 *
 * Used when:
 * - editable: false (field is never editable)
 * - editable: 'admin' and viewer is not admin
 * - `EDITABLE.CREATE_ONLY` and viewing existing record
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function DisplayFieldRenderer<T extends FieldType = FieldType>({
  name,
  config,
  value,
  t,
}: DisplayFieldRendererProps<T>): ReactElement {
  const formattedValue = formatValue(value, config, t, { compact: false });
  const label = translateFieldLabel(name, config, t);

  return (
    <Stack
      direction="row"
      align="baseline"
      style={{
        marginBottom: 'var(--gap-sm)',
        padding: 'var(--gap-sm)',
        minHeight: '38px',
        alignItems: 'center',
      }}
    >
      <Text
        variant="muted"
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          minWidth: 'fit-content',
          flexShrink: 0,
        }}
      >
        {label}:
      </Text>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {typeof formattedValue === 'string' ? (
          <Text>{formattedValue}</Text>
        ) : (
          formattedValue
        )}
      </div>
    </Stack>
  );
}

export default DisplayFieldRenderer;
