// packages/features/crud/src/CrudService.ts

/**
 * @fileoverview CrudService - Complete CRUD Orchestrator with Caching
 * @description Complete CRUD orchestrator with TanStack Query as single source of truth.
 * Validation is handled by Valibot schemas in adapters.
 *
 * **Architecture (4 layers):**
 * - useCrud (thin React wrapper, pass-through)
 * - CrudService (orchestration + caching) ← THIS FILE
 * - Backend Adapter (FirestoreAdapter | FunctionsAdapter | SupabaseCrudAdapter | custom ICrudAdapter)
 * - Backend SDK (Firestore | Firebase Functions | Supabase PostgREST | ...)
 *
 * Adapters are registered via `configureProviders({ crud: adapter })` at app startup.
 * Firebase adapters (firestore / functions) are also lazy-loaded by name for backwards compat.
 *
 * **File layout (refactored from a 1949-LOC monolith):**
 * - `CrudService.ts`             ← thin facade: DI + delegators (this file)
 * - `CrudService.internal.ts`    ← toast/audit/resilience/init helpers
 * - `CrudService.cache.ts`       ← TanStack cache read/update helpers
 * - `CrudService.queries.ts`     ← get / query / *QueryOptions impls
 * - `CrudService.mutations.ts`   ← set / update / delete / add impls
 * - `CrudService.optimistic.ts`  ← *Optimistic impls
 * - `CrudService.subscriptions.ts` ← subscribe / subscribeToCollection impls
 *
 * **Responsibilities:**
 * - All CRUD operations (via adapter)
 * - TanStack Query caching (single source of truth for data)
 * - Error wrapping with `handleError()`
 * - Optimistic metadata updates (CrudStore tracks pending ops only)
 * - Loading state management
 * - Toast notifications
 *
 * **Caching strategy (aggressive / optimal):**
 * - One cache key per (collection, queryOptions): `['crud', collection, 'query', JSON.stringify(queryOptions)]`.
 *   list and listCard share that same key — one network read, both views get data.
 * - Create/Update/Delete update both the GET cache `['crud', collection, 'get', id]` and all
 *   list caches via `updateListCaches` so the UI stays in sync without any refetch.
 * - `subscribeToCollection` writes to the same list cache key; real-time updates and mutations
 *   share one source of truth. The updater preserves `total`/`hasMore`/`lastVisible` and
 *   only replaces `items`.
 *
 * **Optimistic Flow:**
 * 1. Store optimisticData + originalData in CrudStore
 * 2. mergeWithOptimistic shows optimisticData instantly
 * 3. On success: update TanStack cache, then remove optimistic flag
 * 4. On error: restore originalData to cache, then remove optimistic flag
 *
 * **Key:** Cache updated BEFORE flag removed = no race condition
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type {
  BulkAcrossBatch,
  BulkAcrossResult,
  BulkOperations,
  BulkResult,
  CrudCreateInput,
  CrudDocQuery,
  CrudListQuery,
  dndevSchema,
  QueryClient,
  ICrudAdapter,
  QueryOptions,
  PaginatedQueryResult,
  ListSchemaType,
  SecurityContext,
} from '@donotdev/core';
import { createSingleton, getQueryClient } from '@donotdev/core';

import { bulkImpl } from './CrudService.bulk';
import type { BulkSchemas } from './CrudService.bulk';
import { bulkAcrossImpl } from './CrudService.bulkAcross';
import { invalidateCollectionImpl } from './CrudService.cache';
import { initializeImpl } from './CrudService.internal';
import {
  addImpl,
  deleteImpl,
  setImpl,
  updateImpl,
} from './CrudService.mutations';
import {
  addOptimisticImpl,
  deleteOptimisticImpl,
  updateOptimisticImpl,
} from './CrudService.optimistic';
import {
  getDocQueryOptionsImpl,
  getImpl,
  getListQueryOptionsImpl,
  queryImpl,
} from './CrudService.queries';
import {
  subscribeImpl,
  subscribeToCollectionImpl,
} from './CrudService.subscriptions';

import type {
  CacheOptions,
  CrudServiceInternal,
  CrudStoreApi,
  MutationOptions,
} from './types';

// Re-export CacheOptions for external use (QueryOptions is exported from @donotdev/core)
export type { CacheOptions };

/**
 * Complete CRUD orchestrator with TanStack Query caching.
 *
 * **Field visibility:** fields below are marked `@internal` rather than TS
 * `private` because impl functions in sibling files (`CrudService.*.ts`) must
 * access them via `self.field`. TypeScript's `private` modifier blocks that
 * cross-file access even within the same package. Consumers must not touch
 * these fields directly — they're part of the class's internal surface only.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export class CrudService implements CrudServiceInternal {
  /** @internal */
  adapter: ICrudAdapter | null = null;
  /** @internal */
  store: CrudStoreApi | null = null;
  /**
   * Optional security context (SOC2 audit logging, rate limiting, PII encryption)
   * @internal
   */
  security: SecurityContext | null = null;
  /**
   * Current authenticated user ID — used as rate limit key prefix and audit actor.
   * Call `setCurrentUser(userId)` after auth state changes so CRUD operations are
   * scoped per-user rather than per-collection.
   * @internal
   */
  currentUserId: string | null = null;

  /**
   * Tracks in-flight mutations to prevent concurrent writes to the same document.
   * @internal
   */
  _inflightMutations = new Map<string, Promise<unknown>>();

  // ===================================================================
  // Initialization
  // ===================================================================

  setStore(store: CrudStoreApi): void {
    this.store = store;
  }

  /**
   * Inject a security context for SOC2-compliant audit logging, rate limiting, and PII encryption.
   * Call at app startup after configureProviders():
   * ```typescript
   * getCrudService().setSecurity(security);
   * ```
   *
   * @version 0.1.0
   * @since 0.0.1
   */
  setSecurity(security: SecurityContext): void {
    this.security = security;
  }

  /**
   * Set the current authenticated user ID so rate limiting and audit logs are
   * scoped per-user rather than per-collection. Call after auth state changes.
   *
   * ```typescript
   * onAuthStateChanged((user) => getCrudService().setCurrentUser(user?.id ?? null));
   * ```
   *
   * @version 0.1.0
   * @since 0.0.1
   */
  setCurrentUser(userId: string | null): void {
    this.currentUserId = userId;
  }

  /**
   * Initialize the CRUD adapter from the provider registry.
   * Apps must call `configureProviders({ crud: adapter })` at startup before any CRUD.
   *
   * @throws If no CRUD provider is configured
   */
  initialize(): Promise<void> {
    return initializeImpl(this);
  }

  // ===================================================================
  // TanStack Query Management (Lazy Loaded)
  // ===================================================================

  /**
   * Get shared QueryClient instance from @donotdev/core.
   * Uses singleton on client, new instance per request on server (SSR-safe).
   */
  getQueryClient(): QueryClient {
    return getQueryClient();
  }

  /**
   * Get query options for list queries. Use with useQuery() in hooks.
   * Returns reactive loading states via TanStack Query.
   * @param schema - Accepts dndevSchema<unknown> since OperationSchemas uses unknown. T is for return type.
   */
  getListQueryOptions<T>(
    collection: string,
    queryOptions: QueryOptions,
    schema: dndevSchema<unknown>,
    cacheOptions?: CacheOptions,
    schemaType?: ListSchemaType
  ): CrudListQuery<T> {
    return getListQueryOptionsImpl<T>(
      this,
      collection,
      queryOptions,
      schema,
      cacheOptions,
      schemaType
    );
  }

  /**
   * Get query options for single document queries. Use with useQuery() in hooks.
   * Returns reactive loading states via TanStack Query.
   * @param schema - Accepts dndevSchema<unknown> since OperationSchemas uses unknown. T is for return type.
   */
  getDocQueryOptions<T>(
    collection: string,
    id: string,
    schema: dndevSchema<unknown>,
    cacheOptions?: CacheOptions
  ): CrudDocQuery<T> {
    return getDocQueryOptionsImpl<T>(
      this,
      collection,
      id,
      schema,
      cacheOptions
    );
  }

  /**
   * Invalidate all cached queries for a collection
   */
  invalidateCollection(collection: string): Promise<void> {
    return invalidateCollectionImpl(this, collection);
  }

  // ===================================================================
  // Read Operations (with Caching)
  // ===================================================================

  get<T>(
    collection: string,
    id: string,
    schema: dndevSchema<T>,
    options?: CacheOptions
  ): Promise<T | null> {
    return getImpl<T>(this, collection, id, schema, options);
  }

  query<T>(
    collection: string,
    options: QueryOptions,
    schema: dndevSchema<T>,
    cacheOptions?: CacheOptions,
    schemaType?: ListSchemaType
  ): Promise<PaginatedQueryResult<T>> {
    return queryImpl<T>(
      this,
      collection,
      options,
      schema,
      cacheOptions,
      schemaType
    );
  }

  // ===================================================================
  // Write Operations (with Optimistic + Cache Updates)
  // ===================================================================

  set<T>(
    collection: string,
    id: string,
    data: T,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<void> {
    return setImpl<T>(this, collection, id, data, schema, options);
  }

  update<T>(
    collection: string,
    id: string,
    data: Partial<T>,
    schema?: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<void> {
    return updateImpl<T>(this, collection, id, data, schema, options);
  }

  delete(
    collection: string,
    id: string,
    options?: MutationOptions
  ): Promise<void> {
    return deleteImpl(this, collection, id, options);
  }

  add<T extends Record<string, unknown>>(
    collection: string,
    data: CrudCreateInput<T>,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<string> {
    return addImpl<T>(this, collection, data, schema, options);
  }

  /**
   * Execute a transactional bulk CRUD operation.
   *
   * All three buckets commit atomically in one adapter round-trip. Emits one
   * audit entry, one rate-limit hit, one toast. Collisions (same id in two
   * mutually-exclusive buckets) reject up-front with `BulkCollisionError`
   * before any optimistic mutation. Empty payloads short-circuit without
   * hitting the adapter.
   *
   * @param schemas - `create` schema validates inserts; `update` resolves PII
   *   fields on patches. Either may be omitted when the matching bucket is empty.
   *
   * @example
   * ```typescript
   * const result = await crud.bulk<Event>('events', {
   *   inserts: [{ title: 'A' }, { title: 'B' }],
   *   updates: [{ id: 'e1', patch: { title: 'renamed' } }],
   *   deletes: ['e2', 'e3'],
   * }, { create: createSchema, update: updateSchema });
   * ```
   */
  bulk<T extends Record<string, unknown>>(
    collection: string,
    ops: BulkOperations<T>,
    schemas: BulkSchemas<T>,
    options?: MutationOptions
  ): Promise<BulkResult> {
    return bulkImpl<T>(this, collection, ops, schemas, options);
  }

  /**
   * Cross-collection atomic bulk write.
   *
   * One optimistic pass across all collections, adapter writes in topological
   * order (parallel within each wave), one toast, coordinated rollback.
   * Batches with `dependsOn` run after their dependencies complete.
   *
   * @throws {BulkCollisionError} Same id in two mutually-exclusive buckets
   *   within one batch — thrown before any side effect.
   * @throws {BulkAcrossCycleError} `dependsOn` contains a cycle — thrown
   *   before any side effect.
   *
   * @example
   * ```typescript
   * const customerId = generateUUID();
   * await crud.bulkAcross([
   *   {
   *     collection: 'customers',
   *     inserts: [{ id: customerId, ...customerData }],
   *     schemas: { create: customerCreateSchema },
   *   },
   *   {
   *     collection: 'inquiries',
   *     inserts: [{ customerId, ...inquiryData }],
   *     schemas: { create: inquiryCreateSchema },
   *     dependsOn: ['customers'],
   *   },
   * ]);
   * ```
   */
  bulkAcross(
    batches: BulkAcrossBatch[],
    options?: MutationOptions
  ): Promise<BulkAcrossResult> {
    return bulkAcrossImpl(
      this,
      batches as BulkAcrossBatch<Record<string, unknown>>[],
      options
    );
  }

  // ===================================================================
  // Subscriptions (with Cache Sync)
  // ===================================================================

  subscribe<T>(
    collection: string,
    id: string,
    callback: (data: T | null, error?: Error) => void,
    schema: dndevSchema<T>
  ): () => void {
    return subscribeImpl<T>(this, collection, id, callback, schema);
  }

  subscribeToCollection<T>(
    collection: string,
    options: QueryOptions,
    callback: (data: T[], error?: Error) => void,
    schema: dndevSchema<T>
  ): () => void {
    return subscribeToCollectionImpl<T>(
      this,
      collection,
      options,
      callback,
      schema
    );
  }

  // ===================================================================
  // Optimistic Operations (with Cache Sync)
  // ===================================================================

  addOptimistic<T extends { id?: string }>(
    collection: string,
    data: T,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<T & { id: string }> {
    return addOptimisticImpl<T>(this, collection, data, schema, options);
  }

  updateOptimistic<T>(
    collection: string,
    id: string,
    data: Partial<T>,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<T> {
    return updateOptimisticImpl<T>(this, collection, id, data, schema, options);
  }

  deleteOptimistic(
    collection: string,
    id: string,
    options?: MutationOptions
  ): Promise<void> {
    return deleteOptimisticImpl(this, collection, id, options);
  }
}

/**
 * Get or create CrudService singleton instance
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const getCrudService = createSingleton<CrudService>(
  () => new CrudService()
);
