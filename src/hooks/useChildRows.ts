'use client';
// packages/features/crud/src/hooks/useChildRows.ts

/**
 * @fileoverview useChildRows hook
 * @description A record's child rows (1:N, including link tables N:M with data
 * on the link): edited, added and removed, kept with the record's unsaved edits
 * and saved by the record's Save. Joins the edit form open on the parent record
 * (FormStore); without one, edits stay in memory for this instance. Rows may
 * carry 1:1 extensions (`extend`): read in one batched query, addressed as
 * `key.field`, written with the rows.
 *
 * @version 0.2.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { generateUUID, REMOVED_STATUS, useTranslation } from '@donotdev/core';
import type {
  AnyEntity,
  BulkResult,
  EntityExtensions,
  InferEntityRow,
} from '@donotdev/core';

import {
  EMPTY_CHILD_EDITS,
  applyChildEdits,
  childEditsBatches,
  childEditsErrors,
  childRowsAccess,
  countChildEdits,
  hasChildEdits,
  parentCollectionOf,
  parseChildEdits,
  rebaseChildEdits,
  reconcileChildEdits,
  removeChildRows,
  setChildValues,
  writableFields,
} from '../forms/childRows';
import type {
  ChildRow,
  ChildRowErrorKinds,
  ChildRowsAccess,
  ChildRowsContext,
} from '../forms/childRows';
import {
  extensionFieldName,
  extensionFields,
  extensionWritable,
  extensionsSignature,
  resolveExtensions,
  splitExtensionField,
} from '../forms/extend';
import type { RenderableField } from '../forms/utils/getFieldsForOperation';
import { translateFieldLabel } from '../forms/utils/translateFieldLabel';
import { buildSchemaDefaults } from '../forms/utils/buildInitialValues';
import { childRowsKey, extensionMintKey, useFormStore } from '../stores';
import type { ChildRowEdits, ChildRowsWriter, OpenRecordForm } from '../stores';
import { getCrudServiceInstance, useCrud } from '../useCrud';
import { useCrudList } from '../useCrudList';
import { useExtensionRows } from './useExtensionRows';

/** Parent of the child rows: the child's reference field and the parent record id. */
export interface ChildRowsParent {
  /** Reference field of the child entity pointing at the parent (e.g. `'campaignId'`) */
  field: string;
  /** Parent record id, or `null` while the parent is not created yet (no rows) */
  value: string | null;
}

/** Options for {@link useChildRows}. */
export interface UseChildRowsOptions {
  /**
   * Viewer role for the entity rules (access, editable fields). Default: the
   * joined form's `viewerRole`, else `'guest'` (most restrictive).
   */
  viewerRole?: string;
  /**
   * 1:1 extensions of the rows (e.g. `{ offer: { entity: productOfferEntity,
   * field: 'productId' } }`): read in one batched query per loaded set, merged
   * under the key (`row.offer.priceExclVat`), edited and validated as
   * `offer.priceExclVat`, written with the rows (update, or insert of a missing
   * extension). A viewer without access to an extension entity gets none of it.
   * Use the same `extend` on every instance of the same rows; keep its keys.
   * @since 0.2.5
   */
  extend?: EntityExtensions;
}

/** Return type of {@link useChildRows}. */
export interface UseChildRowsReturn<T extends { id: string }> {
  /**
   * Saved rows with unsaved edits applied, then added rows; removed rows hidden.
   * Extensions are merged under their key (`row.offer`, `null` when missing)
   * and as flat `key.field` values.
   */
  items: T[];
  /** The same rows without cell changes (a DataTable's data under `edits.changes`) */
  base: T[];
  /** Unsaved edits: cell values by row id (extension fields `key.field`), added rows, removed row ids */
  edits: ChildRowEdits;
  /** Edited cells + added rows + removed rows */
  pendingCount: number;
  /** Whether anything is unsaved */
  hasEdits: boolean;
  /**
   * Invalid fields of the edited rows, checked on every change against the
   * database contract: the resulting row (stored row merged with its edits, an
   * added row as added; extensions the same) against the schema of its
   * resulting status (`draft` → draft schema, otherwise the full create schema,
   * required fields included): `errors[rowId][fieldKey]` = translated message, field keys as
   * cells address them (`offer.priceExclVat`). Empty when all are valid. A Save
   * (the form's, or `save()`) is blocked while it is not empty.
   * @since 0.2.5
   */
  errors: Record<string, Record<string, string>>;
  /**
   * Add rows (pre-minted ids, schema defaults, the parent id set). Only fields
   * the viewer may set on create (extension fields `key.field` included).
   * Returns the new ids.
   */
  add: (values: Array<Partial<T> & Record<string, unknown>>) => string[];
  /**
   * Set field values of a row (saved or added), extension fields as
   * `key.field`. A value equal to the saved one drops the pending change.
   * Ordering: `update(id, { sortOrder })`.
   */
  update: (id: string, patch: Partial<T> & Record<string, unknown>) => void;
  /**
   * Logical delete (CRUD rule 3): added rows are dropped, saved rows get
   * `{ status: 'deleted' }` on Save. `delete` is the hard delete.
   */
  remove: (ids: readonly string[]) => void;
  /** Hard delete: added rows are dropped, saved rows are deleted on Save. */
  delete: (ids: readonly string[]) => void;
  /** Drop every unsaved edit. */
  discard: () => void;
  /**
   * Standalone only (no form open on the parent): write this instance's edits.
   * Rejects without writing while `errors` is not empty (message: the count of
   * rows to fix). Without extensions one `bulk` (partial success: rows that fail
   * stay unsaved); with extensions one `bulkAcross` (rejects as a whole, edits
   * kept). On success exactly what it sent leaves the edits at once; edits made
   * during the save stay pending. Throws when joined: the form's Save writes
   * joined rows.
   */
  save: () => Promise<BulkResult | void>;
  /** Refetch the saved rows. */
  refresh: () => Promise<void>;
  /** True during the initial fetch (rows or extensions) */
  loading: boolean;
  /** Fetch error, or null */
  error: Error | null;
  /** True when an open form edits the parent record: its draft and Save own the edits */
  joined: boolean;
  /** What the viewer may do (entity `access`); all false = read-only */
  access: ChildRowsAccess;
  /**
   * Extension fields the viewer may see, prefixed (`offer.priceExclVat`), for
   * columns or custom displays; `editable` when the viewer may write them.
   */
  extensionFields: RenderableField[];
}

/**
 * The edit form the child rows of `parent` join: the latest `useEntityForm` (edit
 * mode) opened on that parent record, or `null`. The parent collection comes
 * from the child field's `validation.reference`.
 *
 * @param entity - The child entity
 * @param parent - The child's parent field and the parent record id (`undefined`: none)
 * @returns The open form, or `null` when none edits that record
 *
 * @example
 * ```tsx
 * const joined = useJoinedForm(campaignProductEntity, { field: 'campaignId', value: campaign.id }) !== null;
 * ```
 */
export function useJoinedForm(
  entity: AnyEntity,
  parent: ChildRowsParent | undefined
): OpenRecordForm | null {
  const collection = parent ? parentCollectionOf(entity, parent.field) : null;
  const recordId = parent?.value ?? null;
  return useFormStore((state) => {
    if (collection === null || recordId === null) return null;
    for (let i = state.openRecords.length - 1; i >= 0; i--) {
      const form = state.openRecords[i]!;
      if (form.collection === collection && form.recordId === recordId) {
        return form;
      }
    }
    return null;
  });
}

/**
 * A record's child rows, edited with the record and saved by its Save.
 *
 * **Joined (automatic):** when an edit form (`useEntityForm` / `EntityFormRenderer`)
 * is open on the parent record, the rows join it: unsaved edits live in that
 * form's draft (restored, discarded and kept on a failed save with it), the
 * form's Save writes them (default writer, or `form.pendingWrites()` in the
 * app's `onValid`), they are validated with the fields before the page leaves,
 * and cleared then refetched after a successful save. Every `useChildRows` on
 * the same form, entity and parent sees the same rows. The latest form opened
 * on the record wins. All the parent's rows are loaded (client-side list).
 *
 * **Standalone:** no such form, or no `parent` (every record of the entity):
 * edits stay in memory for this instance; `save()` writes them.
 *
 * **1:1 extensions (`extend`):** see {@link UseChildRowsOptions.extend}.
 *
 * Entity rules: the viewer's `access` gates add / edit / remove (calls throw
 * when not allowed), only fields the viewer may write are set, drafts read back
 * from the browser are validated, edits of rows that no longer exist are dropped.
 *
 * @param entity - The child entity
 * @param parent - The child's reference field and the parent record id (`null` before the parent exists; omitted: every record)
 * @param options - See {@link UseChildRowsOptions}
 * @returns See {@link UseChildRowsReturn}
 *
 * @example
 * ```tsx
 * const rows = useChildRows(campaignProductEntity, { field: 'campaignId', value: campaign.id });
 * rows.items.map((row) => <ProductLine key={row.id} row={row} onChange={(patch) => rows.update(row.id, patch)} />);
 * <Button onClick={() => rows.add([{ productId }])}>Add</Button>
 *
 * // Products with their private offer, all records (no parent)
 * const products = useChildRows(productEntity, undefined, {
 *   extend: { offer: { entity: productOfferEntity, field: 'productId' } },
 * });
 * products.update(id, { 'offer.priceExclVat': 12 });
 * ```
 */
export function useChildRows<E extends AnyEntity>(
  entity: E,
  parent?: ChildRowsParent,
  options?: UseChildRowsOptions
): UseChildRowsReturn<InferEntityRow<E>>;
export function useChildRows(
  entity: AnyEntity,
  parent?: ChildRowsParent,
  options: UseChildRowsOptions = {}
): UseChildRowsReturn<ChildRow> {
  const target = useJoinedForm(entity, parent);
  const viewerRole = options.viewerRole ?? target?.viewerRole ?? 'guest';
  const access = childRowsAccess(entity, viewerRole);
  // No parent: every record. A parent not created yet: nothing to list.
  const parentId = parent ? parent.value : undefined;
  const hasRows = parentId !== null;
  const savedParent =
    parent && parent.value !== null
      ? { field: parent.field, value: parent.value }
      : undefined;

  const signature = extensionsSignature(options.extend);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- why: `extend` is usually an object literal; its signature identifies it
  const extensions = useMemo(
    () => resolveExtensions(entity, options.extend, viewerRole),
    [entity, signature, viewerRole]
  );

  const { t } = useTranslation([
    'crud',
    entity.namespace,
    ...extensions.map((ext) => ext.entity.namespace),
  ]);

  const list = useCrudList<ChildRow>(entity.collection, {
    entity,
    enabled: hasRows,
    pagination: 'client',
    ...(parent && {
      queryOptions: {
        where: [{ field: parent.field, operator: '==', value: parentId }],
      },
    }),
  });
  const { bulk } = useCrud<Record<string, unknown>>(entity.collection, {
    entity,
  });
  const listLoaded =
    hasRows && list.data !== null && !list.loading && !list.error;
  const extensionRows = useExtensionRows(
    extensions,
    list.items.map((row) => row.id),
    listLoaded
  );
  const extensionsLoading = Object.values(extensionRows).some((rows) => rows.loading);
  const extensionsError =
    Object.values(extensionRows).find((rows) => rows.error)?.error ?? null;

  const key =
    target && savedParent
      ? childRowsKey(target.formKey, savedParent.value, entity.collection, savedParent.field)
      : null;
  const shared = useFormStore((state) =>
    key === null ? undefined : state.childEdits[key]
  );
  const [local, setLocal] = useState<ChildRowEdits>(EMPTY_CHILD_EDITS);
  const [saving, setSaving] = useState(false);
  const edits = key === null ? local : (shared ?? EMPTY_CHILD_EDITS);

  /** Apply a change to the current edits (FormStore when joined, else local). */
  const write = (change: (current: ChildRowEdits) => ChildRowEdits) => {
    if (key === null || !target) {
      setLocal(change);
      return;
    }
    const current = useFormStore.getState().childEdits[key] ?? EMPTY_CHILD_EDITS;
    const next = change(current);
    if (next === current) return;
    useFormStore
      .getState()
      .setChildEdits(key, hasChildEdits(next) ? next : null);
    target.changed();
  };

  // Saved rows with their extensions: nested under the key, and flat `key.field`
  // values (what cells, edits and validation address).
  const extensionIds: Record<string, Record<string, string>> = {};
  const saved: ChildRow[] =
    extensions.length === 0
      ? list.items
      : list.items.map((row) => {
          const merged: ChildRow = { ...row };
          for (const ext of extensions) {
            if (!ext.readable) continue;
            const extRow = extensionRows[ext.key]?.byRecord.get(row.id) ?? null;
            merged[ext.key] = extRow;
            if (!extRow) continue;
            (extensionIds[row.id] ??= {})[ext.key] = extRow.id;
            for (const [field, value] of Object.entries(extRow)) {
              merged[extensionFieldName(ext.key, field)] = value;
            }
          }
          return merged;
        });
  const applied = applyChildEdits(saved, edits);
  const base = applied.base;
  const items =
    extensions.length === 0
      ? applied.items
      : applied.items.map((row) => {
          const patch = edits.changes[row.id];
          if (!patch) return row;
          const nested: ChildRow = { ...row };
          for (const [name, value] of Object.entries(patch)) {
            const split = splitExtensionField(name);
            if (!split) continue;
            const [extKey, field] = split;
            const current = nested[extKey];
            nested[extKey] = {
              ...(typeof current === 'object' && current !== null ? current : {}),
              [field]: value,
            };
          }
          return nested;
        });

  // The form validates and writes joined edits through this writer (it knows the
  // extensions and their existing rows). Stable object, latest values via a ref.
  const context: ChildRowsContext = {
    entity,
    ...(savedParent && { parent: savedParent }),
    extensions,
    extensionIds,
    // Edits are checked merged with their stored row (the resulting row).
    savedRows: new Map(saved.map((row) => [row.id, row])),
    // Same extension ids on every write until written (retries insert the same rows).
    mintId: (mintKey) => useFormStore.getState().mintId(mintKey),
  };

  /** Owner entity and unprefixed name of a field key (`offer.price` → the extension). */
  const describe = (field: string) => {
    const split = splitExtensionField(field);
    const ext = split
      ? extensions.find((candidate) => candidate.key === split[0])
      : undefined;
    return ext && split
      ? { entity: ext.entity, field: split[1] }
      : { entity, field };
  };
  /** Translated messages of error kinds. */
  const messagesOf = (kinds: ChildRowErrorKinds) => {
    const messages: Record<string, Record<string, string>> = {};
    for (const [rowId, fields] of Object.entries(kinds)) {
      messages[rowId] = {};
      for (const [name, kind] of Object.entries(fields)) {
        const owner = describe(name);
        const ownerT = (key: string, options?: Record<string, unknown>) =>
          t(key, { ns: owner.entity.namespace, ...options });
        messages[rowId][name] = t(
          kind === 'required' ? 'crud:childRows.required' : 'crud:childRows.invalidValue',
          { field: translateFieldLabel(owner.field, owner.entity.fields[owner.field], ownerT) }
        );
      }
    }
    return messages;
  };
  const errors = messagesOf(childEditsErrors(context, edits, viewerRole));
  const errorCount = Object.keys(errors).length;

  const latest = useRef({ context, viewerRole, messagesOf, describe });
  latest.current = { context, viewerRole, messagesOf, describe };
  const [writer] = useState<ChildRowsWriter>(() => ({
    entity,
    describe: (field) => latest.current.describe(field),
    errors: (submitted) =>
      latest.current.messagesOf(
        childEditsErrors(latest.current.context, submitted, latest.current.viewerRole)
      ),
    batches: (submitted) =>
      childEditsBatches(latest.current.context, submitted, latest.current.viewerRole),
  }));
  useEffect(() => {
    if (key === null) return;
    const store = useFormStore.getState();
    store.setChildWriter(key, writer);
    // Edits read back from the form's draft: validated here, where the entity,
    // the parent and the extensions are known.
    const raw = store.childDrafts[key];
    if (raw === undefined) return;
    store.setChildDraft(key, null);
    try {
      const restored = parseChildEdits(latest.current.context, raw, latest.current.viewerRole);
      store.setChildEdits(key, hasChildEdits(restored) ? restored : null);
    } catch (error) {
      // Not this page's shape (older version, edited storage): keep the saved rows.
      console.warn(`[useChildRows] ${entity.collection}: draft rows rejected`, error);
    }
  }, [key, writer, entity.collection]);

  // An extension row now stored: its minted insert id is spent.
  const storedExtensionKeys = extensions.flatMap((ext) =>
    Object.entries(extensionIds).flatMap(([rowId, byKey]) =>
      byKey[ext.key] ? [extensionMintKey(ext.entity.collection, rowId)] : []
    )
  );
  const storedExtensionSignature = storedExtensionKeys.join('|');
  useEffect(() => {
    if (storedExtensionKeys.length > 0) {
      useFormStore.getState().releaseMintedIds(storedExtensionKeys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: the keys are identified by their signature
  }, [storedExtensionSignature]);

  // Settle edits against the saved rows once loaded, and after every refetch
  // (a partly failed write leaves only what was not written). Not while a write
  // is in flight: its optimistic cache would look written before the server answers.
  const loaded = listLoaded && !extensionsLoading;
  const submitting = target ? target.submitting : saving;
  useEffect(() => {
    if (!loaded || submitting) return;
    write((current) => reconcileChildEdits(current, saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: `write` / `saved` are rebuilt each render; their sources are listed
  }, [loaded, submitting, list.items, extensionRows, key, target]);

  const requireParent = (): void => {
    if (parentId === null) {
      throw new Error(
        `useChildRows(${entity.name}): the parent record is not created yet (parent.value is null).`
      );
    }
  };

  /** Extension fields the viewer may write on a row (create: the extension is missing). */
  const extensionAllowed = (rowId: string | null): Set<string> =>
    new Set(
      extensions.flatMap((ext) => [
        ...extensionWritable(
          ext,
          viewerRole,
          rowId !== null && extensionIds[rowId]?.[ext.key] ? 'edit' : 'create'
        ),
      ])
    );

  const add = (values: Array<Record<string, unknown>>): string[] => {
    requireParent();
    if (!access.create) {
      throw new Error(`useChildRows(${entity.name}): the viewer may not add rows.`);
    }
    const own = writableFields(entity, viewerRole, 'create');
    const allowed = new Set([...own, ...extensionAllowed(null)]);
    for (const row of values) {
      const denied = Object.keys(row).filter(
        (name) => name !== parent?.field && !allowed.has(name)
      );
      if (denied.length > 0) {
        throw new Error(
          `useChildRows(${entity.name}): fields not writable on create: ${denied.join(', ')}.`
        );
      }
    }
    const defaults = buildSchemaDefaults(entity, own);
    const rows = values.map((row) => ({
      ...defaults,
      ...row,
      id: generateUUID(),
      ...(savedParent && { [savedParent.field]: savedParent.value }),
    }));
    write((current) => ({ ...current, added: [...current.added, ...rows] }));
    return rows.map((row) => row.id);
  };

  const update = (id: string, patch: Record<string, unknown>) => {
    requireParent();
    const row = base.find((candidate) => candidate.id === id);
    if (!row) {
      throw new Error(`useChildRows(${entity.name}): no row "${id}".`);
    }
    const isAdded = edits.added.some((candidate) => candidate.id === id);
    const ownPatch = Object.keys(patch).some((name) => !splitExtensionField(name));
    if (ownPatch && !(isAdded ? access.create : access.update)) {
      throw new Error(`useChildRows(${entity.name}): the viewer may not edit rows.`);
    }
    const allowed = new Set([
      ...writableFields(entity, viewerRole, isAdded ? 'create' : 'edit'),
      ...extensionAllowed(isAdded ? null : id),
    ]);
    const denied = Object.keys(patch).filter((name) => !allowed.has(name));
    if (denied.length > 0) {
      throw new Error(
        `useChildRows(${entity.name}): fields not writable: ${denied.join(', ')}.`
      );
    }
    write((current) => setChildValues(current, row, patch));
  };

  const deleteRows = (ids: readonly string[]) => {
    const addedIds = new Set(edits.added.map((row) => row.id));
    if (!access.delete && ids.some((id) => !addedIds.has(id))) {
      throw new Error(`useChildRows(${entity.name}): the viewer may not delete rows.`);
    }
    write((current) => removeChildRows(current, ids));
  };

  // CRUD rule 3: a saved row gets `{ status: 'deleted' }` on Save (no other field is
  // validated); an added row is dropped.
  const remove = (ids: readonly string[]) => {
    const addedIds = new Set(edits.added.map((row) => row.id));
    const saved = ids.filter((id) => !addedIds.has(id));
    if (saved.length > 0 && !access.update) {
      throw new Error(`useChildRows(${entity.name}): the viewer may not remove rows.`);
    }
    const rows = saved.map((id) => {
      const row = base.find((candidate) => candidate.id === id);
      if (!row) throw new Error(`useChildRows(${entity.name}): no row "${id}".`);
      return row;
    });
    write((current) =>
      rows.reduce(
        (next, row) => setChildValues(next, row, { status: REMOVED_STATUS }),
        removeChildRows(current, ids.filter((id) => addedIds.has(id)))
      )
    );
  };

  const discard = () => write(() => EMPTY_CHILD_EDITS);

  const save = async (): Promise<BulkResult | void> => {
    if (target) {
      throw new Error(
        `useChildRows(${entity.name}).save(): the rows are joined to the form open on the parent; its Save writes them.`
      );
    }
    requireParent();
    // Invalid rows: nothing is written; the cells already show why.
    if (errorCount > 0) {
      throw new Error(t('crud:childRows.invalidRows', { count: errorCount }));
    }
    // Exactly what this save sends: on success it (and only it) leaves the edits.
    const submitted = local;
    if (extensions.length > 0) {
      // Rows and extensions in one ordered write; it rejects as a whole.
      const service = getCrudServiceInstance();
      if (!service) throw new Error(`useChildRows(${entity.name}).save(): the CRUD service is not ready.`);
      setSaving(true);
      try {
        await service.bulkAcross(childEditsBatches(context, submitted, viewerRole));
        setLocal((current) => rebaseChildEdits(current, submitted));
        return;
      } finally {
        setSaving(false);
      }
    }
    const addedIds = new Set(submitted.added.map((row) => row.id));
    const removed = new Set(submitted.removed);
    const updates = Object.entries(submitted.changes)
      .filter(([id]) => !addedIds.has(id) && !removed.has(id))
      .map(([id, patch]) => ({ id, patch }));
    setSaving(true);
    try {
      const result = await bulk({
        inserts: submitted.added.map(({ id, ...row }) => ({
          ...row,
          ...submitted.changes[id],
          ...(savedParent && { [savedParent.field]: savedParent.value }),
        })),
        updates,
        deletes: submitted.removed,
      });
      // Partial success: rows written leave the edits, rows that failed stay.
      const failedAdded = new Set(
        result.failed.flatMap((failure) => {
          const row =
            failure.op === 'insert' && failure.index !== undefined
              ? submitted.added[failure.index]
              : undefined;
          return row ? [row.id] : [];
        })
      );
      const failedIds = new Set(
        result.failed.flatMap((failure) =>
          failure.op !== 'insert' && failure.id !== undefined ? [failure.id] : []
        )
      );
      // What was written (submitted minus the failed rows) leaves the edits now;
      // failed rows and edits made during the save stay pending.
      const failed = (id: string) => failedAdded.has(id) || failedIds.has(id);
      const written: ChildRowEdits = {
        changes: Object.fromEntries(
          Object.entries(submitted.changes).filter(([id]) => !failed(id))
        ),
        added: submitted.added.filter((row) => !failed(row.id)),
        removed: submitted.removed.filter((id) => !failed(id)),
      };
      setLocal((current) =>
        hasChildEdits(written) ? rebaseChildEdits(current, written) : current
      );
      return result;
    } finally {
      setSaving(false);
    }
  };

  return {
    items,
    base,
    edits,
    pendingCount: countChildEdits(edits),
    hasEdits: hasChildEdits(edits),
    errors,
    add,
    update,
    remove,
    delete: deleteRows,
    discard,
    save,
    refresh: list.refresh,
    loading: hasRows && (list.loading || extensionsLoading),
    error: list.error ?? extensionsError,
    joined: key !== null,
    access,
    extensionFields: extensions.flatMap((ext) =>
      extensionFields(ext, viewerRole, 'edit')
    ),
  };
}
