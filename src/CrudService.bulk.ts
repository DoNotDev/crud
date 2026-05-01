// packages/features/crud/src/CrudService.bulk.ts

/**
 * @fileoverview CrudService bulk (transactional) orchestration
 * @description Service-layer implementation of `bulk()` — the single-round-trip,
 * atomic variant of add/update/delete. Mirrors the sequencing of
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
  DEFAULT_STATUS_VALUE,
  generateUUID,
  getI18nInstance,
  handleError,
  validateWithSchema,
} from '@donotdev/core';

import { updateListCaches } from './CrudService.cache';
import {
  assertCanAccess,
  ensureAdapter,
  getEntityName,
  getPiiFields,
  rateLimitKey,
  shouldShowSuccessToast,
  withResilience,
} from './CrudService.internal';
import { CRUD_OPERATION } from './types';
import type { CrudServiceInternal, MutationOptions } from './types';

/**
 * Bucketed schemas supplied by the hook layer.
 *
 * Split out from `OperationSchemas` so the service can accept either a full
 * schema pack (`useCrud`) or a hand-rolled one — whichever fits the caller.
 *
 * @since 0.2.0
 */
export interface BulkSchemas<T extends Record<string, unknown>> {
  /** Schema used to validate / encrypt inserted rows. Required when `inserts` is non-empty. */
  create?: dndevSchema<T>;
  /** Schema used to validate inserted rows when `status === 'draft'`. Optional. */
  draft?: dndevSchema<T>;
  /** Schema used to resolve PII fields for update patches. Optional — updates are partial. */
  update?: dndevSchema<T>;
}

/**
 * Tracks every optimistic op that was applied so failure can roll them back
 * atomically. Reverse order on revert (deletes → updates → inserts) mirrors
 * the single-row rollback flows in `*Impl`.
 */
interface BulkCacheLog<T extends Record<string, unknown>> {
  inserts: Array<{ tempId: string; data: T }>;
  updates: Array<{ id: string; prev: T | null; merged: T }>;
  deletes: Array<{ id: string; prev: T | null }>;
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
 * Transactional bulk CRUD: inserts + updates + deletes in one round-trip.
 *
 * Atomically applies optimistic state, calls the adapter under timeout + retry,
 * then either confirms all three buckets or rolls them back together. Emits a
 * single audit entry, a single rate-limit check, and at most one success toast.
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
 * @param schemas - Schemas for insert validation + PII resolution.
 * @param options - Optional mutation options (toast suppression).
 * @returns Server-echoed ids, order-preserved per bucket.
 * @throws {BulkCollisionError} Same id in two mutually-exclusive buckets.
 *   Surfaced **before** any side effect (no rate-limit, no optimistic, no adapter call).
 * @throws {Error} Wrapped adapter errors — surfaced after rollback.
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
 * @version 0.1.0
 * @since 0.2.0
 */
export async function bulkImpl<T extends Record<string, unknown>>(
  self: CrudServiceInternal,
  collection: string,
  ops: BulkOperations<T>,
  schemas: BulkSchemas<T>,
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
    return { insertedIds: [], updatedIds: [], deletedIds: [] };
  }

  // -------------------------------------------------------------------------
  // 3. Auto-initialize adapter + loading state. Match single-row mutations.
  // -------------------------------------------------------------------------
  await ensureAdapter(self);

  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  // -------------------------------------------------------------------------
  // 4. Access gate — server-side adapters are required for restricted-visibility
  //    entities. Check with the create schema (inserts) and update schema
  //    (updates); either surfaces the same restriction metadata.
  // -------------------------------------------------------------------------
  if (schemas.create) {
    assertCanAccess(self, collection, schemas.create);
  } else if (schemas.update) {
    assertCanAccess(self, collection, schemas.update);
  }

  // -------------------------------------------------------------------------
  // 5. Rate limit — ONE check for the whole batch (BULK_CRUD_TODO §5).
  // -------------------------------------------------------------------------
  if (self.security) {
    await self.security.checkRateLimit(rateLimitKey(self, collection), 'write');
  }

  // -------------------------------------------------------------------------
  // 6. PII encryption (per-op, matching add/update). Inserts use `create`
  //    schema's piiFields; updates use `update` schema's.
  // -------------------------------------------------------------------------
  const insertPiiFields = getPiiFields(schemas.create ?? schemas.draft);
  const updatePiiFields = getPiiFields(schemas.update ?? schemas.create);

  const encryptedInserts: CrudCreateInput<T>[] = inserts.map((row) => {
    const record = row as Record<string, unknown>;
    const withStatus =
      record.status === undefined || record.status === null
        ? { ...record, status: DEFAULT_STATUS_VALUE }
        : record;

    // Enforce draft contract: respect schemas, but make required fields nullish.
    // We validate per-row so mixed-status bulk payloads behave correctly.
    const status = withStatus.status as string | undefined;
    const isDraft = status === 'draft';
    const schemaToUse =
      isDraft && schemas.draft
        ? schemas.draft
        : (schemas.create ?? schemas.draft);

    const validated = schemaToUse
      ? validateWithSchema(schemaToUse, withStatus, 'CrudService.bulk.insert')
      : withStatus;

    const encrypted =
      insertPiiFields.length > 0 && self.security
        ? (self.security.encryptPii(
            validated,
            insertPiiFields
          ) as CrudCreateInput<T>)
        : (validated as CrudCreateInput<T>);
    return encrypted;
  });

  const encryptedUpdates = updates.map(({ id, patch }) => {
    const patchRecord = patch as Record<string, unknown>;
    const encrypted =
      updatePiiFields.length > 0 && self.security
        ? (self.security.encryptPii(patchRecord, updatePiiFields) as Partial<T>)
        : (patch as Partial<T>);
    return { id, patch: encrypted };
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

  // Snapshot previous data once for both updates and deletes.
  const touchedIds = [...updates.map((u) => u.id), ...deletes];
  const previousSnapshot = snapshotPreviousData<T>(
    self,
    collection,
    touchedIds
  );

  // Pre-mint temp ids for inserts (parallel array — server returns real ids).
  const insertTempIds = inserts.map(() => `temp_${generateUUID()}`);

  try {
    // 7a. Inserts — optimistic store + list cache.
    inserts.forEach((row, i) => {
      const tempId = insertTempIds[i]!;
      const tempItem = { ...(row as object), id: tempId } as unknown as T;
      if (self.store) {
        self.store.getState().addOptimistic(collection, tempId, tempItem);
      }
      updateListCaches(self, collection, tempId, tempItem, CRUD_OPERATION.ADD);
      cacheLog.inserts.push({ tempId, data: tempItem });
    });

    // 7b. Updates — optimistic store + list cache with merged patch.
    updates.forEach(({ id, patch }) => {
      const prev = previousSnapshot.get(id) ?? null;
      const merged = (prev ? { ...prev, ...patch } : { ...patch, id }) as T;
      if (self.store) {
        self.store
          .getState()
          .updateOptimistic(collection, id, merged, prev ?? null);
      }
      updateListCaches(self, collection, id, merged, CRUD_OPERATION.UPDATE);
      cacheLog.updates.push({ id, prev, merged });
    });

    // 7c. Deletes — optimistic store + list cache.
    deletes.forEach((id) => {
      const prev = previousSnapshot.get(id) ?? null;
      if (self.store && prev) {
        self.store.getState().deleteOptimistic(collection, id, prev);
      }
      updateListCaches(self, collection, id, null, CRUD_OPERATION.DELETE);
      cacheLog.deletes.push({ id, prev });
    });

    // ---------------------------------------------------------------------
    // 8. Adapter call — single await under withResilience (timeout + retry).
    //    Uses the create schema if available for server-side validation hints.
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
    const result = await withResilience(() =>
      adapter.bulk<T>(collection, payload)
    );

    // ---------------------------------------------------------------------
    // 9. Confirm — map temp ids to real ids, swap cache entries, clear
    //    optimistic flags for all three buckets.
    // ---------------------------------------------------------------------
    const realInsertedIds = result.insertedIds ?? [];
    insertTempIds.forEach((tempId, i) => {
      const realId = realInsertedIds[i];
      if (!realId) return;
      // Remove temp row, add real row (matches addImpl's cache swap).
      const row = inserts[i];
      updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
      updateListCaches(self, collection, realId, row as T, CRUD_OPERATION.ADD);
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
    // 11. Success toast — ONE, if any op succeeded and not suppressed.
    // ---------------------------------------------------------------------
    const anySucceeded =
      realInsertedIds.length +
        (result.updatedIds?.length ?? 0) +
        (result.deletedIds?.length ?? 0) >
      0;
    if (anySucceeded && shouldShowSuccessToast(self, options)) {
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
      updatedIds: result.updatedIds ?? [],
      deletedIds: result.deletedIds ?? [],
    };
  } catch (error) {
    // ---------------------------------------------------------------------
    // 12. Rollback — undo every optimistic op atomically. Runs in reverse
    //     order (deletes → updates → inserts) so cache reconciliation
    //     matches the single-row rollback flows.
    // ---------------------------------------------------------------------
    // Restore deleted items to cache + store.
    for (const { id, prev } of cacheLog.deletes) {
      if (prev) {
        updateListCaches(self, collection, id, prev, CRUD_OPERATION.ADD);
      }
      if (self.store) self.store.getState().rejectDelete(collection, id);
    }
    // Restore updated items (revert merged → prev).
    for (const { id, prev } of cacheLog.updates) {
      if (prev) {
        updateListCaches(self, collection, id, prev, CRUD_OPERATION.UPDATE);
      } else {
        // No snapshot (cold cache) — invalidate to force refetch on next read.
        void self.invalidateCollection(collection);
      }
      if (self.store) self.store.getState().rejectUpdate(collection, id);
    }
    // Remove inserted temp rows.
    for (const { tempId } of cacheLog.inserts) {
      updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
      if (self.store)
        self.store.getState().rejectOptimistic(collection, tempId);
    }

    // BulkCollisionError from the adapter passes through unwrapped so callers
    // can `instanceof` it. Other adapter errors get the standard wrap.
    if (error instanceof BulkCollisionError) {
      if (self.store) {
        self.store.getState().setError(collection, error);
      }
      throw error;
    }

    const wrappedError = handleError(error, {
      userMessage: `Failed to bulk-write ${collection}`,
      showNotification: true,
    });

    const i18n = getI18nInstance();
    const entityName = getEntityName(collection);
    toast(
      'error',
      i18n.t('messages.updateError', { ns: 'crud', entity: entityName })
    );

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}
