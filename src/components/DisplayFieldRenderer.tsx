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

import type { ReactElement } from 'react';

import { Text, Stack } from '@donotdev/components';
import {
  FIELD_TEXT_FORMATTERS,
  formatFieldText,
  getI18nInstance,
  handleError,
  isEmptyFieldValue,
} from '@donotdev/core';
import type {
  EntityField,
  FieldTextFormatter,
  FieldType,
} from '@donotdev/core';

import { getDisplayFormatter } from '../fieldTypeRegistry';
import type { DisplayFormatterOptions } from '../fieldTypeRegistry';
import { translateFieldLabel } from '../forms/utils';

/** Props for {@link DisplayFieldRenderer}, renders a field value as read-only text. */
export interface DisplayFieldRendererProps<T extends FieldType = FieldType> {
  /** Field identifier */
  name: string;
  /** Field configuration */
  config: EntityField<T>;
  /** Current field value */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
  value: any;
  /** Translation function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string;
}

function warnUnregistered(config: EntityField): void {
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
}

function warnFormatError(config: EntityField, error: unknown): void {
  handleError(error, {
    userMessage: `Error formatting field "${config.label || config.name}"`,
    context: {
      fieldType: config.type,
      fieldName: config.label || 'unknown',
      operation: 'display_format',
    },
    severity: 'warning',
  });
}

/**
 * The registered display formatter of the field's type as a text formatter
 * (custom types, consumer overrides). Non-text output (React) → the core text.
 */
function registryTextFormatter(
  config: EntityField,
  options: DisplayFormatterOptions
): FieldTextFormatter | undefined {
  const formatter = getDisplayFormatter(config.type);
  if (!formatter) {
    warnUnregistered(config);
    return undefined;
  }
  return (value, field, t, { locale }) => {
    try {
      const result = formatter(value, field, t, { ...options, asString: true });
      if (typeof result === 'string') return result;
    } catch (error) {
      warnFormatError(config, error);
    }
    const core = FIELD_TEXT_FORMATTERS[field.type];
    return core ? core(value, field, t, { locale }) : String(value);
  };
}

/**
 * Formats a value for display based on field type.
 * Text output (`asString`, `displayKey`, `displayValue`) is `formatFieldText` from
 * `@donotdev/core`, the same text entity SEO uses; other output is the registered
 * display formatter's (React).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
  value: any,
  config: EntityField,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string,
  options?: DisplayFormatterOptions
): string | ReactElement {
  // Auto-resolve locale from i18n singleton when not explicitly provided
  if (options && !options.locale) {
    options.locale = getI18nInstance()?.language;
  } else if (!options) {
    options = { locale: getI18nInstance()?.language };
  }
  const compact = options.compact ?? false;
  const asString = options.asString ?? false;

  // displayValue resolver: cross-field conditional display at entity level
  // (null hides the field, a string overrides the display)
  const resolvedByEntity = Boolean(config.options?.displayValue && options.item);

  if (!resolvedByEntity && isEmptyFieldValue(value)) {
    if (asString) return '—';
    return compact ? (
      <span style={{ color: 'var(--muted-foreground)' }}>—</span>
    ) : (
      <Text variant="muted">—</Text>
    );
  }

  // Text: displayValue, displayKey (format first, then interpolate), asString
  if (asString || resolvedByEntity || config.options?.displayKey) {
    const text = formatFieldText(value, config, t, {
      item: options.item,
      locale: options.locale,
      formatter: registryTextFormatter(config, options),
    });
    if (text !== null) return text;
    return asString ? '' : <></>;
  }

  const formatter = getDisplayFormatter(config.type);
  if (formatter) {
    try {
      return formatter(value, config, t, options);
    } catch (error) {
      // Log error but don't crash - return safe fallback
      warnFormatError(config, error);
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
  warnUnregistered(config);
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
