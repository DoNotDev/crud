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

import { translateEntityLabel } from '@donotdev/core';
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
 * Same as `translateEntityLabel` from `@donotdev/core` (the implementation; SEO uses it too).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string
): string {
  return translateEntityLabel(label, t);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: t prop signature shared by field components; narrowing it is a breaking change for callers
  t: (key: string, options?: Record<string, any>) => string
): string {
  const label = config?.label || fieldName;
  return translateLabel(label, t);
}
