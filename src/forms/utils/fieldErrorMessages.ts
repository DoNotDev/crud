// packages/features/crud/src/forms/utils/fieldErrorMessages.ts

/**
 * @fileoverview Translated messages of entity form errors
 * @description `createSchemas` (`@donotdev/core`, shared with the server) carries English
 * messages, and valibot adds its own (`Invalid type: Expected string but received null`).
 * Entity forms show the translated message of the rule that failed instead, from the
 * field and its value:
 * 1. Empty value (`null`, `undefined`, `''`): `crud:text.required`.
 * 2. Field with `validation.schema` (the entity's own rules): its message is a key of the
 *    entity namespace (`v.regex(SIRET, 'siretFormat')` → `t('siretFormat')`); a sentence
 *    or a missing key shows `crud:text.invalid`.
 * 3. `minLength` / `maxLength` / `min` / `max`: `crud:text.minLength` / `maxLength`,
 *    `crud:number.min` / `max`.
 * 4. By type: `tel` → `crud:text.phone`, `email` → `crud:text.email`, `url` →
 *    `crud:text.url`, date and time types → `crud:date.format`.
 * 5. Anything else: `crud:text.invalid`.
 *
 * @version 0.1.0
 * @since 0.3.3
 * @author AMBROISE PARK Consulting
 */

import { i18nFieldName } from '@donotdev/core';
import type { AnyEntity, EntityField, FieldType } from '@donotdev/core';

import { translateFieldLabel } from './translateFieldLabel';

/** Translation function of the form (`form.t`: entity namespace + `crud`). */
export type ErrorTranslate = (key: string, options?: Record<string, unknown>) => string;

const DATE_TYPES: ReadonlySet<string> = new Set([
  'date',
  'datetime-local',
  'timestamp',
  'time',
  'week',
  'month',
]);

/** An entity message key (`siretFormat`, `errors.siret`), not a sentence. */
const MESSAGE_KEY = /^[\w.-]+$/;

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Error leaf of React Hook Form (`{ type, message, ref }`). */
interface ErrorLeaf {
  type?: unknown;
  message: string;
}

/**
 * Translated message of one field error.
 *
 * @param name - Field name (label fallback)
 * @param field - Entity field (`undefined`: only rules 1 and 5 apply)
 * @param error - Error of the resolver: valibot issue `type` and message
 * @param value - The value that failed
 * @param t - Form translation function
 * @param namespace - Entity namespace (labels and the entity's message keys)
 * @returns Translated message
 */
export function fieldErrorMessage(
  name: string,
  field: EntityField<FieldType> | undefined,
  error: ErrorLeaf,
  value: unknown,
  t: ErrorTranslate,
  namespace: string
): string {
  const label = translateFieldLabel(name, field, (key, options) =>
    t(key, { ns: namespace, ...options })
  );
  if (isEmpty(value)) return t('crud:text.required', { field: label });
  const invalid = t('crud:text.invalid', { field: label });
  const validation = field?.validation;
  if (validation?.schema) {
    return MESSAGE_KEY.test(error.message)
      ? t(error.message, { ns: namespace, field: label, defaultValue: invalid })
      : invalid;
  }
  if (error.type === 'min_length' && validation?.minLength !== undefined) {
    return t('crud:text.minLength', { field: label, min: validation.minLength });
  }
  if (error.type === 'max_length' && validation?.maxLength !== undefined) {
    return t('crud:text.maxLength', { field: label, max: validation.maxLength });
  }
  if (error.type === 'min_value' && validation?.min !== undefined) {
    return t('crud:number.min', { field: label, min: validation.min });
  }
  if (error.type === 'max_value' && validation?.max !== undefined) {
    return t('crud:number.max', { field: label, max: validation.max });
  }
  if (field?.type === 'tel') return t('crud:text.phone', { field: label });
  if (field?.type === 'email') return t('crud:text.email', { field: label });
  if (field?.type === 'url') return t('crud:text.url', { field: label });
  if (field && DATE_TYPES.has(field.type)) return t('crud:date.format', { field: label });
  return invalid;
}

/**
 * Resolver errors with translated messages (see file overview). Nested errors (object
 * and array fields) are translated with their root field and their own value.
 *
 * @param errors - Errors of the resolver (React Hook Form shape)
 * @param values - The values the resolver validated
 * @param entity - The entity the values belong to
 * @param t - Form translation function
 * @returns The same errors with translated messages
 */
export function translateFieldErrors<E extends Record<string, unknown>>(
  errors: E,
  values: Readonly<Record<string, unknown>>,
  entity: AnyEntity,
  t: ErrorTranslate
): E {
  const translated: Record<string, unknown> = {};
  for (const [name, error] of Object.entries(errors)) {
    // An i18n companion (`<name>` translations) is checked like its field.
    const owner =
      entity.fields[name] ??
      Object.entries(entity.fields).find(([fieldName]) => i18nFieldName(fieldName) === name)?.[1];
    const walk = (node: unknown, value: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.map((child, index) =>
          walk(child, Array.isArray(value) ? value[index] : undefined)
        );
      }
      if (!isRecord(node)) return node;
      if (typeof node.message === 'string') {
        return {
          ...node,
          message: fieldErrorMessage(
            name,
            owner,
            { type: node.type, message: node.message },
            value,
            t,
            entity.namespace
          ),
        };
      }
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [
          key,
          key === 'ref' ? child : walk(child, isRecord(value) ? value[key] : undefined),
        ])
      );
    };
    translated[name] = walk(error, values[name]);
  }
  return translated as E;
}
