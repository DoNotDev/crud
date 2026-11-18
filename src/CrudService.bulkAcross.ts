// packages/features/crud/src/CrudService.bulkAcross.ts

/**
 * @fileoverview CrudService cross-collection bulk (bulkAcross) orchestration
 * @description Service-layer implementation of `bulkAcross()` — a
 * multi-collection write that applies one optimistic pass across all collections,
 * executes adapter writes in topological order (parallel within each wave), and
 * confirms all, or stops at the first wave with rows not written (adapters
 * report per-row failures; rows already written stay written, caches refetch). Emits a single audit entry, a single
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
  BulkAcrossOptions,
  BulkAcrossResult,
  AtomicBulkExecutionPlan,
  CrudCreateInput,
  PreparedAtomicBatch,
  OperationSchemas,
  PreparedWrite,
} from '@donotdev/core';
import {
  AtomicBulkError,
  BulkAcrossCycleError,
  BulkCollisionError,
  DEFAULT_CRUD_TIMEOUT,
  detectBulkCollisions,
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
  getPiiFields,
  rateLimitKey,
  getEntityName,
  shouldShowSuccessToast,
} from './CrudService.internal';
import { CRUD_OPERATION } from './types';
import type { CrudServiceInternal } from './types';
import { entitySchemasOf, storedRowsFor, writtenOf } from './CrudService.writeRules';

type AnyBatch = BulkAcrossBatch<Record<string, unknown>>;

function validateAtomicPlan(plan: unknown): asserts plan is void | AtomicBulkExecutionPlan {
  if (plan !== undefined && (plan === null || typeof plan !== 'object' || typeof (plan as Record<string, unknown>).execute !== 'function')) {
    throw new AtomicBulkError('Invalid atomic execution plan', 'not-committed');
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function cloneAtomicOperations<T>(value: T): T {
  const seen = new Set<object>();
  const check = (item: unknown): void => {
    if (item === null || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item instanceof Date) return;
    if (!Array.isArray(item) && !plainObject(item)) {
      throw new Error('Unsupported atomic request value');
    }
    for (const nested of Object.values(item)) check(nested);
  };
  check(value);
  return structuredClone(value);
}

function cloneSchemaMetadata<T>(value: T, seen = new WeakMap<object, object>()): T {
  if (value === null || typeof value !== 'object') return value;
  const existing = seen.get(value);
  if (existing) return existing as T;
  if (value instanceof Date) return new Date(value) as T;
  if (!Array.isArray(value) && !plainObject(value)) throw new Error('Unsupported schema metadata');
  const copy: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, nested] of Object.entries(value)) {
    Object.defineProperty(copy, key, { value: cloneSchemaMetadata(nested, seen), enumerable: true, writable: true, configurable: true });
  }
  return copy as T;
}

function validateAtomicStructure(input: unknown): asserts input is AnyBatch[] {
  const invalid = (): never => { throw new AtomicBulkError('Invalid atomic request structure', 'not-committed'); };
  if (!Array.isArray(input)) invalid();
  for (const batch of input as unknown[]) {
    if (!plainObject(batch) || typeof batch.collection !== 'string' || !batch.collection || !plainObject(batch.schemas)) invalid();
    const record = batch as Record<string, unknown>;
    const schemas = record.schemas as Record<string, unknown>;
    for (const key of ['create', 'draft', 'update']) {
      if (Object.hasOwn(schemas, key)) {
        const schema = schemas[key];
        if (!schema || typeof schema !== 'object' || (schema as Record<string, unknown>).kind !== 'schema' || typeof (schema as Record<string, unknown>)['~run'] !== 'function' || !plainObject((schema as Record<string, unknown>).metadata)) invalid();
      }
    }
    for (const key of ['inserts', 'updates', 'deletes', 'dependsOn']) {
      if (Object.hasOwn(record, key) && !Array.isArray(record[key])) invalid();
    }
    for (const row of (record.inserts as unknown[] | undefined) ?? []) if (!plainObject(row)) invalid();
    for (const update of (record.updates as unknown[] | undefined) ?? []) {
      if (!plainObject(update) || typeof update.id !== 'string' || !plainObject(update.patch)) invalid();
      const { storedStatus } = update as Record<string, unknown>;
      if (storedStatus !== undefined && storedStatus !== null && typeof storedStatus !== 'string') invalid();
    }
    for (const key of ['deletes', 'dependsOn']) {
      for (const value of (record[key] as unknown[] | undefined) ?? []) if (typeof value !== 'string' || !value) invalid();
    }
  }
}

/** Optimistic op log for one collection — never a database rollback log. */
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

/** The CRUD rule result of each insert / update of a batch (core/schemas crud/). */
interface PreparedRows {
  inserts: PreparedWrite[];
  updates: PreparedWrite[];
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
 * Cross-collection bulk write.
 *
 * One optimistic pass across all collections, adapter writes in topological
 * order, one toast. A wave that throws or reports rows not written stops the
 * chain: optimistic ops are rolled back and the collections refetched (rows
 * already written by any started batch stay written). Bounded resilient outcomes
 * settle before rollback and invalidation. Raw attempts are not cancelled: late
 * settlement triggers another authoritative invalidation, never stale patches.
 * Every row goes through the CRUD rules before any write (`prepareCreate` /
 * `prepareUpdate`, core/schemas crud/, as on the server); unknown fields warn the user.
 *
 * @param self - CrudService instance.
 * @param batches - Per-collection operations. Each carries its own schemas.
 * @param options - Toast suppression / message (`successMessage`), execution mode.
 *
 * @throws {BulkCollisionError} Same id in two mutually-exclusive buckets within one batch.
 * @throws {BulkAcrossCycleError} `dependsOn` contains a cycle.
 * @throws {DoNotDevError} `validation-failed`: a row or patch fails the CRUD rules.
 * @throws {Error} Wrapped adapter errors after settlement and optimistic rollback.
 *
 * @version 0.2.0
 * @since 0.3.0
 */
export async function bulkAcrossImpl(
  self: CrudServiceInternal,
  batches: AnyBatch[],
  options?: BulkAcrossOptions
): Promise<BulkAcrossResult> {
  if (options?.execution !== undefined && options.execution !== 'atomic' && options.execution !== 'legacy') {
    throw new AtomicBulkError('Invalid bulk execution mode', 'not-committed');
  }
  const atomic = options?.execution === 'atomic';
  if (atomic) {
    validateAtomicStructure(batches);
    try {
      batches = batches.map((batch) => ({
        collection: batch.collection,
        schemas: Object.fromEntries(Object.entries(batch.schemas).map(([key, schema]) => {
          if (!schema) return [key, schema];
          // Validation functions and their app-defined schema tree remain intact; dynamic
          // mutation of validation definitions after submission is unsupported. Security
          // metadata and the visibility decision must instead be detached before await.
          const snapshot = { ...schema, metadata: cloneSchemaMetadata(schema.metadata) };
          return [key, snapshot];
        })) as AnyBatch['schemas'],
        inserts: batch.inserts === undefined ? undefined : cloneAtomicOperations(batch.inserts),
        updates: batch.updates === undefined ? undefined : cloneAtomicOperations(batch.updates),
        deletes: batch.deletes === undefined ? undefined : [...batch.deletes],
        dependsOn: batch.dependsOn === undefined ? undefined : [...batch.dependsOn],
      }));
      options = options && { ...options };
    } catch (error) {
      throw new AtomicBulkError('Invalid atomic request values', 'not-committed', error);
    }
    await ensureAdapter(self);
  }
  const capability = atomic ? self.adapter?.atomicBulkAcross : undefined;
  if (atomic && !capability) {
    throw new AtomicBulkError('Atomic bulk execution is not supported by this adapter', 'not-committed');
  }
  if (atomic) {
    const collections = new Set<string>();
    for (const batch of batches) {
      if (!batch.collection || collections.has(batch.collection)) {
        throw new AtomicBulkError('Invalid or duplicate collection', 'not-committed');
      }
      collections.add(batch.collection);
      const ids = new Set<string>();
      const add = (id: unknown) => {
        if (typeof id !== 'string' || !id || ids.has(id)) {
          throw new AtomicBulkError('Invalid or duplicate document target', 'not-committed');
        }
        ids.add(id);
      };
      for (const row of batch.inserts ?? []) {
        if ('id' in row) add(row.id);
      }
      for (const update of batch.updates ?? []) {
        add(update.id);
        if ('id' in update.patch) throw new AtomicBulkError('Update patch cannot change identity', 'not-committed');
      }
      for (const id of batch.deletes ?? []) add(id);
    }
    for (const batch of batches) {
      for (const dep of batch.dependsOn ?? []) {
        if (!collections.has(dep)) throw new AtomicBulkError('Unknown dependency', 'not-committed');
      }
    }
    topologicalSort(batches);
  }
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
  if (nonEmpty.length === 0) {
    if (capability) {
      try { validateAtomicPlan(await capability.preflight(batches.map((batch) => ({ collection: batch.collection, inserts: [], updates: [], deletes: [] })))); } catch (error) {
        throw error instanceof AtomicBulkError ? error : new AtomicBulkError('Atomic preflight failed', 'not-committed', error);
      }
    }
    return { results: {} };
  }

  // -------------------------------------------------------------------------
  // 3. Topological sort — throws BulkAcrossCycleError before any side effect.
  // -------------------------------------------------------------------------
  const waves = topologicalSort(atomic ? batches : nonEmpty).map((wave) => wave.filter((batch) => nonEmpty.includes(batch))).filter((wave) => wave.length > 0);

  // -------------------------------------------------------------------------
  // 4. Adapter init + loading state per collection.
  // -------------------------------------------------------------------------
  if (!atomic) await ensureAdapter(self);

  // -------------------------------------------------------------------------
  // 5. CRUD rules (core/schemas crud/, as on the server) on each row: inserts by
  //    `prepareCreate`, updates by `prepareUpdate` on their stored row (the
  //    caller's, else the cache, else one read). Then the access gate per batch
  //    with each row's schema.
  // -------------------------------------------------------------------------
  const preparedRows = new Map<AnyBatch, PreparedRows>();
  const ruleSchemas = new Map<AnyBatch, OperationSchemas>();
  for (const batch of nonEmpty) {
    const updateRows = (batch.updates ?? []).map(({ id, patch, stored }) => ({
      id,
      patch: patch as Record<string, unknown>,
      stored,
    }));
    // The CRUD rules run on the entity's own schemas, whatever the batch passes.
    const schemas = entitySchemasOf(batch.collection);
    ruleSchemas.set(batch, schemas);
    const storedRows = await storedRowsFor(self, batch.collection, updateRows, schemas.get);
    preparedRows.set(batch, {
      inserts: (batch.inserts ?? []).map((row) => prepareCreate(schemas, row as Record<string, unknown>)),
      updates: updateRows.map(({ id, patch }) => prepareUpdate(schemas, { id, patch, stored: storedRows.get(id) })),
    });
  }
  for (const batch of nonEmpty) {
    const { inserts, updates } = preparedRows.get(batch)!;
    const schemas = ruleSchemas.get(batch)!;
    const gated = new Set([...inserts, ...updates].map((prepared) => schemas[prepared.schemaKey]));
    // Deletes only: any schema of the entity carries its visibility metadata.
    const targets = gated.size > 0 ? [...gated] : [schemas.update];
    for (const schema of targets) assertCanAccess(self.adapter, batch.collection, schema);
  }

  // -------------------------------------------------------------------------
  // 6. Rate limit — ONE check for the whole cross-collection op.
  // -------------------------------------------------------------------------
  if (!atomic && self.security) {
    await self.security.checkRateLimit(
      rateLimitKey(self, nonEmpty[0]!.collection),
      'write'
    );
  }

  // -------------------------------------------------------------------------
  // 7. PII encryption + validation per batch.
  // -------------------------------------------------------------------------
  const preparedBatches: PreparedBatch[] = nonEmpty.map((batch) => {
    const prepared = preparedRows.get(batch)!;
    const encryptedInserts = prepared.inserts.map((result, index) => {
      const written = writtenOf(result, batch.collection, 'bulkAcross.insert');
      // A caller-provided id is the pre-minted id other batches reference (BULK_ACROSS.md
      // "Pre-Minted IDs"); the rules never write `id`, so it is restored.
      const clientId = (batch.inserts![index] as Record<string, unknown>).id;
      const withId =
        typeof clientId === 'string' ? { ...written, id: clientId } : atomic ? { ...written, id: generateUUID() } : written;
      const rowPiiFields = getPiiFields(ruleSchemas.get(batch)![result.schemaKey]);
      return (
        rowPiiFields.length > 0 && self.security
          ? self.security.encryptPii(withId, rowPiiFields)
          : withId
      ) as CrudCreateInput<Record<string, unknown>>;
    });

    const encryptedUpdates = prepared.updates.map((result, index) => {
      const patchRecord = writtenOf(result, batch.collection, 'bulkAcross.update');
      const updatePiiFields = getPiiFields(ruleSchemas.get(batch)![result.schemaKey]);
      return {
        id: batch.updates![index]!.id,
        patch: (updatePiiFields.length > 0 && self.security
          ? self.security.encryptPii(patchRecord, updatePiiFields)
          : patchRecord),
      };
    });

    return { batch, encryptedInserts, encryptedUpdates };
  });

  const atomicBatches: PreparedAtomicBatch[] = (atomic ? topologicalSort(batches).flat() : waves.flat()).map((batch) => {
    const prepared = preparedBatches.find((entry) => entry.batch === batch);
    return {
      collection: batch.collection,
      inserts: (prepared?.encryptedInserts ?? []) as Array<Record<string, unknown> & { id: string }>,
      updates: prepared?.encryptedUpdates ?? [],
      deletes: batch.deletes ?? [],
    };
  });
  // Keep only outcome identities privately; provider inputs must never alias them
  // or the prepared rows used by optimistic updates.
  const atomicExpected = atomicBatches.map((batch) => ({
    collection: batch.collection,
    inserts: (batch.inserts ?? []).map(({ id }) => ({ id })),
    updates: (batch.updates ?? []).map(({ id }) => ({ id, patch: {} })),
    deletes: [...(batch.deletes ?? [])],
  }));
  let atomicPlan: void | AtomicBulkExecutionPlan = undefined;
  if (capability) {
    for (const batch of atomicBatches) {
      const ids = [...(batch.inserts ?? []).map((row) => row.id), ...(batch.updates ?? []).map((row) => row.id), ...(batch.deletes ?? [])];
      if (new Set(ids).size !== ids.length) throw new AtomicBulkError('Duplicate prepared document target', 'not-committed');
    }
    try {
      const plan: unknown = await capability.preflight(cloneAtomicOperations(atomicBatches));
      validateAtomicPlan(plan);
      atomicPlan = plan;
    } catch (error) {
      throw error instanceof AtomicBulkError ? error : new AtomicBulkError('Atomic preflight failed', 'not-committed', error);
    }
    if (self.security) await self.security.checkRateLimit(rateLimitKey(self, nonEmpty[0]!.collection), 'write');
  }

  // -------------------------------------------------------------------------
  // 8. Optimistic apply — ALL collections before any adapter call (not a transaction).
  // -------------------------------------------------------------------------
  const cacheLogsMap = new Map<string, BatchCacheLog>();
  let observeLateWrites = false;
  let committedResults: Record<string, import('@donotdev/core').BulkResult> | undefined;
  const coldCollections = new Set<string>();
  const lateCollections = new Set<string>();
  const reconcile = createBulkReconciliation(self, 'bulkAcross.lateReconciliation');
  const onRawSettlement = (collection: string): void => {
    if (!observeLateWrites) {
      lateCollections.add(collection);
      return;
    }
    void reconcile(collection);
  };
  for (const { batch } of preparedBatches) {
    cacheLogsMap.set(batch.collection, { insertTempIds: [], inserts: [], updates: [], deletes: [] });
  }

  try {
    for (const batch of nonEmpty) {
      if (self.store) {
        self.store.getState().setLoading(batch.collection, true);
        self.store.getState().setError(batch.collection, null);
      }
    }
    for (const {
      batch,
      encryptedInserts,
      encryptedUpdates,
    } of preparedBatches) {
      const { collection, deletes = [] } = batch;
      const insertTempIds = encryptedInserts.map(
        () => `temp_${generateUUID()}`
      );
      const touchedIds = [
        ...(batch.updates ?? []).map((u) => u.id),
        ...deletes,
      ];
      const previousSnapshot = snapshotData(self, collection, touchedIds);

      const log = cacheLogsMap.get(collection)!;
      log.insertTempIds = insertTempIds;

      // 8a. Inserts — pending store only; list membership comes from reconciliation.
      encryptedInserts.forEach((row, i) => {
        const tempId = insertTempIds[i]!;
        const tempItem = { ...(row as object), id: tempId } as Record<string, unknown>;
        log.inserts.push({ tempId, originalRow: row as Record<string, unknown> });
        if (self.store) self.store.getState().addOptimistic(collection, tempId, tempItem);
      });

      // 8b. Updates — patch only complete rows already known from a GET/list snapshot.
      const stagedUpdates = new Map<string, Record<string, unknown>>();
      encryptedUpdates.forEach(({ id, patch }) => {
        const prev = previousSnapshot.get(id) ?? null;
        const base = stagedUpdates.get(id) ?? prev;
        const merged = base ? { ...base, ...patch } : { ...patch, id };
        stagedUpdates.set(id, merged);
        if (!log.updates.some((entry) => entry.id === id)) log.updates.push({ id, prev });
        if (self.store) self.store.getState().updateOptimistic(collection, id, merged, prev);
        if (prev) updateGetCache(self, collection, id, merged, CRUD_OPERATION.UPDATE);
        else coldCollections.add(collection);
      });

      // 8c. Deletes — pending store only; never guess filtered/paginated membership.
      [...new Set(deletes)].forEach((id) => {
        const prev = previousSnapshot.get(id) ?? null;
        log.deletes.push({ id, prev });
        if (prev) updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE);
        if (self.store && prev) self.store.getState().deleteOptimistic(collection, id, prev);
        coldCollections.add(collection);
      });
    }

    // -----------------------------------------------------------------------
    // 9. Adapter writes — in topological order; each wave runs in parallel.
    // -----------------------------------------------------------------------
    if (!self.adapter) {
      throw new Error('[dndev] Adapter not initialized for bulkAcross().');
    }
    const adapter = self.adapter;
    const results: Record<string, import('@donotdev/core').BulkResult> = Object.create(null);

    if (capability) {
      const attempt = { settled: false, late: false };
      try {
        const write = Promise.resolve().then(() => atomicPlan ? atomicPlan.execute() : capability.execute(cloneAtomicOperations(atomicBatches)));
        const settled = () => {
          attempt.settled = true;
          if (attempt.late) for (const batch of nonEmpty) onRawSettlement(batch.collection);
        };
        void write.then(settled, settled);
        const acknowledgement = await withTimeout(write, DEFAULT_CRUD_TIMEOUT);
        if (!acknowledgement || !acknowledgement.results || typeof acknowledgement.results !== 'object' ||
            Object.keys(acknowledgement.results).length !== atomicExpected.length ||
            atomicExpected.some((batch) => !Object.hasOwn(acknowledgement.results, batch.collection))) {
          throw new Error('Invalid atomic collection acknowledgement');
        }
        for (const batch of atomicExpected) {
          const result = validateBulkOutcome(batch, acknowledgement.results[batch.collection]);
          if (result.failed.length || result.insertedIds.some((id, i) => id !== batch.inserts?.[i]?.id)) {
            throw new Error('Invalid atomic write acknowledgement');
          }
          if (nonEmpty.some((entry) => entry.collection === batch.collection)) results[batch.collection] = result;
        }
      } catch (error) {
        throw error instanceof AtomicBulkError ? error : new AtomicBulkError('Atomic execution outcome is unknown', 'unknown', error);
      } finally {
        if (!attempt.settled) attempt.late = true;
      }
    } else for (const wave of waves) {
      const waveEntries = wave.map(
        (waveBatch) =>
          preparedBatches.find(
            (p) => p.batch.collection === waveBatch.collection
          )!
      );

      // Bound each write without replay: a timeout may already have committed.
      // Observe late settlement, preserving the first rejection even if falsy.
      const failure: { first?: { error: unknown } } = {};
      const outcomes = await Promise.allSettled(
        waveEntries.map(async ({ batch, encryptedInserts, encryptedUpdates }) => {
          const payload = {
            inserts: encryptedInserts,
            updates: encryptedUpdates,
            deletes: batch.deletes,
          };
          const attempt = { settled: false, late: false };
          try {
            const write = Promise.resolve().then(() =>
              adapter.bulk(batch.collection, payload)
            );
            const settled = (): void => {
              attempt.settled = true;
              if (attempt.late) onRawSettlement(batch.collection);
            };
            void write.then(settled, settled);
            const acknowledgement = await withTimeout(write, DEFAULT_CRUD_TIMEOUT);
            const result = validateBulkOutcome(payload, acknowledgement);
            return { collection: batch.collection, result };
          } catch (error) {
            failure.first ??= { error };
            throw error;
          } finally {
            if (!attempt.settled) attempt.late = true;
          }
        })
      );
      if (failure.first) throw failure.first.error;

      const waveResults = [];
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') {
          waveResults.push(outcome.value);
          results[outcome.value.collection] = outcome.value.result;
        }
      }

      // Later waves depend on this one: rows that were not written stop the chain.
      // Rows already written stay written (the catch refetches server truth).
      const partial = waveResults.filter(({ result }) => result.failed.length > 0);
      if (partial.length > 0) {
        // Keep this wave's validated acknowledgement for failure-safe settlement;
        // a later partial row failure must not erase successful sibling outcomes.
        committedResults = results;
        throw new Error(
          `bulkAcross: rows not written in ${partial
            .map(({ collection, result }) => `${collection} (${result.failed.length})`)
            .join(', ')}`
        );
      }
    }

    committedResults = results;
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
        const row = { ...encryptedInserts[i], id: realId };
        updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE);
        updateGetCache(self, collection, realId, row as Record<string, unknown>, CRUD_OPERATION.ADD);
        if (self.store) self.store.getState().confirmOptimistic(collection, tempId, realId, row);
      });

      (result.updatedIds ?? []).forEach((id) => {
        if (self.store) self.store.getState().confirmUpdate(collection, id);
      });

      (result.deletedIds ?? []).forEach((id) => {
        updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE);
        if (self.store) self.store.getState().confirmDelete(collection, id);
      });
    }

    await Promise.all([...cacheLogsMap.keys()].map(reconcile));

    // -----------------------------------------------------------------------
    // 11. Audit — ONE entry with per-collection counts.
    // -----------------------------------------------------------------------
    try {
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
      // The first batch is the primary record (bulk's convention: its entity name).
      toast(
        'success',
        options?.successMessage ??
          i18n.t('messages.updateSuccess', {
            ns: 'crud',
            entity: getEntityName(batches[0]!.collection),
          })
      );
    }

    } catch (error) {
      // Storage is already acknowledged; notification/audit failures cannot change its outcome.
      try { handleError(new Error('Bulk post-commit side effect failed'), { context: { operation: 'bulkAcross.postCommit' }, showNotification: false }); } catch { /* reporting must not hide a committed result */ }
    }

    // Only authoritative refetches may reconcile late raw settlements.
    observeLateWrites = true;
    for (const collection of lateCollections) onRawSettlement(collection);
    return { results };
  } catch (error) {
    if (committedResults) {
      for (const [collection, log] of cacheLogsMap) {
        const outcome = committedResults[collection];
        const failedInserts = new Set(outcome?.failed.filter((failure) => failure.op === 'insert').map((failure) => failure.index) ?? []);
        const failedUpdates = new Set(outcome?.failed.filter((failure) => failure.op === 'update').map((failure) => failure.id) ?? []);
        const failedDeletes = new Set(outcome?.failed.filter((failure) => failure.op === 'delete').map((failure) => failure.id) ?? []);
        const insertedRows = new Map<string, Record<string, unknown>>();
        let insertSuccess = 0;
        log.inserts.forEach(({ tempId, originalRow }, index) => {
          if (!outcome || failedInserts.has(index)) {
            try { updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE); } catch { /* continue */ }
            try { self.store?.getState().rejectOptimistic(collection, tempId); } catch { /* continue */ }
          } else {
            const id = outcome.insertedIds[insertSuccess++];
            if (id !== undefined) {
              const row = { ...originalRow, id };
              insertedRows.set(id, row);
              try { updateGetCache(self, collection, id, row, CRUD_OPERATION.SET); } catch { /* continue */ }
              try { updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE); } catch { /* continue */ }
              try { self.store?.getState().confirmOptimistic(collection, tempId, id, row); } catch { /* continue */ }
            }
          }
        });
        for (const { id, prev } of log.updates) {
          if (!outcome || failedUpdates.has(id)) {
            try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue */ }
            try { self.store?.getState().rejectUpdate(collection, id); } catch { /* continue */ }
          } else try { self.store?.getState().confirmUpdate(collection, id); } catch { /* continue */ }
        }
        for (const { id, prev } of log.deletes) {
          if (outcome?.deletedIds.includes(id)) {
            try { updateGetCache(self, collection, id, null, CRUD_OPERATION.DELETE); } catch { /* continue */ }
            try { self.store?.getState().confirmDelete(collection, id); } catch { /* continue */ }
          } else if (!outcome || failedDeletes.has(id)) {
            const inserted = insertedRows.get(id);
            try {
              if (inserted) updateGetCache(self, collection, id, inserted, CRUD_OPERATION.SET);
              else if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET);
            } catch { /* continue */ }
            try { self.store?.getState().rejectDelete(collection, id); } catch { /* continue */ }
          }
        }
        for (const [id, row] of insertedRows) {
          if (!log.deletes.some((entry) => entry.id === id && outcome?.deletedIds.includes(id))) {
            try { updateGetCache(self, collection, id, row, CRUD_OPERATION.SET); } catch { /* continue settling details */ }
          }
        }
      }
      try { handleError(new Error('Bulk post-commit side effect failed'), { context: { operation: 'bulkAcross.postCommit' }, showNotification: false }); } catch { /* diagnostics are best effort */ }
      await Promise.all([...cacheLogsMap.keys()].map(reconcile));
      observeLateWrites = true;
      for (const collection of lateCollections) onRawSettlement(collection);
      if (Object.values(committedResults).some((outcome) => outcome.failed.length > 0)) throw error;
      return { results: committedResults };
    }
    // -----------------------------------------------------------------------
    // 13. Rollback — undo ALL optimistic ops. Reverse order per collection:
    //     deletes → updates → inserts. Waves that ran may have written rows,
    //     so each collection is also invalidated to refetch server truth.
    // -----------------------------------------------------------------------
    for (const [collection, log] of cacheLogsMap) {
      for (const { id, prev } of [...log.deletes].reverse()) {
        try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue settling */ }
        try { self.store?.getState().rejectDelete(collection, id); } catch { /* continue settling */ }
      }
      for (const { id, prev } of [...log.updates].reverse()) {
        try { if (prev) updateGetCache(self, collection, id, prev, CRUD_OPERATION.SET); } catch { /* continue settling */ }
        try { self.store?.getState().rejectUpdate(collection, id); } catch { /* continue settling */ }
      }
      for (const { tempId } of [...log.inserts].reverse()) {
        try { updateGetCache(self, collection, tempId, null, CRUD_OPERATION.DELETE); } catch { /* continue settling */ }
        try { self.store?.getState().rejectOptimistic(collection, tempId); } catch { /* continue settling */ }
      }
    }

    // Refetch only after ALL rollback patches. Await every invalidation without
    // replacing the original write error if reconciliation itself fails.
    const initialReconciliation = Promise.all([...cacheLogsMap.keys()].map(reconcile));
    observeLateWrites = true;
    for (const collection of lateCollections) onRawSettlement(collection);
    await initialReconciliation;

    // Unwrap collision/cycle errors so callers can instanceof them.
    if (
      (atomic && error instanceof AtomicBulkError) ||
      error instanceof BulkCollisionError ||
      error instanceof BulkAcrossCycleError
    ) {
      for (const { batch } of preparedBatches) {
        try { self.store?.getState().setError(batch.collection, error); } catch { /* subscribers must not replace the original error */ }
      }
      throw error;
    }

    let wrappedError: unknown = error;
    try {
      wrappedError = handleError(error, {
        userMessage: 'Failed to save across collections',
        showNotification: true,
      });
    } catch { /* preserve the write error */ }

    try {
      const i18n = getI18nInstance();
      toast('error', i18n.t('messages.updateError', {
        ns: 'crud',
        entity: getEntityName(batches[0]!.collection),
      }));
    } catch { /* preserve the write error */ }

    for (const { batch } of preparedBatches) {
      try { self.store?.getState().setError(batch.collection, wrappedError as Error); } catch { /* continue updating other collections */ }
    }

    throw wrappedError;
  } finally {
    for (const { batch } of preparedBatches) {
      if (self.store) {
        try { self.store.getState().setLoading(batch.collection, false); } catch {
          try { handleError(new Error('Bulk loading cleanup failed'), { context: { operation: 'bulkAcross.cleanup' }, showNotification: false }); } catch { /* diagnostics are best effort */ }
        }
      }
    }
  }
}
