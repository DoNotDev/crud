'use client';
// packages/features/crud/src/registerBuiltinFieldTypes.tsx

/**
 * @fileoverview Unified Built-in Field Type Registration
 * @description Single registration point for all built-in field types.
 * Coordinates schema, components, filter metadata, and display formatting.
 *
 * Display customization uses `displayKey` on field options — an i18n key (or array for fallback)
 * resolved via `t(displayKey, { value })`. Handled in `formatValue()` before type-specific formatters.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// NOTE: Schema generators are NOT imported here - they're already registered
// in @donotdev/core/schemas/getSchemaType.ts on module load.
// This registry only handles UI components + filter/display metadata.

import {
  Text,
  Stack,
  ImageGallery,
  Rating,
  CopyToClipboard,
} from '@donotdev/components';
import { formatCurrency, sanitizeHref } from '@donotdev/core';
import type { FieldType } from '@donotdev/core';
import type { EntityField } from '@donotdev/core';

import {
  ControlledCheckboxField,
  ControlledComboboxField,
  ControlledDateField,
  ControlledDropdownField,
  ControlledFileField,
  ControlledMultiFileField,
  ControlledDocumentField,
  ControlledMultiDocumentField,
  ControlledGeoPointField,
  ControlledImageField,
  ControlledMapField,
  ControlledMultiDropdownField,
  ControlledMultiInputField,
  ControlledNumberField,
  ControlledPasswordField,
  ControlledPhoneField,
  ControlledRangeField,
  ControlledRatingField,
  ControlledDurationField,
  ControlledRadioField,
  ControlledReferenceField,
  ControlledYearField,
  ControlledTextField,
  ControlledTextareaField,
  ControlledRichTextField,
  ControlledTimestampField,
  ControlledAddressField,
  ControlledFieldArrayField,
  type SubFieldDef,
  ControlledSwitchField,
  ControlledMultiImageField,
  ControlledGdprConsentField,
  ControlledCurrencyField,
  ControlledPriceField,
} from './components/controlled';
import {
  AvatarFieldComponent,
  BadgeFieldComponent,
  ButtonFieldComponent,
  HiddenFieldComponent,
  TextAreaComponent,
  RichTextComponent,
  TextFieldComponent,
} from './components/form/fields';
import { translateLabel } from './forms/utils';
import { sanitizeHtml } from './utils/sanitizeHtml';

import type { UncontrolledFieldProps } from './FieldRegistry';
import type {
  FieldTypeMetadata,
  DisplayFormatter,
  DisplayFormatterOptions,
} from './fieldTypeRegistry.types';
import type { ChangeEvent, ReactElement } from 'react';

// ============================================================================
// Display Formatters
// ============================================================================

/**
 * Helper to render empty value
 */
function renderEmpty(compact: boolean): ReactElement {
  return compact ? (
    <span style={{ color: 'var(--muted-foreground)' }}>—</span>
  ) : (
    <Text variant="muted">—</Text>
  );
}

/**
 * Display formatters for each field type
 */
const displayFormatters = {
  // Date/time types
  timestamp: (
    value: any,
    config: EntityField,
    t: (key: string, options?: Record<string, any>) => string,
    options?: DisplayFormatterOptions
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    try {
      const date = value instanceof Date ? value : new Date(value);
      return date.toLocaleString(options?.locale);
    } catch {
      return String(value);
    }
  },
  date: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    try {
      const date = value instanceof Date ? value : new Date(value);
      return date.toLocaleDateString(options?.locale);
    } catch {
      return String(value);
    }
  },
  'datetime-local': (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    try {
      const date = value instanceof Date ? value : new Date(value);
      return date.toLocaleString(options?.locale);
    } catch {
      return String(value);
    }
  },
  time: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    try {
      const date = value instanceof Date ? value : new Date(value);
      return date.toLocaleTimeString(options?.locale);
    } catch {
      return String(value);
    }
  },
  week: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    return String(value);
  },
  month: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    return String(value);
  },

  // Boolean types
  boolean: (value, config, t) => {
    return value ? 'Yes' : 'No';
  },
  checkbox: (value, config, t) => {
    return value ? 'Yes' : 'No';
  },
  switch: (value, config, t) => {
    const fieldSpecific = config.options?.fieldSpecific as
      | {
          uncheckedLabel?: string;
          checkedLabel?: string;
          uncheckedValue?: string | boolean;
          checkedValue?: string | boolean;
        }
      | undefined;

    if (fieldSpecific) {
      const uncheckedValue = fieldSpecific.uncheckedValue ?? false;
      const checkedValue = fieldSpecific.checkedValue ?? true;

      if (value === checkedValue && fieldSpecific.checkedLabel) {
        return translateLabel(fieldSpecific.checkedLabel, t);
      }
      if (value === uncheckedValue && fieldSpecific.uncheckedLabel) {
        return translateLabel(fieldSpecific.uncheckedLabel, t);
      }
    }

    return value ? 'Yes' : 'No';
  },

  // Numeric types
  year: (value, config, t) => {
    return String(value);
  },
  number: (value, _config, _t, options) => {
    if (value === null || value === undefined || value === '') return '—';
    return typeof value === 'number'
      ? value.toLocaleString(options?.locale)
      : String(value);
  },
  currency: (value, config, t) => {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      Number.isNaN(Number(value))
    ) {
      return '';
    }
    // Get currency code from field options
    const options = config.options || {};
    const fieldSpecific = options.fieldSpecific as
      | { currency?: string }
      | undefined;
    const currencyCode = fieldSpecific?.currency || 'EUR';
    return formatCurrency(value, currencyCode);
  },
  price: (
    value: any,
    config: EntityField,
    t: (key: string, options?: Record<string, unknown>) => string,
    options?: { compact?: boolean; asString?: boolean }
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    const asString = options?.asString ?? false;
    // Backward compat: legacy DB may have price as number
    const normalized =
      value != null && typeof value === 'number'
        ? {
            amount: value,
            currency: 'EUR' as const,
            vatIncluded: true,
            discountPercent: 0,
          }
        : value;
    if (
      normalized === null ||
      normalized === undefined ||
      typeof normalized !== 'object'
    ) {
      return renderEmpty(compact);
    }
    const amount = normalized.amount;
    if (
      amount === null ||
      amount === undefined ||
      amount === '' ||
      Number.isNaN(Number(amount))
    ) {
      return renderEmpty(compact);
    }
    const currencyCode = normalized.currency || 'EUR';
    const vatIncluded = normalized.vatIncluded ?? true;
    const discountPercent = normalized.discountPercent ?? 0;
    const effective =
      discountPercent > 0 ? amount * (1 - discountPercent / 100) : amount;
    const vatLabel = vatIncluded
      ? ` ${t('crud:price.vatIncluded', { defaultValue: 'VAT Incl.' })}`
      : '';
    if (discountPercent > 0) {
      const formattedOriginal = formatCurrency(amount, currencyCode);
      const formattedEffective = formatCurrency(effective, currencyCode);
      const discountClue = ` ${t('crud:price.discountPercent', {
        percent: Math.round(discountPercent),
        defaultValue: '-{{percent}}%',
      })}`;
      if (asString) {
        return `${formattedEffective}${vatLabel}${discountClue}`;
      }
      if (compact) {
        return (
          <Text variant="success" weight="bold">
            {formattedEffective}
            {vatLabel}
            {discountClue}
          </Text>
        );
      }
      return (
        <Stack direction="column" gap="tight" align="end">
          <Text
            variant="muted"
            style={{
              textDecoration: 'line-through',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {formattedOriginal}
          </Text>
          <Text variant="success" weight="bold">
            {formattedEffective}
            {vatLabel}
          </Text>
        </Stack>
      );
    }
    return `${formatCurrency(amount, currencyCode)}${vatLabel}`;
  },
  range: (value, _config, _t, options) => {
    return typeof value === 'number'
      ? value.toLocaleString(options?.locale)
      : String(value);
  },
  rating: (
    value: any,
    config: EntityField,
    t: (key: string, options?: Record<string, any>) => string,
    options?: { compact?: boolean }
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined) {
      return renderEmpty(compact);
    }
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) {
      return renderEmpty(compact);
    }
    const max = (config.validation?.max as number) ?? 5;
    // Display mode with fractional rendering
    return (
      <Rating
        value={numValue}
        max={max}
        readonly
        aria-label={`${numValue} out of ${max} stars`}
      />
    );
  },
  duration: (
    value: any,
    _config: EntityField,
    t: (key: string, options?: Record<string, any>) => string,
    options?: { compact?: boolean }
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined) {
      return renderEmpty(compact);
    }
    const minutes =
      typeof value === 'number' ? value : parseInt(String(value), 10);
    if (Number.isNaN(minutes)) return renderEmpty(compact);
    if (minutes === 0) {
      return t('crud:duration.zero', { defaultValue: '—' });
    }
    if (minutes < 60) {
      return t('crud:duration.minutes', {
        count: minutes,
        defaultValue: `${minutes} min`,
      });
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return t('crud:duration.hoursMinutes', {
      hours: h,
      minutes: m,
      defaultValue: m === 0 ? `${h}h` : `${h}h ${m}min`,
    });
  },
  gdprConsent: (
    value: any,
    _config: EntityField,
    t: (key: string, options?: Record<string, any>) => string,
    options?: DisplayFormatterOptions
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (!value || typeof value !== 'object') {
      return renderEmpty(compact);
    }

    const consent = (value as { gdprConsent?: boolean }).gdprConsent === true;
    const date = (value as { gdprConsentDate?: string }).gdprConsentDate;
    const version = (value as { gdprConsentVersion?: string })
      .gdprConsentVersion;

    const yesLabel = t('crud:gdprConsent.display.yes', {
      defaultValue: 'Consented',
    });
    const noLabel = t('crud:gdprConsent.display.no', {
      defaultValue: 'Not consented',
    });

    if (!consent) {
      return noLabel;
    }

    const parts: string[] = [yesLabel];
    if (date) {
      try {
        const d = new Date(date);
        parts.push(d.toLocaleDateString(options?.locale));
      } catch {
        parts.push(date);
      }
    }
    if (version) {
      parts.push(`v${version}`);
    }

    return parts.join(' · ');
  },

  // Selection types
  select: (value, config, t) => {
    const options = config.validation?.options;
    if (Array.isArray(options)) {
      const option = options.find(
        (opt: { value: string; label: string }) => opt.value === value
      );
      const label = option?.label;
      return label ? translateLabel(label, t) : String(value);
    }
    return String(value);
  },
  radio: (value, config, t) => {
    const options = config.validation?.options;
    if (Array.isArray(options)) {
      const option = options.find(
        (opt: { value: string; label: string }) => opt.value === value
      );
      const label = option?.label;
      return label ? translateLabel(label, t) : String(value);
    }
    return String(value);
  },
  combobox: (value, config, t) => {
    const options = config.validation?.options;
    if (Array.isArray(options)) {
      const option = options.find(
        (opt: { value: string; label: string }) => opt.value === value
      );
      const label = option?.label;
      return label ? translateLabel(label, t) : String(value);
    }
    return String(value);
  },
  multiselect: (value, config, t) => {
    if (Array.isArray(value)) {
      const options = config.validation?.options;
      if (Array.isArray(options)) {
        const labels = value.map((v) => {
          const opt = options.find(
            (o: { value: string; label: string }) => o.value === v
          );
          const label = opt?.label;
          return label ? translateLabel(label, t) : v;
        });
        return labels.join(', ');
      }
    }
    return String(value);
  },

  // Image types
  image: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value === null || value === undefined || value === '') {
      return renderEmpty(compact);
    }
    if (typeof value === 'string') {
      return (
        <img
          src={sanitizeHref(value)}
          alt={config.label || ''}
          style={{
            width: compact ? '40px' : undefined,
            height: compact ? '40px' : undefined,
            maxWidth: compact ? undefined : '200px',
            maxHeight: compact ? undefined : '150px',
            objectFit: 'cover',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      );
    }
    return renderEmpty(compact);
  },
  images: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!Array.isArray(value) || value.length === 0) {
      return renderEmpty(compact);
    }
    const firstImg = value[0];
    const src =
      typeof firstImg === 'object' && firstImg.thumbUrl
        ? firstImg.thumbUrl
        : firstImg;
    if (compact) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--gap-xs)',
          }}
        >
          <img
            src={sanitizeHref(src)}
            alt=""
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'cover',
              borderRadius: 'var(--radius-sm)',
            }}
          />
          {value.length > 1 && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--muted-foreground)',
              }}
            >
              +{value.length - 1}
            </span>
          )}
        </div>
      );
    }
    // Full mode: use ImageGallery with navigation
    return <ImageGallery images={value} altPrefix={config.label || 'Image'} />;
  },

  // File types
  files: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!Array.isArray(value) || value.length === 0) {
      return renderEmpty(compact);
    }
    return (
      <Stack gap="tight">
        {value.map((file: any, i) => (
          <a
            key={i}
            href={sanitizeHref(file.url || file)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--primary)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {file.filename || `File ${i + 1}`}
            {file.size && (
              <Text
                level="caption"
                variant="muted"
                style={{ marginLeft: 'var(--gap-sm)' }}
              >
                ({Math.round(file.size / 1024)} KB)
              </Text>
            )}
          </a>
        ))}
      </Stack>
    );
  },
  documents: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!Array.isArray(value) || value.length === 0) {
      return renderEmpty(compact);
    }
    return (
      <Stack gap="tight">
        {value.map((file: any, i) => (
          <a
            key={i}
            href={sanitizeHref(file.url || file)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--primary)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {file.filename || `File ${i + 1}`}
            {file.size && (
              <Text
                level="caption"
                variant="muted"
                style={{ marginLeft: 'var(--gap-sm)' }}
              >
                ({Math.round(file.size / 1024)} KB)
              </Text>
            )}
          </a>
        ))}
      </Stack>
    );
  },
  file: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!value) {
      return renderEmpty(compact);
    }
    const url = typeof value === 'string' ? value : value.url;
    const name =
      typeof value === 'string' ? 'View file' : value.filename || 'View file';
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--primary)', textDecoration: 'none' }}
      >
        {name}
        {typeof value === 'object' && value.size && (
          <span
            style={{
              color: 'var(--muted-foreground)',
              marginLeft: 'var(--gap-sm)',
            }}
          >
            ({Math.round(value.size / 1024)} KB)
          </span>
        )}
      </a>
    );
  },
  document: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!value) {
      return renderEmpty(compact);
    }
    const url = typeof value === 'string' ? value : value.url;
    const name =
      typeof value === 'string' ? 'View file' : value.filename || 'View file';
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--primary)', textDecoration: 'none' }}
      >
        {name}
        {typeof value === 'object' && value.size && (
          <span
            style={{
              color: 'var(--muted-foreground)',
              marginLeft: 'var(--gap-sm)',
            }}
          >
            ({Math.round(value.size / 1024)} KB)
          </span>
        )}
      </a>
    );
  },

  // Complex types
  reference: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!value) {
      return renderEmpty(compact);
    }
    // Check pre-resolved reference data first (from useReferenceResolver)
    const refCollection = config.validation?.reference;
    if (options?.referenceData && typeof refCollection === 'string') {
      const resolved = options.referenceData[refCollection]?.[String(value)];
      if (resolved) return resolved;
    }
    // Handle object references (e.g., { id: "...", displayName: "..." })
    if (typeof value === 'object' && value !== null) {
      const displayValue =
        value.displayName || value.name || value.id || String(value);
      return String(displayValue);
    }
    // Handle string IDs
    return String(value);
  },
  geopoint: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (
      value &&
      typeof value === 'object' &&
      'lat' in value &&
      'lng' in value
    ) {
      return `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`;
    }
    return renderEmpty(compact);
  },
  address: (value, config, t) => {
    if (value && typeof value === 'object' && 'formatted_address' in value) {
      return value.formatted_address;
    }
    return String(value);
  },
  map: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return renderEmpty(compact);
      }
      return (
        <Stack direction="column" gap="tight">
          {entries.slice(0, 5).map(([k, v]) => (
            <Text key={k} style={{ fontSize: 'var(--font-size-sm)' }}>
              <strong>{k}:</strong> {String(v)}
            </Text>
          ))}
          {entries.length > 5 && (
            <Text variant="muted">+{entries.length - 5} more</Text>
          )}
        </Stack>
      );
    }
    return renderEmpty(compact);
  },
  array: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return renderEmpty(compact);
      }
      return value.join(', ');
    }
    return renderEmpty(compact);
  },
  'field-array': (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!Array.isArray(value) || value.length === 0)
      return renderEmpty(compact);
    const subFields = (
      config.options?.fieldSpecific as { fields?: SubFieldDef[] }
    )?.fields;
    return value
      .map((row) => {
        if (typeof row !== 'object' || row == null) return '';
        const obj = row as Record<string, unknown>;
        const keys = subFields
          ? subFields.map((sf) => sf.name)
          : Object.keys(obj);
        return keys
          .map((k) => obj[k])
          .filter((v) => v != null && v !== '')
          .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
          .join(' · ');
      })
      .filter(Boolean)
      .join(', ');
  },

  // Text types
  password: () => {
    return '••••••••';
  },
  email: (value, config, t) => {
    return (
      <Stack direction="row" gap="tight" align="center">
        <a
          href={`mailto:${value}`}
          style={{ color: 'var(--primary)', flex: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
        <CopyToClipboard
          text={value}
          tooltipText={t('crud:copyToClipboard', {
            defaultValue: 'Copy to clipboard',
          })}
          ariaLabel={t('crud:actions.copyEmail', {
            defaultValue: 'Copy email',
          })}
          onClick={(e) => e.stopPropagation()}
        />
      </Stack>
    );
  },
  tel: (value, config, t) => {
    return (
      <Stack direction="row" gap="tight" align="center">
        <a
          href={`tel:${value}`}
          style={{ color: 'var(--primary)', flex: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
        <CopyToClipboard
          text={value}
          tooltipText={t('crud:copyToClipboard', {
            defaultValue: 'Copy to clipboard',
          })}
          ariaLabel={t('crud:actions.copyPhone', {
            defaultValue: 'Copy phone',
          })}
          onClick={(e) => e.stopPropagation()}
        />
      </Stack>
    );
  },
  iban: (value, config, t, options) => {
    const compact = options?.compact ?? false;
    if (!value) {
      return renderEmpty(compact);
    }
    return (
      <Stack direction="row" gap="tight" align="center">
        <Text style={{ flex: 1 }}>{value}</Text>
        <CopyToClipboard
          text={value}
          tooltipText={t('crud:copyToClipboard', {
            defaultValue: 'Copy to clipboard',
          })}
          ariaLabel={t('crud:actions.copyIban', { defaultValue: 'Copy IBAN' })}
        />
      </Stack>
    );
  },
  url: (value, config, t) => {
    const safeHref = sanitizeHref(value);
    if (!safeHref) return <Text>{value}</Text>;
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--primary)' }}
      >
        {value}
      </a>
    );
  },
  color: (value, config, t) => {
    return (
      <Stack direction="row" gap="tight" align="center">
        <div
          style={{
            width: '20px',
            height: '20px',
            backgroundColor: value,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        />
        <Text>{value}</Text>
      </Stack>
    );
  },
  textarea: (value, config, t) => {
    return String(value);
  },
  text: (value, config, t) => {
    return String(value);
  },
  richtext: (
    value: any,
    config: EntityField,
    t: (key: string, options?: Record<string, any>) => string,
    options?: { compact?: boolean }
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (value && typeof value === 'string') {
      if (compact) {
        const textOnly = value.replace(/<[^>]*>/g, '').trim();
        return (
          textOnly || (
            <span style={{ color: 'var(--muted-foreground)' }}>—</span>
          )
        );
      }
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
          style={{
            padding: 'var(--gap-sm)',
            fontSize: 'var(--font-size-sm)',
            lineHeight: '1.6',
          }}
        />
      );
    }
    return renderEmpty(compact);
  },
} as Record<string, DisplayFormatter>;

// ============================================================================
// Type-safe helpers
// ============================================================================

/**
 * Type guard to check if config is for avatar field
 */
function isAvatarConfig(config: EntityField): config is EntityField<'avatar'> {
  return config.type === 'avatar';
}

/**
 * Type guard to check if config is for badge field
 */
function isBadgeConfig(config: EntityField): config is EntityField<'badge'> {
  return config.type === 'badge';
}

// ============================================================================
// Registration
// ============================================================================

let registered = false;

/**
 * Register all built-in field types with unified registry.
 * This is the single source of truth for framework built-ins.
 *
 * Receives both registries as parameters to avoid circular imports
 * (fieldTypeRegistry.ts ↔ registerBuiltinFieldTypes.tsx), which caused
 * esbuild to tree-shake the entire registration module.
 */
export function registerAllBuiltinFieldTypes(
  metadataRegistry: Map<string, FieldTypeMetadata>,
  fieldRegistry: {
    registerComponent: (
      type: string,
      controlled: any,
      uncontrolled?: any
    ) => void;
  }
): void {
  if (registered) return;
  registered = true;

  // Local helper — closes over the registries so all 47 call sites stay untouched.
  const registerBuiltinFieldType = (metadata: FieldTypeMetadata): void => {
    const { type, components } = metadata;
    if (components) {
      fieldRegistry.registerComponent(
        type,
        components.controlled,
        components.uncontrolled
      );
    }
    metadataRegistry.set(type, metadata);
  };

  // Text-based
  registerBuiltinFieldType({
    type: 'text',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.text,
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextFieldComponent
            label={label || ''}
            value={stringValue}
            onChange={(
              e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => {
              // For text fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'email',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.email,
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextFieldComponent
            label={label || ''}
            value={stringValue}
            onChange={(
              e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => {
              // For email fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            type="email"
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'url',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.url,
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextFieldComponent
            label={label || ''}
            value={stringValue}
            onChange={(
              e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => {
              // For url fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            type="url"
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'color',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.color,
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextFieldComponent
            label={label || ''}
            value={stringValue}
            onChange={(
              e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => {
              // For color fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            type="color"
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'textarea',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.textarea,
    components: {
      controlled: ControlledTextareaField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextAreaComponent
            label={label || ''}
            value={stringValue}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              // For textarea fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'richtext',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.richtext,
    components: {
      controlled: ControlledRichTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <RichTextComponent
            label={label || ''}
            value={stringValue}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              // For richtext fields, value is always string
              const newValue: string = e.target.value;
              onChange(newValue);
            }}
            error={error}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'password',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    displayFormatter: displayFormatters.password,
    components: {
      controlled: ControlledPasswordField,
    },
  });

  registerBuiltinFieldType({
    type: 'tel',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.tel,
    components: {
      controlled: ControlledPhoneField,
    },
  });

  registerBuiltinFieldType({
    type: 'iban',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.iban,
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, label, error, config } = props;
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <TextFieldComponent
            label={label || ''}
            value={stringValue}
            onChange={(
              e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => {
              const newValue: string = e.target.value
                .replace(/\s/g, '')
                .toUpperCase();
              onChange(newValue);
            }}
            error={error}
            {...config.options}
          />
        );
      },
    },
  });

  // Numeric
  registerBuiltinFieldType({
    type: 'number',
    filterable: true,
    filterType: 'range',
    valueType: 'number',
    displayFormatter: displayFormatters.number,
    components: {
      controlled: ControlledNumberField,
    },
  });

  registerBuiltinFieldType({
    type: 'currency',
    filterable: true,
    filterType: 'range',
    valueType: 'number',
    displayFormatter: displayFormatters.currency,
    components: {
      controlled: ControlledCurrencyField,
    },
  });

  registerBuiltinFieldType({
    type: 'price',
    filterable: true,
    filterType: 'range',
    valueType: 'object',
    displayFormatter: displayFormatters.price,
    components: {
      controlled: ControlledPriceField,
    },
  });

  registerBuiltinFieldType({
    type: 'range',
    filterable: true,
    filterType: 'range',
    valueType: 'number',
    displayFormatter: displayFormatters.range,
    components: {
      controlled: ControlledRangeField,
    },
  });

  registerBuiltinFieldType({
    type: 'year',
    filterable: true,
    filterType: 'range',
    valueType: 'number',
    displayFormatter: displayFormatters.year,
    components: {
      controlled: ControlledYearField,
    },
  });

  registerBuiltinFieldType({
    type: 'rating',
    filterable: true,
    filterType: 'rating',
    valueType: 'number',
    displayFormatter: displayFormatters.rating,
    components: {
      controlled: ControlledRatingField,
    },
  });

  registerBuiltinFieldType({
    type: 'duration',
    filterable: true,
    filterType: 'range',
    valueType: 'number',
    displayFormatter: displayFormatters.duration,
    components: {
      controlled: ControlledDurationField,
    },
  });

  // Boolean
  registerBuiltinFieldType({
    type: 'boolean',
    filterable: true,
    filterType: 'select',
    valueType: 'boolean',
    displayFormatter: displayFormatters.boolean,
    components: {
      controlled: ControlledCheckboxField,
    },
  });

  registerBuiltinFieldType({
    type: 'checkbox',
    filterable: true,
    filterType: 'select',
    valueType: 'boolean',
    displayFormatter: displayFormatters.checkbox,
    components: {
      controlled: ControlledCheckboxField,
    },
  });

  registerBuiltinFieldType({
    type: 'gdprConsent',
    filterable: true,
    filterType: 'select',
    valueType: 'object',
    displayFormatter: displayFormatters.gdprConsent,
    components: {
      controlled: ControlledGdprConsentField,
    },
  });

  registerBuiltinFieldType({
    type: 'switch',
    filterable: true,
    filterType: 'select',
    valueType: 'boolean',
    displayFormatter: displayFormatters.switch,
    components: {
      controlled: ControlledSwitchField,
    },
  });

  // Date/time
  registerBuiltinFieldType({
    type: 'date',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters.date,
    components: {
      controlled: ControlledDateField,
    },
  });

  registerBuiltinFieldType({
    type: 'datetime-local',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters['datetime-local'],
    components: {
      controlled: ControlledDateField,
    },
  });

  registerBuiltinFieldType({
    type: 'time',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters.time,
    components: {
      controlled: ControlledDateField,
    },
  });

  registerBuiltinFieldType({
    type: 'week',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters.week,
    components: {
      controlled: ControlledDateField,
    },
  });

  registerBuiltinFieldType({
    type: 'month',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters.month,
    components: {
      controlled: ControlledDateField,
    },
  });

  registerBuiltinFieldType({
    type: 'timestamp',
    filterable: true,
    filterType: 'range',
    valueType: 'date',
    displayFormatter: displayFormatters.timestamp,
    components: {
      controlled: ControlledTimestampField,
    },
  });

  // File & Document
  registerBuiltinFieldType({
    type: 'file',
    filterable: false,
    filterType: 'none',
    valueType: 'object',
    displayFormatter: displayFormatters.file,
    components: {
      controlled: ControlledFileField,
    },
  });

  registerBuiltinFieldType({
    type: 'files',
    filterable: false,
    filterType: 'none',
    valueType: 'array',
    displayFormatter: displayFormatters.files,
    components: {
      controlled: ControlledMultiFileField,
    },
  });

  registerBuiltinFieldType({
    type: 'document',
    filterable: false,
    filterType: 'none',
    valueType: 'object',
    displayFormatter: displayFormatters.document,
    components: {
      controlled: ControlledDocumentField,
    },
  });

  registerBuiltinFieldType({
    type: 'documents',
    filterable: false,
    filterType: 'none',
    valueType: 'array',
    displayFormatter: displayFormatters.documents,
    components: {
      controlled: ControlledMultiDocumentField,
    },
  });

  registerBuiltinFieldType({
    type: 'image',
    filterable: false,
    filterType: 'none',
    valueType: 'object',
    displayFormatter: displayFormatters.image,
    components: {
      controlled: ControlledImageField,
    },
  });

  registerBuiltinFieldType({
    type: 'images',
    filterable: false,
    filterType: 'none',
    valueType: 'array',
    displayFormatter: displayFormatters.images,
    components: {
      controlled: ControlledMultiImageField,
    },
  });

  // Complex
  registerBuiltinFieldType({
    type: 'geopoint',
    filterable: false,
    filterType: 'none',
    valueType: 'object',
    displayFormatter: displayFormatters.geopoint,
    components: {
      controlled: ControlledGeoPointField,
    },
  });

  registerBuiltinFieldType({
    type: 'address',
    filterable: true,
    filterType: 'address',
    valueType: 'object',
    displayFormatter: displayFormatters.address,
    components: {
      controlled: ControlledAddressField,
    },
  });

  registerBuiltinFieldType({
    type: 'map',
    filterable: false,
    filterType: 'none',
    valueType: 'object',
    displayFormatter: displayFormatters.map,
    components: {
      controlled: ControlledMapField,
    },
  });

  registerBuiltinFieldType({
    type: 'array',
    filterable: false,
    filterType: 'none',
    valueType: 'array',
    displayFormatter: displayFormatters.array,
    components: {
      controlled: ControlledMultiInputField,
    },
  });

  registerBuiltinFieldType({
    type: 'field-array',
    filterable: false,
    filterType: 'none',
    valueType: 'array',
    displayFormatter: displayFormatters['field-array'],
    components: {
      controlled: ControlledFieldArrayField,
    },
  });

  // Selection
  registerBuiltinFieldType({
    type: 'select',
    filterable: true,
    filterType: 'select',
    valueType: 'string',
    displayFormatter: displayFormatters.select,
    components: {
      controlled: ControlledComboboxField,
    },
  });

  registerBuiltinFieldType({
    type: 'combobox',
    filterable: true,
    filterType: 'select',
    valueType: 'string',
    displayFormatter: displayFormatters.combobox,
    components: {
      controlled: ControlledComboboxField,
    },
  });

  registerBuiltinFieldType({
    type: 'multiselect',
    filterable: true,
    filterType: 'multiselect',
    valueType: 'array',
    displayFormatter: displayFormatters.multiselect,
    components: {
      controlled: ControlledMultiDropdownField,
    },
  });

  registerBuiltinFieldType({
    type: 'radio',
    filterable: true,
    filterType: 'select',
    valueType: 'string',
    displayFormatter: displayFormatters.radio,
    components: {
      controlled: ControlledRadioField,
    },
  });

  // Reference
  registerBuiltinFieldType({
    type: 'reference',
    filterable: true,
    filterType: 'text',
    valueType: 'string',
    displayFormatter: displayFormatters.reference,
    components: {
      controlled: ControlledReferenceField,
    },
  });

  // Special
  registerBuiltinFieldType({
    type: 'hidden',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { name, value } = props;
        return (
          <HiddenFieldComponent
            name={name}
            value={typeof value === 'string' ? value : ''}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'avatar',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, error, config, t } = props;
        if (!isAvatarConfig(config)) {
          throw new Error('Invalid config type for avatar field');
        }
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <AvatarFieldComponent
            config={config}
            value={stringValue}
            onChange={(newValue: string) => {
              // For avatar fields, value is always string
              onChange(newValue);
            }}
            error={!!error}
            helperText={error || undefined}
            t={t}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'badge',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { value, onChange, error, config, t } = props;
        if (!isBadgeConfig(config)) {
          throw new Error('Invalid config type for badge field');
        }
        const stringValue = typeof value === 'string' ? value : '';
        return (
          <BadgeFieldComponent
            config={config}
            value={stringValue}
            onChange={(newValue: string) => {
              // For badge fields, value is always string
              onChange(newValue);
            }}
            error={!!error}
            helperText={error || undefined}
            t={t}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'submit',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { name, label, config } = props;
        return (
          <ButtonFieldComponent
            label={label || name}
            type="submit"
            onClick={() => {}}
            {...config.options}
          />
        );
      },
    },
  });

  registerBuiltinFieldType({
    type: 'reset',
    filterable: false,
    filterType: 'none',
    valueType: 'string',
    components: {
      controlled: ControlledTextField,
      uncontrolled: (props: UncontrolledFieldProps) => {
        const { name, label, config } = props;
        return (
          <ButtonFieldComponent
            label={label || name}
            type="reset"
            onClick={() => {}}
            {...config.options}
          />
        );
      },
    },
  });
}
