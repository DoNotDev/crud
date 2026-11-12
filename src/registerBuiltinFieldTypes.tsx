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

import { lazy } from 'react';
import type { ChangeEvent, ReactElement } from 'react';

import {
  Text,
  Stack,
  ImageGallery,
  Rating,
  CopyToClipboard,
} from '@donotdev/components';
import {
  FIELD_TEXT_FORMATTERS,
  formatCurrency,
  isEmptyFieldValue,
  sanitizeHref,
  stripHtmlTags,
} from '@donotdev/core';
import type { FieldType } from '@donotdev/core';
import type { EntityField } from '@donotdev/core';

import {
  ControlledCheckboxField,
  ControlledComboboxField,
  ControlledDropdownField,
  ControlledMultiDropdownField,
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
  ControlledSwitchField,
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
import type { UncontrolledFieldProps } from './FieldRegistry';
import type {
  ComponentRegistration,
  FieldTypeMetadata,
  DisplayFormatter,
} from './fieldTypeRegistry.types';
import { sanitizeHtml } from './utils/sanitizeHtml';

// Heavy editors load on first render in a form, not with the module: importing any
// crud hook (a shop's card list) used to ship the upload stack (dnd-kit, react-easy-crop),
// the calendar, rich text and maps. FormFieldRenderer renders them inside <Suspense>.
const ControlledFileField = lazy(() =>
  import('./components/controlled/file/ControlledFileField').then((m) => ({
    default: m.ControlledFileField,
  }))
);
const ControlledMultiFileField = lazy(() =>
  import('./components/controlled/file/ControlledMultiFileField').then((m) => ({
    default: m.ControlledMultiFileField,
  }))
);
const ControlledDocumentField = lazy(() =>
  import('./components/controlled/file/ControlledDocumentField').then((m) => ({
    default: m.ControlledDocumentField,
  }))
);
const ControlledMultiDocumentField = lazy(() =>
  import('./components/controlled/file/ControlledMultiDocumentField').then(
    (m) => ({
      default: m.ControlledMultiDocumentField,
    })
  )
);
const ControlledImageField = lazy(() =>
  import('./components/controlled/file/ControlledImageField').then((m) => ({
    default: m.ControlledImageField,
  }))
);
const ControlledMultiImageField = lazy(() =>
  import('./components/controlled/file/ControlledMultiImageField').then(
    (m) => ({
      default: m.ControlledMultiImageField,
    })
  )
);
const ControlledDateField = lazy(() =>
  import('./components/controlled/complex/ControlledDateField').then((m) => ({
    default: m.ControlledDateField,
  }))
);
const ControlledTimestampField = lazy(() =>
  import('./components/controlled/complex/ControlledTimestampField').then(
    (m) => ({
      default: m.ControlledTimestampField,
    })
  )
);
const ControlledRichTextField = lazy(() =>
  import('./components/controlled/complex/ControlledRichTextField').then(
    (m) => ({
      default: m.ControlledRichTextField,
    })
  )
);
const ControlledAddressField = lazy(() =>
  import('./components/controlled/complex/ControlledAddressField').then(
    (m) => ({
      default: m.ControlledAddressField,
    })
  )
);
const ControlledGeoPointField = lazy(() =>
  import('./components/controlled/complex/ControlledGeoPointField').then(
    (m) => ({
      default: m.ControlledGeoPointField,
    })
  )
);
const ControlledMapField = lazy(() =>
  import('./components/controlled/complex/ControlledMapField').then((m) => ({
    default: m.ControlledMapField,
  }))
);
const ControlledMultiInputField = lazy(() =>
  import('./components/controlled/complex/ControlledMultiInputField').then(
    (m) => ({
      default: m.ControlledMultiInputField,
    })
  )
);
const ControlledFieldArrayField = lazy(() =>
  import('./components/controlled/complex/ControlledFieldArrayField').then(
    (m) => ({
      default: m.ControlledFieldArrayField,
    })
  )
);

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
 * Text formatter of @donotdev/core for a built-in type (the card and SEO text).
 */
function text(type: string): DisplayFormatter {
  const format = FIELD_TEXT_FORMATTERS[type];
  if (!format) throw new Error(`No core text formatter for field type "${type}"`);
  return (value, config, t, options) =>
    format(value, config, t, { locale: options?.locale });
}

/**
 * {@link text}, returning `emptyText` for an empty value.
 */
function textOr(emptyText: string, type: string): DisplayFormatter {
  const format = text(type);
  return (value, config, t, options) =>
    isEmptyFieldValue(value) ? emptyText : format(value, config, t, options);
}

/**
 * {@link text}, rendering the empty dash for an empty value or an empty text.
 */
function textOrEmpty(type: string): DisplayFormatter {
  const format = text(type);
  return (value, config, t, options) => {
    const formatted = isEmptyFieldValue(value)
      ? ''
      : format(value, config, t, options);
    return formatted || renderEmpty(options?.compact ?? false);
  };
}

/**
 * Display formatters for each field type
 */
const displayFormatters: Record<string, DisplayFormatter> = {
  // Date/time types (text: @donotdev/core FIELD_TEXT_FORMATTERS)
  timestamp: textOrEmpty('timestamp'),
  date: textOrEmpty('date'),
  'datetime-local': textOrEmpty('datetime-local'),
  time: textOrEmpty('time'),
  week: textOrEmpty('week'),
  month: textOrEmpty('month'),

  // Boolean types
  boolean: text('boolean'),
  checkbox: text('checkbox'),
  switch: text('switch'),

  // Numeric types
  year: text('year'),
  number: textOr('—', 'number'),
  currency: textOr('', 'currency'),
  price: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: field value type is erased at registry dispatch (FieldType)
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
    const discountPercent = normalized.discountPercent ?? 0;
    // Text (VAT label, discount clue): @donotdev/core, the same text SEO uses
    const priceText = text('price')(normalized, config, t, options);
    if (discountPercent <= 0 || asString) return priceText;
    if (compact) {
      return (
        <Text variant="success" weight="bold">
          {priceText}
        </Text>
      );
    }
    const currencyCode = normalized.currency || 'EUR';
    const vatLabel =
      (normalized.vatIncluded ?? true)
        ? ` ${t('crud:price.vatIncluded', { defaultValue: 'VAT Incl.' })}`
        : '';
    return (
      <Stack direction="column" gap="tight" align="end">
        <Text
          variant="muted"
          style={{
            textDecoration: 'line-through',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {formatCurrency(amount, currencyCode)}
        </Text>
        <Text variant="success" weight="bold">
          {formatCurrency(amount * (1 - discountPercent / 100), currencyCode)}
          {vatLabel}
        </Text>
      </Stack>
    );
  },
  range: text('range'),
  rating: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: field value type is erased at registry dispatch (FieldType)
    value: any,
    config: EntityField,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
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
    const max = config.validation?.max ?? 5;
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
  duration: textOrEmpty('duration'),
  gdprConsent: textOrEmpty('gdprConsent'),

  // Selection types
  select: text('select'),
  radio: text('radio'),
  combobox: text('combobox'),
  multiselect: text('multiselect'),

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
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: field value type is erased at registry dispatch (FieldType) */}
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
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: field value type is erased at registry dispatch (FieldType) */}
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
    return text('reference')(value, config, t, options);
  },
  geopoint: textOrEmpty('geopoint'),
  address: text('address'),
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
  array: textOrEmpty('array'),
  'field-array': textOrEmpty('field-array'),
  // Text types
  password: text('password'),
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
  textarea: text('textarea'),
  text: text('text'),
  richtext: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: field value type is erased at registry dispatch (FieldType)
    value: any,
    config: EntityField,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
    t: (key: string, options?: Record<string, any>) => string,
    options?: { compact?: boolean }
  ): string | ReactElement => {
    const compact = options?.compact ?? false;
    if (value && typeof value === 'string') {
      if (compact) {
        const textOnly = stripHtmlTags(value);
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
};

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
      controlled: ComponentRegistration['controlled'],
      uncontrolled?: ComponentRegistration['uncontrolled']
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
