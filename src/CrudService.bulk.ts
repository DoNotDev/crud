// packages/features/crud/src/CrudService.bulk.ts

/**
 * @fileoverview CrudService bulk orchestration
 * @description Service-layer implementation of `bulk()` — many rows of
 * add/update/delete in as few adapter round-trips as possible, with partial
 * success (rows that are written stay written; failures are reported per row
 * in `BulkResult.failed`). Mirrors the sequencing of
 * {@link addImpl} / {@link updateImpl} / {@link deleteImpl} but folds all three
 * buckets into one adapter call, one audit entry, one rate-limit check, and
 * one toast. See `BULK_CRUD_TODO.md` §1-§10 for the binding contract.
 *
 * Extracted into its own file to keep `CrudService.mutations.ts` below the
 * 500-LOC cap and to make the bulk control flow inspectable in isolation.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { toast } from '@donotdev/components';
import type {
  BulkOperations,
  BulkResult,
  CrudCreateInput,
  dndevSchema,
} from '@donotdev/core';
import {
  BulkCollisionError,
  detectBulkCollisions,
  DEFAULT_CRUD_TIMEOUT,
  generateUUID,
  getI18nInstance,
  handleError,
  prepareCreate,
  prepareUpdate,
  validateBulkOutcome,
  withTimeout,
} from '@donotdev/core';

import { updateGetCache } from './CrudService.cache';
import { createBulkReconciliation } from './CrudService.bulkReconciliation';
import {
  assertCanAccess,
  ensureAdapter,
  getEntityName,
  getPiiFields,
  rateLimitKey,
  shouldShowSuccessToast,
} from './CrudService.internal';
import { CRUD_OPERATION } from './types';
import { entitySchemasOf, storedRowsFor, writtenOf } from './CrudService.writeRules';
import type { CrudServiceInternal, MutationOptions } from './types';

/**
 * Schemas a caller may pass with a bulk (0.2 API). The CRUD rules run on the entity's
 * own schemas (`entitySchemasOf(collection)`), whatever is passed here.
 *
 * @version 0.4.0
 * @since 0.2.0
 */
export interface BulkSchemas<T extends Record<string, unknown>> {
  create?: dndevSchema<T>;
  draft?: dndevSchema<T>;
  update?: dndevSchema<T>;
}

/**
 * Tracks every optimistic op that was applied so the rows the adapter did not
 * write can be reverted. Reverse order on revert (deletes → updates → inserts) mirrors
 * the single-row rollback flows in `*Impl`.
 */
interface BulkCacheLog<T extends Record<string, unknown>> {
  inserts: Array<{ tempId: string; data: T }>;
  updates: Array<{ id: string; prev: T | null; merged: T }>;
  deletes: Array<{ id: string; prev: T | null }>;
}

/**
 * Detail row of an acknowledged insert: the written create payload plus its real id.
 * TypeScript cannot prove `Omit<T, 'id'> & { id: string }` is a generic `T` (`T['id']`
 * may be narrower than `string`), hence the one conversion; server-side defaults are
 * absent and come from the next refetch.
 */
function insertedRow<T extends Record<string, unknown>>(
  inserts: readonly CrudCreateInput<T>[],
  index: number,
  id: string
): T {
  const data = inserts[index];
  // Insert payloads and cache-log entries are built one-to-one from `ops.inserts`.
  if (data === undefined) throw new Error('Bulk insert payload missing');
  return { ...data, id } as unknown as T;
}

/**
 * Collect previous data snapshots from TanStack caches for all updated/deleted
 * ids in one pass. Falls back to list cache when the per-doc GET cache is cold.
 */
function snapshotPreviousData<T extends Record<string, unknown>>(
  self: CrudServiceInternal,
  collection: string,
  ids: string[]
): Map<string, T | null> {
  const queryClient = self.getQueryClient();
  const snapshot = new Map<string, T | null>();
  if (ids.length === 0) return snapshot;

  // One scan across every ['crud', collection, …] list cache.
  const lists = queryClient.getQueriesData<{
    items: Array<{ id: string } & Record<string, unknown>>;
  }>({ queryKey: ['crud', collection] });

  for (const id of ids) {
    const fromGet = queryClient.getQueryData<T>([
      'crud',
      collection,
      'get',
      id,
    ]);
    if (fromGet != null) {
      snapshot.set(id, fromGet);
      continue;
    }
    let found: T | null = null;
    for (const [, data] of lists) {
      const items =
        data && typeof data === 'object' && 'items' in data ? data.items : null;
      if (!items) continue;
      const hit = items.find((item) => item?.id === id);
      if (hit) {
        found = hit as T;
        break;
      }
    }
    snapshot.set(id, found);
  }

  return snapshot;
}

/**
 * Bulk CRUD: inserts + updates + deletes in one adapter call, partial success.
 *
 * Applies optimistic state, calls the adapter once under timeout (no replay), then
 * confirms the rows the adapter wrote and reverts only the rows it reports in
 * `failed` (written rows are never undone). A thrown or malformed acknowledgement
 * leaves commit status unknown: remove optimistic state and refetch; late raw
 * settlement triggers another authoritative refetch. Emits a single audit entry, a
 * single rate-limit check, and one toast (error when some rows failed).
 *
 * **Concurrency contract.** `bulk()` does not acquire the per-(collection,id)
 * locks used by single-row mutations (`runSerializedMutation`). A concurrent
 * single-row mutation on an id that also appears in this bulk runs in parallel
 * with the bulk and the last-write-wins at the adapter layer. Callers that
 * need strict ordering must coordinate at a higher level or route everything
 * through `bulk()`.
 *
 * @param self - CrudService instance (DI).
 * @param collection - Target collection.
 * @param ops - Bulk operations. Empty payload short-circuits with no side effects.
 * @param schemas - Write schemas: insert and update-patch validation + PII resolution.
 * @param options - Optional mutation options (toast suppression).
 * @returns Written ids per bucket (input order) and the rows that failed.
 * @throws {BulkCollisionError} Same id in two mutually-exclusive buckets.
 *   Surfaced **before** any side effect (no rate-limit, no optimistic, no adapter call).
 * @throws {DoNotDevError} `validation-failed`: an insert or update patch fails the CRUD rules
 *   schema, or a draft published misses a required field — before any optimistic state or write.
 * @throws {Error} Adapter/acknowledgement errors — surfaced after local cleanup and refetch.
 *
 * @example
 * ```typescript
 * await bulkImpl(service, 'events', {
 *   inserts: [{ title: 'A' }, { title: 'B' }],
 *   updates: [{ id: 'e1', patch: { title: 'renamed' } }],
 *   deletes: ['e2', 'e3'],
 * }, { create: createSchema, update: updateSchema });
 * // → one audit entry, one toast, one adapter round-trip
 * ```
 *
 * @version 0.2.0
 * @since 0.2.0
 */
export async function bulkImpl<T extends Record<string, unknown>>(
  self: CrudServiceInternal,
  collection: string,
  ops: BulkOperations<T>,
  _schemas: BulkSchemas<T>,
  options?: MutationOptions
): Promise<BulkResult> {
  // -------------------------------------------------------------------------
  // 1. Collision detection — up front, before any side effect.
  //    BulkCollisionError surfaces unwrapped so consumers can `instanceof` it.
  // -------------------------------------------------------------------------
  const collision = detectBulkCollisions({
    inserts: ops.inserts as Array<{ id?: string; [k: string]: unknown }>,
    updates: ops.updates,
    deletes: ops.deletes,
  });
  if (collision.where !== null) {
    throw new BulkCollisionError(collision.collisions, collision.where);
  }

  const inserts = ops.inserts ?? [];
  const updates = ops.updates ?? [];
  const deletes = ops.deletes ?? [];

  // -------------------------------------------------------------------------
  // 2. Empty short-circuit — zero wire contact, zero store mutation, zero
  //    audit, zero toast, zero rate-limit. Contract BULK_CRUD_TODO §8.
  // -------------------------------------------------------------------------
  if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
    return { insertedIds: [], updatedIds: [], deletedIds: [], failed: [] };
  }

  // -------------------------------------------------------------------------
  // 3. Auto-initialize adapter + loading state. Match single-row mutations.
  // -------------------------------------------------------------------------
  await ensureAdapter(self);

  // -------------------------------------------------------------------------
  // 4. CRUD rules (core/schemas crud/, as on the server) on each row: inserts by
  //    `prepareCreate`, updates by `prepareUpdate` on their stored row (cache,
  //    else read). Then the access gate with each row's schema.
  // -------------------------------------------------------------------------
  const schemas = entitySchemasOf(collection);
  const touchedIds = [...updates.map((u) => u.id), ...deletes];
  const previousSnapshot = snapshotPreviousData<T>(
    self,
    collection,
    touchedIds
  );
  const updateRows = updates.map(({ id, patch }) => ({
    id,
    patch: patch as Record<string, unknown>,
  }));
  const storedRows = await storedRowsFor(self, collection, updateRows, schemas.get);
  const preparedInserts = inserts.map((row) =>
    prepareCreate(schemas, row as Record<string, unknown>)
  );
  const preparedUpdates = updateRows.map(({ id, patch }) =>
    prepareUpdate(schemas, { id, patch, stored: storedRows.get(id) })
  );
  const accessSchemas = new Set<dndevSchema<unknown>>(
    [...preparedInserts, ...preparedUpdates].map((prepared) => schemas[prepared.schemaKey])
  );
  // Deletes only: any schema of the entity carries its visibility metadata.
  if (accessSchemas.size === 0) accessSchemas.add(schemas.update);
  for (const schema of accessSchemas) assertCanAccess(self.adapter, collection, schema);

  // -------------------------------------------------------------------------
  // 5. Rate limit — ONE check for the whole batch (BULK_CRUD_TODO §5).
  // -------------------------------------------------------------------------
  if (self.security) {
    await self.security.checkRateLimit(rateLimitKey(self, collection), 'write');
  }

  // -------------------------------------------------------------------------
  // 6. What is written (the rules' `written`) + PII encryption per row.
  // -------------------------------------------------------------------------
  const encryptedInserts: CrudCreateInput<T>[] = preparedInserts.map((prepared, index) => {
    const written = writtenOf(prepared, collection, 'bulk.insert');
    // A caller id is a pre-minted id: the rules never write `id`.
    const clientId = (inserts[index] as Record<string, unknown>).id;
    const row = typeof clientId === 'string' ? { ...written, id: clientId } : written;
    const insertPiiFields = getPiiFields(schemas[prepared.schemaKey]);
    return (
      insertPiiFields.length > 0 && self.security
        ? self.security.encryptPii(row, insertPiiFields)
        : row
    ) as CrudCreateInput<T>;
  });

  const encryptedUpdates = preparedUpdates.map((prepared, index) => {
    const patchRecord = writtenOf(prepared, collection, 'bulk.update');
    const updatePiiFields = getPiiFields(schemas[prepared.schemaKey]);
    const encrypted = (
      updatePiiFields.length > 0 && self.security
        ? self.security.encryptPii(patchRecord, updatePiiFields)
        : patchRecord
    ) as Partial<T>;
    return { id: updates[index]!.id, patch: encrypted };
  });

  // -------------------------------------------------------------------------
  // 7. Optimistic store + cache apply. Atomic within the local store:
  //    we record every applied op in `rollback` so a failure reverts all three
  //    buckets in one pass.
  // -------------------------------------------------------------------------
  const cacheLog: BulkCacheLog<T> = {
    inserts: [],
    updates: [],
    deletes: [],
  };


  // Pre-mint temp ids for inserts (parallel array — server returns real ids).
  const insertTempIds = inserts.map(() => `temp_${generateUUID()}`);

  // Undo one optimistic op (a row the adapter did not write, or the whole batch on throw).
  const revertInsert = (tempId: string) => {
    try { updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE); } catch { /* continue cleanup */ }
    try { self.store?.getState().rejectOptimistic(collection, tempId); } catch { /* continue cleanup */ }
  };
  let startedWrite: Promise<BulkResult> | undefined;
  let committedResult: BulkResult | undefined;
  let acknowledgedReconciled = false;
  const settledInserts = new Set<string>();
  const settledUpdates = new Set<string>();
  const settledDeletes = new Set<string>();
  const attempt = { settled: false, late: false };
  const reconcile = createBulkReconciliation(self, 'bulk.lateReconciliation');
  const onLateSettlement = () => { void reconcile(collection); };
  const revertUpdate = (id: string, prev: T | null) => {
    try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue cleanup */ }
    try { self.store?.getState().rejectUpdate(collection, id); } catch { /* continue cleanup */ }
  };
  const revertDelete = (id: string, prev: T | null) => {
    try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue cleanup */ }
    try { self.store?.getState().rejectDelete(collection, id); } catch { /* continue cleanup */ }
  };

  try {
    if (self.store) {
      self.store.getState().setLoading(collection, true);
      self.store.getState().setError(collection, null);
    }
    // 7a. Inserts — store only; do not invent membership in filtered lists.
    inserts.forEach((row, i) => {
      const tempId = insertTempIds[i]!;
      const tempItem = { ...(row as object), id: tempId } as unknown as T;
      cacheLog.inserts.push({ tempId, data: tempItem });
      if (self.store) self.store.getState().addOptimistic(collection, tempId, tempItem);
    });

    // 7b. Updates — optimistic store + list cache with merged patch.
    const stagedUpdates = new Map<string, T>();
    updates.forEach(({ id, patch }) => {
      const prev = previousSnapshot.get(id) ?? null;
      const base = stagedUpdates.get(id) ?? prev;
      const merged = (base ? { ...base, ...patch } : { ...patch, id }) as T;
      stagedUpdates.set(id, merged);
      const existingLog = cacheLog.updates.find((entry) => entry.id === id);
      if (existingLog) existingLog.merged = merged;
      else cacheLog.updates.push({ id, prev, merged });
      if (self.store) self.store.getState().updateOptimistic(collection, id, merged, prev ?? null);
      if (prev) updateGetCache(self, collection, id, merged, CRUD_OPERATION.UPDATE);
    });

    // 7c. Deletes — optimistic store + list cache.
    [...new Set(deletes)].forEach((id) => {
      const prev = previousSnapshot.get(id) ?? null;
      cacheLog.deletes.push({ id, prev });
      if (self.store && prev) self.store.getState().deleteOptimistic(collection, id, prev);
      if (prev) updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE);
    });

    // ---------------------------------------------------------------------
    // 8. Adapter call — timeout without retry: a lost ack may already be committed.
    // ---------------------------------------------------------------------
    if (!self.adapter) {
      throw new Error(
        `[dndev] Adapter not initialized for "${collection}" bulk().`
      );
    }
    const adapter = self.adapter;
    const payload: BulkOperations<T> = {
      inserts: encryptedInserts,
      updates: encryptedUpdates,
      deletes,
    };
    startedWrite = Promise.resolve().then(() =>
      adapter.bulk<T>(collection, payload)
    );
    const settled = () => {
      attempt.settled = true;
      if (attempt.late) onLateSettlement();
    };
    void startedWrite.then(settled, settled);
    let acknowledgement: BulkResult;
    try {
      acknowledgement = await withTimeout(startedWrite, DEFAULT_CRUD_TIMEOUT);
    } finally {
      if (!attempt.settled) attempt.late = true;
    }
    // Validate completeness BEFORE any confirmation, success toast or audit.
    const result = validateBulkOutcome(payload, acknowledgement);
    committedResult = result;

    // ---------------------------------------------------------------------
    // 9. Partial success — confirm the rows the adapter wrote, revert only
    //    the rows it reports in `failed` (written rows are never undone).
    // ---------------------------------------------------------------------
    const failedInserts = new Set(
      result.failed
        .filter((f) => f.op === 'insert' && f.index !== undefined)
        .map((f) => f.index!)
    );
    const failedUpdates = new Set(
      result.failed.filter((f) => f.op === 'update').map((f) => f.id)
    );
    const failedDeletes = new Set(
      result.failed.filter((f) => f.op === 'delete').map((f) => f.id)
    );

    // insertedIds lists the inserts that succeeded, in input order
    const realInsertedIds = result.insertedIds;
    const successfulInsertRows = new Map<string, T>();
    let nextInserted = 0;
    insertTempIds.forEach((tempId, i) => {
      if (failedInserts.has(i)) {
        revertInsert(tempId);
        settledInserts.add(tempId);
        return;
      }
      const realId = realInsertedIds[nextInserted++];
      // Request-aware validation proved this ordered success exists.
      if (realId === undefined) throw new Error('Validated bulk insert ID missing');
      // Replace only detail data; list membership/order/count comes from reconciliation.
      const row = insertedRow<T>(encryptedInserts, i, realId);
      successfulInsertRows.set(realId, row);
      updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE);
      updateGetCache(self, collection, realId, row, CRUD_OPERATION.ADD);
      if (self.store) {
        self.store
          .getState()
          .confirmOptimistic(collection, tempId, realId, row);
      }
      settledInserts.add(tempId);
    });

    for (const { id, prev } of cacheLog.updates) {
      if (failedUpdates.has(id)) revertUpdate(id, prev);
      else if (self.store) self.store.getState().confirmUpdate(collection, id);
      settledUpdates.add(id);
    }

    for (const { id, prev } of cacheLog.deletes) {
      if (failedDeletes.has(id)) {
        // A prior successful insert for this ID is the actual final row, not
        // the pre-write snapshot captured before the insert.
        const insertedRow = successfulInsertRows.get(id);
        if (insertedRow) {
          try { updateGetCache(self, collection, id, insertedRow, CRUD_OPERATION.SET); } catch { /* recovery/refetch below */ }
          try { self.store?.getState().rejectDelete(collection, id); } catch { /* continue */ }
        } else revertDelete(id, prev);
      }
      else {
        updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE);
        if (self.store) self.store.getState().confirmDelete(collection, id);
      }
      settledDeletes.add(id);
    }

    await reconcile(collection);
    acknowledgedReconciled = true;

    // ---------------------------------------------------------------------
    // 10. Audit — ONE entry with counts (BULK_CRUD_TODO §4).
    //     Anomaly on `bulk.deletes` fires on the BULK count, not row count.
    // ---------------------------------------------------------------------
    if (self.security) {
      self.security.audit({
        type: 'crud.bulk',
        collection,
        userId: self.currentUserId ?? undefined,
        metadata: {
          inserts: inserts.length,
          updates: updates.length,
          deletes: deletes.length,
        },
      });
      if (deletes.length > 0) {
        self.security.recordAnomaly?.(
          'bulk.deletes',
          self.currentUserId ?? undefined
        );
      }
    }

    // ---------------------------------------------------------------------
    // 11. Toast — ONE: error when some rows failed (the caller lists them
    //     from `failed`), else success if any op succeeded and not suppressed.
    // ---------------------------------------------------------------------
    const anySucceeded =
      realInsertedIds.length +
        result.updatedIds.length +
        result.deletedIds.length >
      0;
    if (result.failed.length > 0) {
      const i18n = getI18nInstance();
      toast(
        'error',
        i18n.t('messages.bulkPartialError', {
          ns: 'crud',
          count: result.failed.length,
        })
      );
    } else if (anySucceeded && shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.updateSuccess', {
          ns: 'crud',
          entity: entityName,
        })
      );
    }

    return {
      insertedIds: realInsertedIds,
      updatedIds: result.updatedIds,
      deletedIds: result.deletedIds,
      failed: result.failed,
    };
  } catch (error) {
    if (committedResult) {
      // A cache or store callback may interrupt confirmation. Settle every
      // remaining entry independently according to the acknowledged outcome.
      const failedInsertIndexes = new Set(committedResult.failed.filter((f) => f.op === 'insert').map((f) => f.index));
      const failedUpdateIds = new Set(committedResult.failed.filter((f) => f.op === 'update').map((f) => f.id));
      const failedDeleteIds = new Set(committedResult.failed.filter((f) => f.op === 'delete').map((f) => f.id));
      let successIndex = 0;
      cacheLog.inserts.forEach(({ tempId }, index) => {
        const failed = failedInsertIndexes.has(index);
        const realId = failed ? undefined : committedResult!.insertedIds[successIndex++];
        if (settledInserts.has(tempId)) return;
        try {
          if (failed) self.store?.getState().rejectOptimistic(collection, tempId);
          else self.store?.getState().confirmOptimistic(collection, tempId, realId!, inserts[index]);
        } catch { /* continue settling remaining entries */ }
      });
      for (const { id } of cacheLog.updates) {
        if (settledUpdates.has(id)) continue;
        try { if (failedUpdateIds.has(id)) self.store?.getState().rejectUpdate(collection, id); else self.store?.getState().confirmUpdate(collection, id); } catch { /* continue */ }
      }
      for (const { id } of cacheLog.deletes) {
        if (settledDeletes.has(id)) continue;
        try { if (failedDeleteIds.has(id)) self.store?.getState().rejectDelete(collection, id); else self.store?.getState().confirmDelete(collection, id); } catch { /* continue */ }
      }
      // Re-apply the acknowledged final detail state after an interrupted
      // confirmation. Lists remain coordinator-owned; unknown server fields
      // are supplied by active refetch rather than fabricated here.
      const successfulInsertRows = new Map<string, T>();
      let insertSuccess = 0;
      cacheLog.inserts.forEach(({ tempId }, index) => {
        if (failedInsertIndexes.has(index)) return;
        const id = committedResult!.insertedIds[insertSuccess++];
        if (id !== undefined) successfulInsertRows.set(id, insertedRow<T>(encryptedInserts, index, id));
        try { updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE); } catch { /* continue */ }
      });
      for (const { id, prev } of cacheLog.updates) {
        if (failedUpdateIds.has(id)) try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue */ }
      }
      for (const { id, prev } of cacheLog.deletes) {
        try {
          if (!failedDeleteIds.has(id)) updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE);
          else if (successfulInsertRows.has(id)) updateGetCache(self, collection, id, successfulInsertRows.get(id)!, CRUD_OPERATION.SET);
          else if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET);
        } catch { /* continue settling details */ }
      }
      for (const [id, row] of successfulInsertRows) {
        if (!cacheLog.deletes.some((entry) => entry.id === id && !failedDeleteIds.has(id))) {
          try { updateGetCache(self, collection, id, row, CRUD_OPERATION.SET); } catch { /* continue settling details */ }
        }
      }
      try { handleError(new Error('Bulk post-commit side effect failed'), { context: { operation: 'bulk.postCommit' }, showNotification: false }); } catch { /* diagnostics are best effort */ }
      if (!acknowledgedReconciled) await reconcile(collection);
      return committedResult;
    }
    // ---------------------------------------------------------------------
    // 12. Unknown outcome — undo local optimistic state, not database writes.
    //     Reverse order (deletes → updates → inserts) so cache
    //     reconciliation matches the single-row rollback flows.
    // ---------------------------------------------------------------------
    for (const { id, prev } of [...cacheLog.deletes].reverse()) {
      try { revertDelete(id, prev); } catch { /* continue rolling back all operations */ }
    }
    for (const { id, prev } of [...cacheLog.updates].reverse()) {
      try { revertUpdate(id, prev); } catch { /* continue rolling back all operations */ }
    }
    for (const { tempId } of [...cacheLog.inserts].reverse()) {
      try { revertInsert(tempId); } catch { /* continue rolling back all operations */ }
    }

    if (startedWrite) {
      // Queue late reconciliation behind this initial refetch. A timeout does
      // not cancel the raw write; never wait for it or replay it here.
      await reconcile(collection);
    }

    // BulkCollisionError from the adapter passes through unwrapped so callers
    // can `instanceof` it. Other adapter errors get the standard wrap.
    if (error instanceof BulkCollisionError) {
      try { self.store?.getState().setError(collection, error); } catch { /* subscribers must not replace the original error */ }
      throw error;
    }

    let wrappedError: unknown = error;
    try {
      wrappedError = handleError(error, {
        userMessage: `Failed to bulk-write ${collection}`,
        showNotification: true,
      });
    } catch { /* preserve the write error */ }

    try {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast('error', i18n.t('messages.updateError', { ns: 'crud', entity: entityName }));
    } catch { /* preserve the write error */ }

    try { self.store?.getState().setError(collection, wrappedError as Error); } catch { /* subscribers must not replace the write error */ }

    throw wrappedError;
  } finally {
    if (self.store) {
      try { self.store.getState().setLoading(collection, false); } catch {
        try { handleError(new Error('Bulk loading cleanup failed'), { context: { operation: 'bulk.cleanup' }, showNotification: false }); } catch { /* diagnostics are best effort */ }
      }
    }
  }
}
