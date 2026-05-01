// packages/features/crud/src/CrudService.bulkAcross.ts

/**
 * @fileoverview CrudService cross-collection bulk (bulkAcross) orchestration
 * @description Service-layer implementation of `bulkAcross()` — an atomic
 * multi-collection write that applies one optimistic pass across all collections,
 * executes adapter writes in topological order (parallel within each wave), and
 * either confirms all or rolls back all. Emits a single audit entry, a single
 * rate-limit check, and at most one success toast.
 *
 * Mirrors the structure of {@link bulkImpl} but fans out across multiple
 * collections. See `docs/architecture/BULK_ACROSS.md` for the binding contract.
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */

import { toast } from '@donotdev/components';
import type {
  BulkAcrossBatch,
  BulkAcrossResult,
  CrudCreateInput,
} from '@donotdev/core';
import {
  BulkAcrossCycleError,
  BulkCollisionError,
  DEFAULT_STATUS_VALUE,
  detectBulkCollisions,
  generateUUID,
  getI18nInstance,
  handleError,
  validateWithSchema,
} from '@donotdev/core';

import { updateListCaches } from './CrudService.cache';
import {
  assertCanAccess,
  ensureAdapter,
  getPiiFields,
  rateLimitKey,
  shouldShowSuccessToast,
  withResilience,
} from './CrudService.internal';
import { CRUD_OPERATION } from './types';
import type { CrudServiceInternal, MutationOptions } from './types';

type AnyBatch = BulkAcrossBatch<Record<string, unknown>>;

/** Optimistic op log for one collection — used for atomic rollback. */
interface BatchCacheLog {
  insertTempIds: string[];
  inserts: Array<{ tempId: string; originalRow: Record<string, unknown> }>;
  updates: Array<{ id: string; prev: Record<string, unknown> | null }>;
  deletes: Array<{ id: string; prev: Record<string, unknown> | null }>;
}

/** Encrypted + validated payloads for one batch. */
interface PreparedBatch {
  batch: AnyBatch;
  encryptedInserts: Array<CrudCreateInput<Record<string, unknown>>>;
  encryptedUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
}

/** Snapshot previous data from TanStack caches for a set of ids. */
function snapshotData(
  self: CrudServiceInternal,
  collection: string,
  ids: string[]
): Map<string, Record<string, unknown> | null> {
  const queryClient = self.getQueryClient();
  const snapshot = new Map<string, Record<string, unknown> | null>();
  if (ids.length === 0) return snapshot;

  const lists = queryClient.getQueriesData<{
    items: Array<{ id: string } & Record<string, unknown>>;
  }>({ queryKey: ['crud', collection] });

  for (const id of ids) {
    const fromGet = queryClient.getQueryData<Record<string, unknown>>([
      'crud',
      collection,
      'get',
      id,
    ]);
    if (fromGet != null) {
      snapshot.set(id, fromGet);
      continue;
    }
    let found: Record<string, unknown> | null = null;
    for (const [, data] of lists) {
      const items =
        data && typeof data === 'object' && 'items' in data ? data.items : null;
      if (!items) continue;
      const hit = items.find((item) => item?.id === id);
      if (hit) {
        found = hit;
        break;
      }
    }
    snapshot.set(id, found);
  }
  return snapshot;
}

/**
 * Topological sort via Kahn's algorithm.
 * Returns execution waves: all batches in a wave run in parallel.
 * Throws {@link BulkAcrossCycleError} if `dependsOn` contains a cycle.
 */
function topologicalSort(batches: AnyBatch[]): AnyBatch[][] {
  const batchMap = new Map<string, AnyBatch>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const batch of batches) {
    batchMap.set(batch.collection, batch);
    inDegree.set(batch.collection, (batch.dependsOn ?? []).length);
    for (const dep of batch.dependsOn ?? []) {
      if (!adjList.has(dep)) adjList.set(dep, []);
      adjList.get(dep)!.push(batch.collection);
    }
  }

  const waves: AnyBatch[][] = [];
  let ready = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([col]) => col);

  while (ready.length > 0) {
    waves.push(ready.map((col) => batchMap.get(col)!));
    const next: string[] = [];
    for (const col of ready) {
      for (const dependent of adjList.get(col) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) next.push(dependent);
      }
    }
    ready = next;
  }

  const processed = waves.reduce((sum, w) => sum + w.length, 0);
  if (processed !== batches.length) {
    const cycle = [...inDegree.entries()]
      .filter(([, d]) => d > 0)
      .map(([c]) => c);
    throw new BulkAcrossCycleError(cycle);
  }

  return waves;
}

/**
 * Cross-collection atomic bulk write.
 *
 * One optimistic pass across all collections, adapter writes in topological
 * order, one toast. Any wave failure rolls back ALL collections' optimistic ops.
 *
 * @param self - CrudService instance.
 * @param batches - Per-collection operations. Each carries its own schemas.
 * @param options - Toast suppression.
 *
 * @throws {BulkCollisionError} Same id in two mutually-exclusive buckets within one batch.
 * @throws {BulkAcrossCycleError} `dependsOn` contains a cycle.
 * @throws {Error} Wrapped adapter errors after full rollback.
 *
 * @version 0.1.0
 * @since 0.3.0
 */
export async function bulkAcrossImpl(
  self: CrudServiceInternal,
  batches: AnyBatch[],
  options?: MutationOptions
): Promise<BulkAcrossResult> {
  // -------------------------------------------------------------------------
  // 1. Collision detection per batch — up front, no side effects.
  // -------------------------------------------------------------------------
  for (const batch of batches) {
    const collision = detectBulkCollisions({
      inserts: batch.inserts as Array<{ id?: string; [k: string]: unknown }>,
      updates: batch.updates,
      deletes: batch.deletes,
    });
    if (collision.where !== null) {
      throw new BulkCollisionError(collision.collisions, collision.where);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Filter empty batches; short-circuit if nothing to do.
  // -------------------------------------------------------------------------
  const nonEmpty = batches.filter(
    (b) =>
      (b.inserts?.length ?? 0) +
        (b.updates?.length ?? 0) +
        (b.deletes?.length ?? 0) >
      0
  );
  if (nonEmpty.length === 0) return { results: {} };

  // -------------------------------------------------------------------------
  // 3. Topological sort — throws BulkAcrossCycleError before any side effect.
  // -------------------------------------------------------------------------
  const waves = topologicalSort(nonEmpty);

  // -------------------------------------------------------------------------
  // 4. Adapter init + loading state per collection.
  // -------------------------------------------------------------------------
  await ensureAdapter(self);
  for (const batch of nonEmpty) {
    if (self.store) {
      self.store.getState().setLoading(batch.collection, true);
      self.store.getState().setError(batch.collection, null);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Access gate per batch.
  // -------------------------------------------------------------------------
  for (const batch of nonEmpty) {
    assertCanAccess(
      self,
      batch.collection,
      batch.schemas.create ?? batch.schemas.update
    );
  }

  // -------------------------------------------------------------------------
  // 6. Rate limit — ONE check for the whole cross-collection op.
  // -------------------------------------------------------------------------
  if (self.security) {
    await self.security.checkRateLimit(
      rateLimitKey(self, nonEmpty[0]!.collection),
      'write'
    );
  }

  // -------------------------------------------------------------------------
  // 7. PII encryption + validation per batch.
  // -------------------------------------------------------------------------
  const preparedBatches: PreparedBatch[] = nonEmpty.map((batch) => {
    const insertPiiFields = getPiiFields(
      batch.schemas.create ?? batch.schemas.draft
    );
    const updatePiiFields = getPiiFields(
      batch.schemas.update ?? batch.schemas.create
    );

    const encryptedInserts = (batch.inserts ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const withStatus =
        record.status == null
          ? { ...record, status: DEFAULT_STATUS_VALUE }
          : record;

      const isDraft = withStatus.status === 'draft';
      const schemaToUse =
        isDraft && batch.schemas.draft
          ? batch.schemas.draft
          : (batch.schemas.create ?? batch.schemas.draft);

      const validated = schemaToUse
        ? validateWithSchema(
            schemaToUse,
            withStatus,
            'CrudService.bulkAcross.insert'
          )
        : withStatus;

      return (
        insertPiiFields.length > 0 && self.security
          ? self.security.encryptPii(validated, insertPiiFields)
          : validated
      ) as CrudCreateInput<Record<string, unknown>>;
    });

    const encryptedUpdates = (batch.updates ?? []).map(({ id, patch }) => {
      const patchRecord = patch as Record<string, unknown>;
      return {
        id,
        patch: (
          updatePiiFields.length > 0 && self.security
            ? self.security.encryptPii(patchRecord, updatePiiFields)
            : patchRecord
        ) as Record<string, unknown>,
      };
    });

    return { batch, encryptedInserts, encryptedUpdates };
  });

  // -------------------------------------------------------------------------
  // 8. Optimistic apply — ALL collections atomically before any adapter call.
  // -------------------------------------------------------------------------
  const cacheLogsMap = new Map<string, BatchCacheLog>();

  try {
    for (const { batch, encryptedInserts, encryptedUpdates } of preparedBatches) {
      const { collection, deletes = [] } = batch;
      const insertTempIds = encryptedInserts.map(() => `temp_${generateUUID()}`);
      const touchedIds = [
        ...(batch.updates ?? []).map((u) => u.id),
        ...deletes,
      ];
      const previousSnapshot = snapshotData(self, collection, touchedIds);

      const log: BatchCacheLog = {
        insertTempIds,
        inserts: [],
        updates: [],
        deletes: [],
      };

      // 8a. Inserts
      encryptedInserts.forEach((row, i) => {
        const tempId = insertTempIds[i]!;
        const tempItem = { ...(row as object), id: tempId } as Record<
          string,
          unknown
        >;
        if (self.store) {
          self.store.getState().addOptimistic(collection, tempId, tempItem);
        }
        updateListCaches(self, collection, tempId, tempItem, CRUD_OPERATION.ADD);
        log.inserts.push({
          tempId,
          originalRow: row as Record<string, unknown>,
        });
      });

      // 8b. Updates
      encryptedUpdates.forEach(({ id, patch }) => {
        const prev = previousSnapshot.get(id) ?? null;
        const merged = (
          prev ? { ...prev, ...patch } : { ...patch, id }
        ) as Record<string, unknown>;
        if (self.store) {
          self.store.getState().updateOptimistic(collection, id, merged, prev);
        }
        updateListCaches(self, collection, id, merged, CRUD_OPERATION.UPDATE);
        log.updates.push({ id, prev });
      });

      // 8c. Deletes
      deletes.forEach((id) => {
        const prev = previousSnapshot.get(id) ?? null;
        if (self.store && prev) {
          self.store.getState().deleteOptimistic(collection, id, prev);
        }
        updateListCaches(self, collection, id, null, CRUD_OPERATION.DELETE);
        log.deletes.push({ id, prev });
      });

      cacheLogsMap.set(collection, log);
    }

    // -----------------------------------------------------------------------
    // 9. Adapter writes — in topological order; each wave runs in parallel.
    // -----------------------------------------------------------------------
    if (!self.adapter) {
      throw new Error('[dndev] Adapter not initialized for bulkAcross().');
    }
    const adapter = self.adapter;
    const results: Record<string, import('@donotdev/core').BulkResult> = {};

    for (const wave of waves) {
      const waveEntries = wave.map((waveBatch) =>
        preparedBatches.find((p) => p.batch.collection === waveBatch.collection)!
      );

      const waveResults = await Promise.all(
        waveEntries.map(({ batch, encryptedInserts, encryptedUpdates }) =>
          withResilience(() =>
            adapter.bulk(batch.collection, {
              inserts: encryptedInserts,
              updates: encryptedUpdates,
              deletes: batch.deletes,
            })
          ).then((result) => ({ collection: batch.collection, result }))
        )
      );

      for (const { collection, result } of waveResults) {
        results[collection] = result;
      }
    }

    // -----------------------------------------------------------------------
    // 10. Confirm — swap temp→real IDs per batch.
    // -----------------------------------------------------------------------
    for (const { batch, encryptedInserts } of preparedBatches) {
      const { collection } = batch;
      const result = results[collection];
      if (!result) continue;
      const log = cacheLogsMap.get(collection)!;

      const realInsertedIds = result.insertedIds ?? [];
      log.insertTempIds.forEach((tempId, i) => {
        const realId = realInsertedIds[i];
        if (!realId) return;
        const row = encryptedInserts[i];
        updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
        updateListCaches(
          self,
          collection,
          realId,
          row as Record<string, unknown>,
          CRUD_OPERATION.ADD
        );
        if (self.store) {
          self.store
            .getState()
            .confirmOptimistic(collection, tempId, realId, row);
        }
      });

      (result.updatedIds ?? []).forEach((id) => {
        if (self.store) self.store.getState().confirmUpdate(collection, id);
      });

      (result.deletedIds ?? []).forEach((id) => {
        if (self.store) self.store.getState().confirmDelete(collection, id);
      });
    }

    // -----------------------------------------------------------------------
    // 11. Audit — ONE entry with per-collection counts.
    // -----------------------------------------------------------------------
    if (self.security) {
      const metadata: Record<string, number> = {};
      for (const { batch } of preparedBatches) {
        metadata[`${batch.collection}_inserts`] = (batch.inserts ?? []).length;
        metadata[`${batch.collection}_updates`] = (batch.updates ?? []).length;
        metadata[`${batch.collection}_deletes`] = (batch.deletes ?? []).length;
      }
      self.security.audit({
        type: 'crud.bulk',
        collection: nonEmpty.map((b) => b.collection).join(','),
        userId: self.currentUserId ?? undefined,
        metadata,
      });
    }

    // -----------------------------------------------------------------------
    // 12. Success toast — ONE.
    // -----------------------------------------------------------------------
    const anySucceeded = Object.values(results).some(
      (r) =>
        (r.insertedIds?.length ?? 0) +
          (r.updatedIds?.length ?? 0) +
          (r.deletedIds?.length ?? 0) >
        0
    );
    if (anySucceeded && shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      toast(
        'success',
        i18n.t('messages.updateSuccess', { ns: 'crud', entity: '' })
      );
    }

    return { results };
  } catch (error) {
    // -----------------------------------------------------------------------
    // 13. Rollback — undo ALL optimistic ops atomically. Reverse order per
    //     collection: deletes → updates → inserts.
    // -----------------------------------------------------------------------
    for (const [collection, log] of cacheLogsMap) {
      for (const { id, prev } of log.deletes) {
        if (prev)
          updateListCaches(self, collection, id, prev, CRUD_OPERATION.ADD);
        if (self.store) self.store.getState().rejectDelete(collection, id);
      }
      for (const { id, prev } of log.updates) {
        if (prev) {
          updateListCaches(self, collection, id, prev, CRUD_OPERATION.UPDATE);
        } else {
          void self.invalidateCollection(collection);
        }
        if (self.store) self.store.getState().rejectUpdate(collection, id);
      }
      for (const { tempId } of log.inserts) {
        updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
        if (self.store)
          self.store.getState().rejectOptimistic(collection, tempId);
      }
    }

    // Unwrap collision/cycle errors so callers can instanceof them.
    if (
      error instanceof BulkCollisionError ||
      error instanceof BulkAcrossCycleError
    ) {
      for (const { batch } of preparedBatches) {
        if (self.store)
          self.store.getState().setError(batch.collection, error as Error);
      }
      throw error;
    }

    const wrappedError = handleError(error, {
      userMessage: 'Failed to save across collections',
      showNotification: true,
    });

    const i18n = getI18nInstance();
    toast('error', i18n.t('messages.updateError', { ns: 'crud', entity: '' }));

    for (const { batch } of preparedBatches) {
      if (self.store)
        self.store.getState().setError(batch.collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    for (const { batch } of preparedBatches) {
      if (self.store)
        self.store.getState().setLoading(batch.collection, false);
    }
  }
}
