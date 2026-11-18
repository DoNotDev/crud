// packages/features/crud/src/forms/extend.ts

/**
 * @fileoverview 1:1 extensions (pure)
 * @description A record split across two tables (e.g. products public +
 * product_offers private, unique productId) is read, edited and saved as one.
 * Extension fields are addressed with their key prefix (`offer.priceExclVat`) in
 * forms, cells, validation and drafts. A viewer without read access to an
 * extension entity gets none of its fields, data or errors.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import {
  BACKEND_GENERATED_FIELD_NAMES,
  describeEntity,
  hasRoleAccess,
} from '@donotdev/core';
import type { AnyEntity, EntityExtensions } from '@donotdev/core';

import { getFieldsForOperation } from './utils/getFieldsForOperation';
import type { RenderableField } from './utils/getFieldsForOperation';

/**
 * Largest `in` list sent in one extension query: Firestore's `in` limit, the
 * strictest of the supported adapters. Longer id lists are read in chunks.
 */
export const EXTENSION_IN_CHUNK = 30;

/** An extension resolved for a viewer. */
export interface ResolvedExtension {
  /** Name its fields are addressed under (`offer`) */
  key: string;
  /** The extension entity */
  entity: AnyEntity;
  /** Its reference field pointing at the extended record */
  field: string;
  /** The viewer may read it (`access.read`); otherwise it does not exist for them */
  readable: boolean;
  /** The viewer may insert / update it (`access.create` / `access.update`) */
  create: boolean;
  update: boolean;
}

/** Fields never shown or written through an extension (the framework owns them). */
function isOwnedField(ext: { field: string }, name: string): boolean {
  return (
    name === ext.field ||
    name === 'status' ||
    BACKEND_GENERATED_FIELD_NAMES.includes(
      name as (typeof BACKEND_GENERATED_FIELD_NAMES)[number]
    )
  );
}

/**
 * Validate and resolve `extend` for a viewer. Throws on a key with `.`, a key
 * equal to a field of the extended entity, or a `field` that is not a reference
 * to the extended entity's collection.
 *
 * @param entity - The extended entity
 * @param extend - The extensions (`undefined`: none)
 * @param viewerRole - The viewer's role
 */
export function resolveExtensions(
  entity: AnyEntity,
  extend: EntityExtensions | undefined,
  viewerRole: string
): ResolvedExtension[] {
  if (!extend) return [];
  return Object.entries(extend).map(([key, spec]) => {
    if (key.includes('.') || key in entity.fields) {
      throw new Error(
        `extend: key "${key}" must not contain "." nor be a field of entity "${entity.name}".`
      );
    }
    const link = spec.entity.fields[spec.field];
    if (
      link?.type !== 'reference' ||
      link.validation?.reference !== entity.collection
    ) {
      throw new Error(
        `extend.${key}: "${spec.field}" is not a reference of entity "${spec.entity.name}" to "${entity.collection}".`
      );
    }
    const readable = hasRoleAccess(viewerRole, spec.entity.access.read);
    return {
      key,
      entity: spec.entity,
      field: spec.field,
      readable,
      create: readable && hasRoleAccess(viewerRole, spec.entity.access.create),
      update: readable && hasRoleAccess(viewerRole, spec.entity.access.update),
    };
  });
}

/** Stable signature of `extend` (memo key: callers pass object literals). */
export function extensionsSignature(
  extend: EntityExtensions | undefined
): string {
  if (!extend) return '';
  return Object.entries(extend)
    .map(([key, spec]) => `${key}:${spec.entity.collection}:${spec.field}`)
    .join('|');
}

/** `key.field` */
export const extensionFieldName = (key: string, field: string): string =>
  `${key}.${field}`;

/**
 * `[key, field]` of a prefixed extension field name, or `null` for a field of
 * the extended entity itself.
 */
export function splitExtensionField(
  name: string
): [key: string, field: string] | null {
  const dot = name.indexOf('.');
  return dot === -1 ? null : [name.slice(0, dot), name.slice(dot + 1)];
}

/**
 * The extension entity without its link field: the extended record sets it, the
 * viewer never edits it (validation of extension values ignores it).
 */
export function withoutLinkField(ext: ResolvedExtension): AnyEntity {
  let byField = withoutLinkCache.get(ext.entity);
  if (!byField) {
    byField = new Map();
    withoutLinkCache.set(ext.entity, byField);
  }
  let entity = byField.get(ext.field);
  if (!entity) {
    const { [ext.field]: _, ...fields } = ext.entity.fields;
    entity = { ...ext.entity, fields };
    byField.set(ext.field, entity);
  }
  return entity;
}

/** One stable entity per (extension entity, link field): its schemas are cached by identity. */
const withoutLinkCache = new WeakMap<AnyEntity, Map<string, AnyEntity>>();

/**
 * Renderable fields of an extension for a viewer, prefixed `key.` (form fields,
 * list columns): visible to the viewer, without its id, link field, status and
 * backend-generated fields. Labels are bound to the extension's namespace;
 * `scope` is the key (conditions read the extension's values). Editable and
 * written (derived fields) only when the viewer may write the extension
 * (`create` / `update` access).
 *
 * @param ext - The resolved extension
 * @param viewerRole - The viewer's role
 * @param operation - `'create'` when the extension row does not exist yet
 */
export function extensionFields(
  ext: ResolvedExtension,
  viewerRole: string,
  operation: 'create' | 'edit'
): RenderableField[] {
  if (!ext.readable) return [];
  const mayWrite = operation === 'create' ? ext.create : ext.update;
  return getFieldsForOperation(ext.entity, { operation, viewerRole })
    .filter((field) => !isOwnedField(ext, field.name))
    .map((field) => ({
      name: extensionFieldName(ext.key, field.name),
      config: {
        ...field.config,
        name: extensionFieldName(ext.key, field.name),
        label: (field.config.label || field.name).includes(':')
          ? field.config.label || field.name
          : `${ext.entity.namespace}:${field.config.label || field.name}`,
      },
      editable: field.editable && mayWrite,
      written: field.written && mayWrite,
      scope: ext.key,
    }));
}

/**
 * Extension field names (prefixed) the viewer may write for an operation: inputs
 * editable for the viewer and derived (`editable: 'computed'`) fields, with their
 * i18n companions (`<name>I18n`).
 *
 * @param ext - The resolved extension
 * @param viewerRole - The viewer's role
 * @param operation - `'create'` (insert of the extension) or `'edit'` (update)
 */
export function extensionWritable(
  ext: ResolvedExtension,
  viewerRole: string,
  operation: 'create' | 'edit'
): Set<string> {
  const { fields } = describeEntity(ext.entity);
  return new Set(
    extensionFields(ext, viewerRole, operation)
      .filter((field) => field.written)
      .flatMap((field) => {
        const companion = fields[splitExtensionField(field.name)?.[1] ?? field.name]?.companion;
        return companion ? [field.name, extensionFieldName(ext.key, companion)] : [field.name];
      })
  );
}

/**
 * Split a flat patch into the extended record's own values and each
 * extension's values (unprefixed). Throws on a prefixed field of an unknown key.
 *
 * @param patch - Flat values (`price`, `offer.priceExclVat`)
 * @param extensions - The resolved extensions
 */
export function splitPatch(
  patch: Record<string, unknown>,
  extensions: readonly ResolvedExtension[]
): { own: Record<string, unknown>; byKey: Record<string, Record<string, unknown>> } {
  const own: Record<string, unknown> = {};
  const byKey: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of Object.entries(patch)) {
    const split = splitExtensionField(name);
    if (!split) {
      own[name] = value;
      continue;
    }
    const [key, field] = split;
    if (!extensions.some((ext) => ext.key === key)) {
      throw new Error(`extend: no extension "${key}" for field "${name}".`);
    }
    byKey[key] = { ...byKey[key], [field]: value };
  }
  return { own, byKey };
}

/**
 * Set a value at a dotted path (`offer.image`) in a copy of `values`.
 *
 * @param values - The values
 * @param path - Field name, dotted for an extension field
 * @param value - The value
 */
export function setAtPath(
  values: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const split = splitExtensionField(path);
  if (!split) return { ...values, [path]: value };
  const [key, rest] = split;
  const current = values[key];
  const nested =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...values, [key]: setAtPath(nested, rest, value) };
}
