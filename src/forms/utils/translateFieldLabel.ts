// packages/features/crud/src/forms/utils/translateFieldLabel.ts

/**
 * @fileoverview Field label translation utility
 * @description Centralized helper for translating field labels with namespace support.
 * Handles namespace:key syntax, config.label fallback, and fields.${fieldName} pattern.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { EntityField, FieldType } from '@donotdev/core';

/**
 * Translates a label string with namespace support.
 * Used for translating option labels, field labels, or any label string.
 *
 * Supports namespace:key syntax (e.g., "crud:status.draft")
 *
 * **Translation Fallback Order (for status labels):**
 * 1. Entity namespace (`entity-{name}`) - User overrides take priority
 * 2. CRUD namespace (`crud`) - Framework defaults
 *
 * No dndev fallback - CRUD is optional and shouldn't pollute core framework namespace.
 *
 * @param label - Label string to translate (may include namespace:key syntax)
 * @param t - Translation function from useTranslation hook (should be from multi-namespace hook like [entity.namespace, 'crud'])
 * @returns Translated label string
 *
 * @example
 * ```typescript
 * translateLabel('crud:status.draft', t); // Tries entity namespace first, then crud
 * translateLabel('make', t); // Translates "make" in current namespace (entity or crud)
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function translateLabel(
  label: string,
  t: (key: string, options?: Record<string, any>) => string
): string {
  // Handle namespace:key syntax (e.g., "crud:status.draft")
  if (typeof label === 'string' && label.includes(':')) {
    const parts = label.split(':');
    const key = parts[1] ?? label;
    const namespace = parts[0];

    // Special handling for status labels: try entity namespace first (user overrides), then fall back to crud (framework defaults)
    // Translation fallback order: entity-{name} → crud (never dndev)
    // This allows entity-specific status translations (e.g., entity-inquiry:status.draft = "New")
    // to override CRUD defaults (e.g., crud:status.draft = "Draft")
    // No dndev fallback - CRUD is optional and shouldn't pollute core framework namespace
    if (key.startsWith('status.')) {
      // Try without namespace prefix first (uses t's default namespace order, typically entity namespace first)
      const entityTranslation = t(key);
      // If translation found (not just the key itself), use it
      if (
        entityTranslation !== key &&
        entityTranslation !== `${namespace}:${key}`
      ) {
        return entityTranslation;
      }
      // Fall back to specified namespace
      return t(key, { ns: namespace });
    }

    // For non-status labels, use specified namespace directly
    return t(key, { ns: namespace });
  }

  // Direct translation (uses t's default namespace order)
  return t(label);
}

/**
 * Translates a field label using the provided translation function.
 *
 * Supports multiple label formats:
 * - Namespace syntax: `"namespace:key"` → translates `key` in `namespace`
 * - Direct label: `"label"` → translates `label` in current namespace
 * - Field name fallback: uses field name if no label in config
 *
 * @param fieldName - Field name (used as fallback)
 * @param config - Field configuration (may contain label)
 * @param t - Translation function from useTranslation hook
 * @returns Translated label string
 *
 * @example
 * ```typescript
 * import { translateFieldLabel } from '@donotdev/crud/forms';
 * import { useTranslation } from '@donotdev/core';
 *
 * const { t } = useTranslation('entity-car');
 * const label = translateFieldLabel('make', carEntity.fields.make, t);
 * // Returns: translated "make" from entity-car namespace
 * ```
 *
 * @example
 * ```typescript
 * // With namespace syntax in config.label
 * const label = translateFieldLabel('status', {
 *   label: 'common:status',
 *   type: 'select'
 * }, t);
 * // Returns: translated "status" from "common" namespace
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function translateFieldLabel<T extends FieldType = FieldType>(
  fieldName: string,
  config: EntityField<T> | undefined,
  t: (key: string, options?: Record<string, any>) => string
): string {
  const label = config?.label || fieldName;
  return translateLabel(label, t);
}
