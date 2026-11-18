// packages/features/crud/src/forms/childRows.ts

/**
 * @fileoverview Child rows edits (pure)
 * @description Unsaved edits of a record's child rows (1:N, link tables N:M):
 * cell values, added rows, removed rows. Applying them to the saved rows,
 * validating them with the child entity's rules and schemas (also when read back
 * from browser storage), turning them into one `bulkAcross` batch, and settling
 * them against the saved rows after a write. Used by `useChildRows` and by
 * `useEntityForm` (joined rows are saved by the form's Save).
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import * as v from 'valibot';

import {
  createSchemas,
  describeEntity,
  generateUUID,
  getEntityByCollection,
  hasRoleAccess,
  isFieldVisible,
  prepareCreate,
  prepareUpdate,
} from '@donotdev/core';
import type { AnyEntity, BulkAcrossBatch } from '@donotdev/core';

import { extensionMintKey } from '../stores/FormStore';
import type { ChildRowEdits } from '../stores/FormStore';
import { injectScope } from '../utils/scopeUtils';
import {
  extensionFieldName,
  extensionWritable,
  splitExtensionField,
  splitPatch,
  withoutLinkField,
} from './extend';
import type { ResolvedExtension } from './extend';
import { buildSchemaDefaults } from './utils/buildInitialValues';
import { writableFields } from './utils/writableFields';

export { writableFields };

/** No edits. Shared constant: compare by reference to skip store writes. */
export const EMPTY_CHILD_EDITS: ChildRowEdits = {
  changes: {},
  added: [],
  removed: [],
};

/** Record id shape accepted from browser storage (Firestore ids, UUIDs, slugs). */
const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Shape of edits read back from a draft (browser storage: untrusted). */
const CHILD_EDITS_SHAPE = v.object({
  changes: v.record(
    v.pipe(v.string(), v.regex(RECORD_ID)),
    v.record(v.string(), v.unknown())
  ),
  added: v.array(
    v.looseObject({ id: v.pipe(v.string(), v.regex(RECORD_ID)) })
  ),
  removed: v.array(v.pipe(v.string(), v.regex(RECORD_ID))),
});

/** A row as the child list sees it. */
export type ChildRow = Record<string, unknown> & { id: string };

/** Why a field of a row is invalid: empty while required, or a value the rules reject. */
export type ChildRowErrorKind = 'required' | 'invalid';

/** Invalid fields by row id: `errors[rowId][field]` (extension fields prefixed). */
export type ChildRowErrorKinds = Record<string, Record<string, ChildRowErrorKind>>;

/** Schemas per entity, built once (validation runs on every change). */
const schemaCache = new WeakMap<AnyEntity, ReturnType<typeof createSchemas>>();
/**
 * The entity's `createSchemas`, built once per entity (validation runs on every
 * change; repeated writes carry the same schemas).
 *
 * @param entity - The entity
 */
export function schemasOf(entity: AnyEntity): ReturnType<typeof createSchemas> {
  let schemas = schemaCache.get(entity);
  if (!schemas) {
    schemas = createSchemas(entity);
    schemaCache.set(entity, schemas);
  }
  return schemas;
}

/**
 * Collection of the parent record: the child field's referenced collection
 * (descriptor `value.kind === 'ref'`: any field type with `validation.reference`,
 * custom ones included). Throws when `field` is not a reference field of `entity`
 * (a wrong parent would silently list nothing).
 *
 * @param entity - The child entity
 * @param field - The child's field pointing at the parent
 * @returns The parent collection
 */
export function parentCollectionOf(entity: AnyEntity, field: string): string {
  const value = describeEntity(entity).fields[field]?.value;
  if (value?.kind !== 'ref' || value.ref === undefined) {
    throw new Error(
      `useChildRows: parent field "${field}" is not a reference field of entity "${entity.name}".`
    );
  }
  return value.ref;
}

/**
 * The child entity of a joined list, from its collection (entities register on
 * `defineEntity`). Throws when no entity defines it.
 *
 * @param collection - The child collection
 * @returns The child entity
 */
export function childEntityOf(collection: string): AnyEntity {
  const entity = getEntityByCollection(collection);
  if (!entity) {
    throw new Error(
      `useEntityForm: no entity defines collection "${collection}" (joined child rows). Define it with defineEntity().`
    );
  }
  return entity;
}

/** What the viewer may do on the child entity (`entity.access`). */
export interface ChildRowsAccess {
  /** Add rows (`access.create`) */
  create: boolean;
  /** Edit saved rows (`access.update`) */
  update: boolean;
  /** Remove saved rows (`access.delete`) */
  delete: boolean;
}

/**
 * What the viewer may do on the entity, from its `access` roles.
 *
 * @param entity - The child entity
 * @param viewerRole - The viewer's role
 */
export function childRowsAccess(
  entity: AnyEntity,
  viewerRole: string
): ChildRowsAccess {
  return {
    create: hasRoleAccess(viewerRole, entity.access.create),
    update: hasRoleAccess(viewerRole, entity.access.update),
    delete: hasRoleAccess(viewerRole, entity.access.delete),
  };
}

/** Same stored value (undefined and null are both "empty"). */
function sameValue(a: unknown, b: unknown): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Whether the edits hold anything a Save would write. */
export function hasChildEdits(edits: ChildRowEdits): boolean {
  return (
    Object.keys(edits.changes).length > 0 ||
    edits.added.length > 0 ||
    edits.removed.length > 0
  );
}

/** Pending count: edited cells + added rows + removed rows. */
export function countChildEdits(edits: ChildRowEdits): number {
  return (
    Object.values(edits.changes).reduce(
      (sum, patch) => sum + Object.keys(patch).length,
      0
    ) +
    edits.added.length +
    edits.removed.length
  );
}

/**
 * Rows as shown: saved rows minus removed ones, then added rows. `base` holds
 * them without cell changes (a DataTable's data under its pending changes),
 * `items` with them applied.
 *
 * @param saved - The saved rows
 * @param edits - The unsaved edits
 */
export function applyChildEdits<T extends ChildRow>(
  saved: readonly T[],
  edits: ChildRowEdits
): { base: T[]; items: T[] } {
  if (!hasChildEdits(edits)) return { base: [...saved], items: [...saved] };
  const removed = new Set(edits.removed);
  // why: added rows are built from the child entity's writable fields, the same shape as T
  const base = [
    ...saved.filter((row) => !removed.has(row.id)),
    ...(edits.added as T[]),
  ];
  const items = base.map((row) =>
    edits.changes[row.id] ? { ...row, ...edits.changes[row.id] } : row
  );
  return { base, items };
}

/**
 * Set field values of one row: a value equal to the row's base value drops the
 * pending change (as a table cell set back to its saved value).
 *
 * @param edits - Current edits
 * @param base - The row without changes (saved or added)
 * @param patch - Field values to set
 */
export function setChildValues(
  edits: ChildRowEdits,
  base: ChildRow,
  patch: Record<string, unknown>
): ChildRowEdits {
  const row = { ...edits.changes[base.id] };
  for (const [field, value] of Object.entries(patch)) {
    if (sameValue(value, base[field])) delete row[field];
    else row[field] = value;
  }
  const changes = { ...edits.changes };
  if (Object.keys(row).length === 0) delete changes[base.id];
  else changes[base.id] = row;
  return { ...edits, changes };
}

/**
 * Remove rows: an added row is dropped, a saved row is marked for deletion.
 * Their cell changes are dropped either way.
 *
 * @param edits - Current edits
 * @param ids - Rows to remove
 */
export function removeChildRows(
  edits: ChildRowEdits,
  ids: readonly string[]
): ChildRowEdits {
  const gone = new Set(ids);
  const addedIds = new Set(edits.added.map((row) => row.id));
  return {
    changes: Object.fromEntries(
      Object.entries(edits.changes).filter(([id]) => !gone.has(id))
    ),
    added: edits.added.filter((row) => !gone.has(row.id)),
    removed: [
      ...new Set([
        ...edits.removed,
        ...ids.filter((id) => !addedIds.has(id)),
      ]),
    ],
  };
}

/**
 * Settle edits against the saved rows (after a load, a refetch, a partly
 * failed write): an added row now saved was written (its remaining changes
 * apply to the saved row), a removed row no longer saved was deleted, a change
 * equal to the saved value was written, a change of a row that exists nowhere
 * is dropped. Returns `edits` itself when nothing changed.
 *
 * @param edits - Current edits
 * @param saved - The saved rows (loaded)
 */
export function reconcileChildEdits(
  edits: ChildRowEdits,
  saved: readonly ChildRow[]
): ChildRowEdits {
  if (!hasChildEdits(edits)) return edits;
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const added = edits.added.filter((row) => !savedById.has(row.id));
  const addedIds = new Set(added.map((row) => row.id));
  const removed = edits.removed.filter((id) => savedById.has(id));
  const changes: ChildRowEdits['changes'] = {};
  for (const [id, patch] of Object.entries(edits.changes)) {
    const savedRow = savedById.get(id);
    if (!savedRow) {
      if (addedIds.has(id)) changes[id] = patch;
      continue;
    }
    const left = Object.fromEntries(
      Object.entries(patch).filter(
        ([field, value]) => !sameValue(value, savedRow[field])
      )
    );
    if (Object.keys(left).length > 0) changes[id] = left;
  }
  const next = { changes, added, removed };
  return JSON.stringify(next) === JSON.stringify(edits) ? edits : next;
}

/**
 * Edits made while a write was in flight, minus what that write submitted
 * (written on success): submitted added rows and removals leave, changes equal
 * to the submitted ones leave.
 *
 * @param current - Edits now
 * @param submitted - Edits the write carried
 */
export function rebaseChildEdits(
  current: ChildRowEdits,
  submitted: ChildRowEdits
): ChildRowEdits {
  if (current === submitted) return EMPTY_CHILD_EDITS;
  const submittedAdded = new Set(submitted.added.map((row) => row.id));
  const submittedRemoved = new Set(submitted.removed);
  const changes: ChildRowEdits['changes'] = {};
  for (const [id, patch] of Object.entries(current.changes)) {
    const sent = submitted.changes[id] ?? {};
    const left = Object.fromEntries(
      Object.entries(patch).filter(
        ([field, value]) => !(field in sent && sameValue(value, sent[field]))
      )
    );
    if (Object.keys(left).length > 0) changes[id] = left;
  }
  const next = {
    changes,
    added: current.added.filter((row) => !submittedAdded.has(row.id)),
    removed: current.removed.filter((id) => !submittedRemoved.has(id)),
  };
  return hasChildEdits(next) ? next : EMPTY_CHILD_EDITS;
}

/** Keys of `values` that pass the entity's (lenient) update schema. */
function validKeys(
  entity: AnyEntity,
  id: string,
  values: Record<string, unknown>
): Set<string> {
  const result = v.safeParse(schemasOf(entity).update, { ...values, id });
  const keys = new Set(Object.keys(values));
  if (!result.success) {
    for (const issue of result.issues) {
      const key = issue.path?.[0]?.key;
      if (typeof key === 'string') keys.delete(key);
    }
  }
  return keys;
}

/** Only the given keys of a record. */
export function pickFields(
  values: Record<string, unknown>,
  keys: ReadonlySet<string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => keys.has(key))
  );
}

/** What a child list knows to validate and write its rows. */
export interface ChildRowsContext {
  /** The child entity */
  entity: AnyEntity;
  /** The child's parent field and the parent record id (none: every record) */
  parent?: { field: string; value: string };
  /** 1:1 extensions of the rows, resolved for the viewer */
  extensions?: readonly ResolvedExtension[];
  /** Existing extension row ids: `extensionIds[rowId][key]` (absent: inserted on Save) */
  extensionIds?: Record<string, Record<string, string>>;
  /** Stored rows by id (as loaded, extensions merged under their key): edits are checked merged with them */
  savedRows?: ReadonlyMap<string, ChildRow>;
  /**
   * Id of the extension row inserted for a record (`key` from `extensionMintKey`):
   * the same on every call until written. Default: a new id per call.
   */
  mintId?: (key: string) => string;
}

/** Unprefixed field names of a prefixed set. */
const unprefixed = (names: ReadonlySet<string>): Set<string> =>
  new Set([...names].map((name) => splitExtensionField(name)?.[1] ?? name));

/** Values a new extension row starts from (schema defaults the viewer may set). */
function extensionDefaults(
  ext: ResolvedExtension,
  viewerRole: string
): Record<string, unknown> {
  return buildSchemaDefaults(
    ext.entity,
    unprefixed(extensionWritable(ext, viewerRole, 'create'))
  );
}

/**
 * Edits read back from a form draft (browser storage: untrusted, possibly from
 * an older page version), kept only as far as the entity's rules allow: fields
 * the viewer may write (extension fields `key.field` included), values of the
 * right type, ids of record shape; added rows belong to the parent. Throws when
 * the shape is not an edits object.
 *
 * @param context - The child entity, parent and extensions
 * @param raw - The stored value
 * @param viewerRole - The viewer's role
 */
export function parseChildEdits(
  context: ChildRowsContext,
  raw: unknown,
  viewerRole: string
): ChildRowEdits {
  const { entity, parent, extensions = [] } = context;
  const draft = v.parse(CHILD_EDITS_SHAPE, raw);
  const access = childRowsAccess(entity, viewerRole);
  const extCreate = extensions.flatMap((ext) => [
    ...extensionWritable(ext, viewerRole, 'create'),
  ]);
  const extAny = [
    ...extCreate,
    ...extensions.flatMap((ext) => [...extensionWritable(ext, viewerRole, 'edit')]),
  ];
  const editFields = new Set([...writableFields(entity, viewerRole, 'edit'), ...extAny]);
  const createFields = new Set([...writableFields(entity, viewerRole, 'create'), ...extCreate]);
  if (parent) createFields.delete(parent.field);

  /** Keys whose values pass the entity's (or extension's) lenient update schema. */
  const valid = (id: string, values: Record<string, unknown>) => {
    const { own, byKey } = splitPatch(values, extensions);
    const keys = validKeys(entity, id, own);
    for (const ext of extensions) {
      const extValues = byKey[ext.key];
      if (!extValues) continue;
      for (const field of validKeys(ext.entity, id, extValues)) {
        keys.add(extensionFieldName(ext.key, field));
      }
    }
    return pickFields(values, keys);
  };

  const added: ChildRowEdits['added'] = (
    access.create ? draft.added : []
  ).map((row) => ({
    ...valid(row.id, pickFields(row, createFields)),
    id: row.id,
    ...(parent && { [parent.field]: parent.value }),
  }));
  const addedIds = new Set(added.map((row) => row.id));
  const changes: ChildRowEdits['changes'] = {};
  for (const [id, patch] of Object.entries(draft.changes)) {
    const isAdded = addedIds.has(id);
    const allowed = isAdded
      ? createFields
      : new Set(
          [...editFields].filter(
            (name) => splitExtensionField(name) !== null || access.update
          )
        );
    const kept = valid(id, pickFields(patch, allowed));
    if (Object.keys(kept).length > 0) changes[id] = kept;
  }
  const removed = access.delete
    ? [...new Set(draft.removed.filter((id) => !addedIds.has(id)))]
    : [];
  const edits = { changes, added, removed };
  return hasChildEdits(edits) ? edits : EMPTY_CHILD_EDITS;
}

/**
 * The entity reduced to the fields the viewer can see: a row read for the viewer
 * carries only those, so only those can be checked (one stable entity per role).
 */
const visibleCache = new WeakMap<AnyEntity, Map<string, AnyEntity>>();
function visibleProjection(entity: AnyEntity, viewerRole: string): AnyEntity {
  let byRole = visibleCache.get(entity);
  if (!byRole) {
    byRole = new Map();
    visibleCache.set(entity, byRole);
  }
  let projected = byRole.get(viewerRole);
  if (!projected) {
    projected = {
      ...entity,
      fields: Object.fromEntries(
        Object.entries(entity.fields).filter(([, field]) =>
          isFieldVisible(field.visibility ?? 'guest', viewerRole)
        )
      ),
    };
    byRole.set(viewerRole, projected);
  }
  return projected;
}

/**
 * Fields a Save would reject, by row, checked on every change. A grid is a
 * shortcut onto the same records, so it follows the record form's rules: the CRUD
 * rules (core/schemas crud/), as every writer and the server apply them:
 * - added row (and a missing extension row, inserted on Save: its defaults and
 *   edits): `prepareCreate`;
 * - edited stored row: `prepareUpdate` with the changed fields on the stored row (a
 *   draft may leave required fields empty; leaving draft checks the whole record).
 * Extension rows the same way. Only fields the viewer can see are checked (a row
 * read for the viewer carries only those). Only rows with edits are checked.
 * Extension fields are reported prefixed.
 *
 * @param context - The child entity, parent, extensions and stored rows
 * @param edits - The edits
 * @param viewerRole - The viewer's role
 * @returns `errors[rowId][field]` = kind (empty when all are valid)
 */
export function childEditsErrors(
  context: ChildRowsContext,
  edits: ChildRowEdits,
  viewerRole = 'guest'
): ChildRowErrorKinds {
  const { entity, extensions = [], savedRows } = context;
  if (!hasChildEdits(edits)) return {};
  const addedIds = new Set(edits.added.map((row) => row.id));
  const removed = new Set(edits.removed);
  const errors: ChildRowErrorKinds = {};
  /**
   * Check a row: `values` = the resulting row; `stored` + `changed` for an edited
   * stored row (only the changed fields unless it is a draft or enters a visible status).
   */
  const check = (
    target: AnyEntity,
    rowId: string,
    values: Record<string, unknown>,
    prefix: string,
    stored?: Record<string, unknown>,
    changed?: Record<string, unknown>
  ) => {
    const schemas = schemasOf(visibleProjection(target, viewerRole));
    // The CRUD rules (core/schemas crud/), as the writers and the server apply them.
    const result = stored === undefined
      ? prepareCreate(schemas, values)
      : prepareUpdate(schemas, { id: String(stored.id ?? rowId), patch: changed ?? {}, stored });
    if (result.ok) return;
    for (const issue of result.issues) {
      const key = issue.path?.[0]?.key;
      if (typeof key !== 'string') continue;
      const input = issue.path?.[0]?.value;
      const kind: ChildRowErrorKind =
        input === undefined || input === null || input === '' ? 'required' : 'invalid';
      const name = prefix ? extensionFieldName(prefix, key) : key;
      errors[rowId] = { ...errors[rowId], [name]: errors[rowId]?.[name] ?? kind };
    }
  };
  const checkExtensions = (
    rowId: string,
    stored: ChildRow | undefined,
    byKey: Record<string, Record<string, unknown>>,
    isAdded: boolean
  ) => {
    for (const ext of extensions) {
      const values = byKey[ext.key];
      const storedExt = isAdded ? undefined : stored?.[ext.key];
      if (isRecord(storedExt)) {
        if (values) check(withoutLinkField(ext), rowId, { ...storedExt, ...values }, ext.key, storedExt, values);
      } else if ((isAdded && ext.create) || values) {
        check(
          withoutLinkField(ext),
          rowId,
          { ...extensionDefaults(ext, viewerRole), ...values },
          ext.key
        );
      }
    }
  };
  for (const row of edits.added) {
    const { id, ...values } = { ...row, ...edits.changes[row.id] };
    const { own, byKey } = splitPatch(values, extensions);
    check(entity, id, own, '');
    checkExtensions(id, undefined, byKey, true);
  }
  for (const [id, patch] of Object.entries(edits.changes)) {
    if (addedIds.has(id) || removed.has(id)) continue;
    // Not loaded yet (or gone): settled against the stored rows once they are.
    const stored = savedRows?.get(id);
    if (!stored) continue;
    const { own, byKey } = splitPatch(patch, extensions);
    if (Object.keys(own).length > 0) check(entity, id, ownValues(stored, own), '', stored, own);
    checkExtensions(id, stored, byKey, false);
  }
  return errors;
}

/** A stored row's own values (no extension values) merged with its own edits. */
function ownValues(
  stored: ChildRow,
  own: Record<string, unknown>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(stored)) {
    if (!splitExtensionField(name)) values[name] = value;
  }
  return { ...values, ...own };
}

/** Plain object (a stored extension row under its key). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The `bulkAcross` batches writing the edits: the child collection (inserts =
 * added rows with their changes and the parent id, pre-minted ids kept;
 * updates; deletes) and one per extension (updates of existing extension rows,
 * inserts of missing ones; an extension of an added row depends on its insert).
 * Each batch carries its entity's schemas.
 *
 * @param context - The child entity, parent, extensions and extension ids
 * @param edits - The edits to write
 * @param viewerRole - The viewer's role (extension defaults)
 */
export function childEditsBatches(
  context: ChildRowsContext,
  edits: ChildRowEdits,
  viewerRole = 'guest'
): BulkAcrossBatch[] {
  const {
    entity,
    parent,
    extensions = [],
    extensionIds = {},
    mintId = () => generateUUID(),
  } = context;
  const schemas = schemasOf(entity);
  const addedIds = new Set(edits.added.map((row) => row.id));
  const removed = new Set(edits.removed);
  const extInserts: Record<string, Array<Record<string, unknown> & { id: string }>> = {};
  const extUpdates: Record<string, Array<{ id: string; patch: Record<string, unknown> }>> = {};
  const dependent = new Set<string>();

  const writeExtensions = (
    id: string,
    byKey: Record<string, Record<string, unknown>>,
    isAdded: boolean
  ) => {
    for (const ext of extensions) {
      const values = byKey[ext.key];
      const existing = isAdded ? undefined : extensionIds[id]?.[ext.key];
      if (existing) {
        if (!values) continue;
        if (!ext.update) throw new Error(`extend.${ext.key}: the viewer may not edit it.`);
        (extUpdates[ext.key] ??= []).push({ id: existing, patch: values });
      } else if ((isAdded && ext.create) || values) {
        if (!ext.create) throw new Error(`extend.${ext.key}: the viewer may not create it.`);
        (extInserts[ext.key] ??= []).push(
          injectScope(
            {
              ...extensionDefaults(ext, viewerRole),
              ...values,
              id: mintId(extensionMintKey(ext.entity.collection, id)),
              [ext.field]: id,
            },
            ext.entity.scope
          )
        );
        if (isAdded) dependent.add(ext.key);
      }
    }
  };

  const inserts = edits.added.map((row) => {
    const { own, byKey } = splitPatch({ ...row, ...edits.changes[row.id] }, extensions);
    writeExtensions(row.id, byKey, true);
    return injectScope(
      { ...own, id: row.id, ...(parent && { [parent.field]: parent.value }) },
      entity.scope
    );
  });
  const updates = Object.entries(edits.changes)
    .filter(([id]) => !addedIds.has(id) && !removed.has(id))
    .flatMap(([id, patch]) => {
      const { own, byKey } = splitPatch(patch, extensions);
      writeExtensions(id, byKey, false);
      return Object.keys(own).length > 0 ? [{ id, patch: own }] : [];
    });

  const batches: BulkAcrossBatch[] = [];
  if (inserts.length > 0 || updates.length > 0 || edits.removed.length > 0) {
    batches.push({
      collection: entity.collection,
      ...(inserts.length > 0 && { inserts }),
      ...(updates.length > 0 && { updates }),
      ...(edits.removed.length > 0 && { deletes: [...edits.removed] }),
      schemas,
    });
  }
  for (const ext of extensions) {
    const extInsertRows = extInserts[ext.key] ?? [];
    const extUpdateRows = extUpdates[ext.key] ?? [];
    if (extInsertRows.length === 0 && extUpdateRows.length === 0) continue;
    const extSchemas = schemasOf(ext.entity);
    batches.push({
      collection: ext.entity.collection,
      ...(extInsertRows.length > 0 && { inserts: extInsertRows }),
      ...(extUpdateRows.length > 0 && { updates: extUpdateRows }),
      schemas: extSchemas,
      ...(dependent.has(ext.key) && { dependsOn: [entity.collection] }),
    });
  }
  return batches;
}

/**
 * Batches of the same collection merged into one (`bulkAcross` takes one batch
 * per collection), e.g. two child lists of one entity under different parents.
 *
 * @param batches - Batches to merge
 */
export function mergeBatches(batches: BulkAcrossBatch[]): BulkAcrossBatch[] {
  const byCollection = new Map<string, BulkAcrossBatch>();
  for (const batch of batches) {
    const current = byCollection.get(batch.collection);
    if (!current) {
      byCollection.set(batch.collection, batch);
      continue;
    }
    const inserts = [...(current.inserts ?? []), ...(batch.inserts ?? [])];
    const updates = [...(current.updates ?? []), ...(batch.updates ?? [])];
    const deletes = [...(current.deletes ?? []), ...(batch.deletes ?? [])];
    const dependsOn = [
      ...new Set([...(current.dependsOn ?? []), ...(batch.dependsOn ?? [])]),
    ];
    byCollection.set(batch.collection, {
      ...current,
      ...(inserts.length > 0 && { inserts }),
      ...(updates.length > 0 && { updates }),
      ...(deletes.length > 0 && { deletes }),
      ...(dependsOn.length > 0 && { dependsOn }),
    });
  }
  return [...byCollection.values()];
}
