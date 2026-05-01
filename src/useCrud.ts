'use client';
// packages/features/crud/src/useCrud.ts

/**
 * @fileoverview useCrud Hook - THE Parent CRUD Hook
 * @description Primary hook for all CRUD operations. Handles initialization, actions,
 * and provides state for child hooks (useCrudList, useCrudCardList).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useMemo, useCallback } from 'react';

import {
  useFeatureConsent,
  FRAMEWORK_FEATURES,
  FEATURE_STATUS,
  handleError,
  isClient,
  createSchemas,
  DEGRADED_CRUD_API,
  getGlobalSingleton,
} from '@donotdev/core';
import type {
  AnyEntity,
  BulkAcrossBatch,
  BulkAcrossResult,
  BulkOperations,
  BulkResult,
  CrudCreateInput,
  dndevSchema,
  FeatureStatus,
  InferEntityRow,
  OperationSchemas,
  CrudAPI,
  ScopeConfig,
  QueryOptions,
} from '@donotdev/core';

import { getCrudService } from './CrudService';
import { useCrudStore } from './CrudStore';
import { injectScope, injectScopeFilter } from './utils/scopeUtils';

import type {
  CrudServiceInterface,
  CacheOptions,
  MutationOptions,
} from './types';

// =============================================================================
// Module-level singletons (shared across all CRUD hooks)
// =============================================================================
export const EMPTY_DATA: Record<string, unknown> = {};
export const EMPTY_OPTIMISTIC: Record<string, unknown> = {};

interface CrudSingletonState {
  service: CrudServiceInterface | null;
  initPromise: Promise<void> | null;
  errorNotified: boolean;
}

function getCrudState(): CrudSingletonState {
  return getGlobalSingleton<CrudSingletonState>('crud-service', () => ({
    service: null,
    initPromise: null,
    errorNotified: false,
  }));
}

/**
 * Get the current CrudService instance (for use in callbacks)
 */
export function getCrudServiceInstance(): CrudServiceInterface | null {
  return getCrudState().service;
}

// =============================================================================
// Types
// =============================================================================

/** Options for the {@link useCrud} hook. */
export interface UseCrudOptions<T> {
  schema?: dndevSchema<T>;
  /** Entity definition - auto-generates schema if schema not provided */
  entity?: AnyEntity;
  /** TanStack Query stale time in ms (default: Infinity) */
  staleTime?: number;
  /** Disable caching (bypass TanStack Query) */
  noCache?: boolean;
}

/**
 * CRUD API return type - Single Document & Actions
 */
export interface UseCrudReturn<
  T extends Record<string, unknown>,
> extends CrudAPI<T> {
  /**
   * Transactional bulk write — inserts + updates + deletes in one round-trip.
   * One audit entry, one rate-limit hit, one (optional) toast. Partial failures
   * roll every optimistic op back together. Throws `BulkCollisionError` when
   * the payload carries the same id in two mutually-exclusive buckets.
   *
   * @example
   * ```tsx
   * const { bulk } = useCrud<Event>(eventEntity);
   * await bulk({ inserts, updates, deletes });
   * ```
   */
  bulk: (
    ops: BulkOperations<T>,
    options?: MutationOptions
  ) => Promise<BulkResult>;

  /**
   * Cross-collection atomic bulk write. Does NOT require the hook's own entity
   * to be one of the collections. Each batch carries its own schemas.
   * One optimistic pass, writes in topological order, one toast, coordinated rollback.
   *
   * @example
   * ```tsx
   * const { bulkAcross } = useCrud(customerEntity);
   * const customerId = generateUUID();
   * await bulkAcross([
   *   { collection: 'customers', inserts: [{ id: customerId, ...customerData }], schemas: { create: customerSchema } },
   *   { collection: 'inquiries', inserts: [{ customerId, ...inquiryData }], schemas: { create: inquirySchema }, dependsOn: ['customers'] },
   * ]);
   * ```
   */
  bulkAcross: (
    batches: BulkAcrossBatch[],
    options?: MutationOptions
  ) => Promise<BulkAcrossResult>;

  // --- Internal getters for child hooks (useCrudList, useCrudCardList) ---
  /** @internal Collection name */
  _collection: string;
  /** @internal Generated schemas */
  _schemas: OperationSchemas | undefined;
  /** @internal Cache options */
  _cacheOptions: CacheOptions;
  /** @internal Scope configuration (for multi-tenancy) */
  _scope: ScopeConfig | undefined;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for CRUD Actions & Single Documents
 *
 * Use this hook for:
 * - Checking feature status: `const status = useCrud('status');`
 * - Adding, Updating, Deleting items
 * - Fetching a single document
 *
 * **IMPORTANT: Always destructure the return value.**
 * The returned object is a new reference every render (same pattern as
 * TanStack Query). Individual methods (`get`, `query`, `add`, `update`,
 * `delete`) are `useCallback`-stable and safe as useEffect dependencies.
 * Putting the whole object in a dependency array causes an infinite loop.
 *
 * @example
 * ```tsx
 * // Correct — destructure, use stable methods in deps
 * const { query, add } = useCrud<Car>(carEntity);
 * useEffect(() => { query({ limit: 50 }).then(setRows); }, [query]);
 *
 * // WRONG — infinite loop (new object every render)
 * const crud = useCrud<Car>(carEntity);
 * useEffect(() => { crud.query(...); }, [crud]); // loop!
 * ```
 *
 * @template T - Document type for this collection
 * @param entityOrCollection - Entity definition or collection name
 * @param options - Configuration options
 * @returns CRUD Actions API (destructure before using in deps)
 */
export function useCrud(key: 'status'): FeatureStatus;
export function useCrud<E extends AnyEntity>(
  entity: E,
  options?: UseCrudOptions<InferEntityRow<E>>
): UseCrudReturn<InferEntityRow<E>>;
export function useCrud<
  T extends Record<string, unknown> = Record<string, unknown>,
>(collection: string, options?: UseCrudOptions<T>): UseCrudReturn<T>;
export function useCrud<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  entityOrCollection: AnyEntity | string,
  options?: UseCrudOptions<T>
): UseCrudReturn<T>;
export function useCrud<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  entityOrCollectionOrKey: AnyEntity | string | 'status',
  options: UseCrudOptions<T> = {}
): FeatureStatus | UseCrudReturn<T> {
  // ==========================================================================
  // Feature consent check (Global)
  // ==========================================================================
  const canProceed = useFeatureConsent(FRAMEWORK_FEATURES.CRUD);

  // Status calculation (Global)
  // This depends only on consent + global store state, NOT on specific entity
  const storeCrudService = useCrudStore((state) => state.crudService);
  const isInitializing = canProceed && !storeCrudService;
  const status: FeatureStatus = !canProceed
    ? FEATURE_STATUS.DEGRADED
    : isInitializing
      ? FEATURE_STATUS.INITIALIZING
      : FEATURE_STATUS.READY;

  // Determine collection and entity (safe for 'status' branch — uses fallback values)
  const isStatusCheck = entityOrCollectionOrKey === 'status';
  const entity =
    !isStatusCheck && typeof entityOrCollectionOrKey === 'object'
      ? entityOrCollectionOrKey
      : options.entity;
  const collection = isStatusCheck
    ? '__status__'
    : typeof entityOrCollectionOrKey === 'string'
      ? entityOrCollectionOrKey
      : entityOrCollectionOrKey.collection;

  // Extract scope configuration for multi-tenancy
  const scope = entity?.scope;

  const noCache = options.noCache ?? false;
  const staleTime = options.staleTime;

  // Memoize cache options
  const cacheOptions: CacheOptions = useMemo(
    () => ({ noCache, staleTime }),
    [noCache, staleTime]
  );

  // ==========================================================================
  // Schema generation
  // ==========================================================================
  const schemas: OperationSchemas | undefined = useMemo(() => {
    if (isStatusCheck) return undefined;
    if (options.schema) {
      const schemaTyped = options.schema as dndevSchema<
        Record<string, unknown>
      >;
      return {
        create: schemaTyped,
        draft: schemaTyped,
        update: schemaTyped,
        get: schemaTyped,
        list: schemaTyped,
        listCard: schemaTyped,
        delete: schemaTyped,
      };
    }
    if (entity) {
      return createSchemas(entity);
    }
    return undefined;
    // Use options.schema object directly so a changed schema reference triggers recompute.
    // entity?.name covers the auto-generated path (createSchemas).
  }, [isStatusCheck, options.schema, entity?.name, collection]);

  // Dev-mode warning for missing schema (skip internal placeholders like __disabled_N__, __status__)
  if (
    process.env.NODE_ENV === 'development' &&
    !isStatusCheck &&
    !collection.startsWith('__') &&
    !schemas
  ) {
    console.warn(
      `[useCrud] No schema provided for collection "${collection}". ` +
        `CRUD operations will return degraded API. Pass { schema } or { entity } to enable.`
    );
  }

  // ==========================================================================
  // Store subscriptions
  // ==========================================================================
  // storeCrudService already defined above
  const storeLoading = useCrudStore(
    (state) => state.collections[collection]?.loading || false
  );
  const error = useCrudStore(
    (state) => state.collections[collection]?.error || null
  );

  /** @deprecated Always null. Use get() for single documents. Kept for CrudAPI<T> contract. */
  const data = null as T | null;

  // ==========================================================================
  // Service initialization
  // ==========================================================================
  useEffect(() => {
    if (!isClient()) return;
    if (!canProceed) return;
    if (!schemas) return;

    const { crudService: existingService } = useCrudStore.getState();

    // Already initialized — covers the React Strict Mode double-invocation where
    // initPromise is null again after the first mount's finally{} block
    // but service is already set (W7).
    const crudState = getCrudState();
    if (existingService) return;
    if (crudState.service) return;
    if (crudState.initPromise) return;

    crudState.initPromise = (async () => {
      try {
        // Re-check inside the async to guard against the TOCTOU window
        // between the synchronous check above and the first await.
        if (crudState.service || useCrudStore.getState().crudService) {
          return;
        }

        const service = getCrudService();
        crudState.service = service as CrudServiceInterface;

        service.setStore(useCrudStore);
        await service.initialize();

        crudState.errorNotified = false;

        useCrudStore.getState().setCrudService(service);
      } catch (err) {
        if (!crudState.errorNotified) {
          handleError(err, {
            userMessage: 'Failed to initialize CRUD service.',
            context: { collection },
            severity: 'error',
          });
          crudState.errorNotified = true;
        }
      } finally {
        crudState.initPromise = null;
      }
    })();
  }, [canProceed, collection, schemas ? 'hasSchema' : 'noSchema']);

  // ==========================================================================
  // Compute status & loading (single source of truth)
  // ==========================================================================
  const loading = isInitializing || storeLoading;
  const isAvailable = status === FEATURE_STATUS.READY;

  // ==========================================================================
  // CRUD Methods (thin wrappers around CrudService)
  // ==========================================================================
  const get = useCallback(
    async (id: string): Promise<T | null> => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return null;
      return service.get<T>(
        collection,
        id,
        schemas.get as dndevSchema<T>,
        cacheOptions
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema', cacheOptions]
  );

  const set = useCallback(
    async (
      id: string,
      setData: T,
      options?: MutationOptions
    ): Promise<void> => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return;
      // Inject scope for multi-tenancy
      const scopedData = injectScope(setData, scope);
      const isDraft =
        (scopedData as Record<string, unknown>)?.status === 'draft';
      const schemaToUse = isDraft ? schemas.draft : schemas.create;
      await service.set(
        collection,
        id,
        scopedData,
        schemaToUse as dndevSchema<T>,
        options
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema', scope?.provider]
  );

  const update = useCallback(
    async (
      id: string,
      updateData: Partial<T>,
      options?: MutationOptions
    ): Promise<void> => {
      const service = getCrudServiceInstance();
      if (!service) return;
      await service.update(
        collection,
        id,
        updateData,
        schemas?.update as dndevSchema<T> | undefined,
        options
      );
    },
    [collection, schemas]
  );

  const deleteDoc = useCallback(
    async (id: string, options?: MutationOptions): Promise<void> => {
      const service = getCrudServiceInstance();
      if (!service) return;
      await service.delete(collection, id, options);
    },
    [collection]
  );

  const addFn = useCallback(
    async (
      addData: CrudCreateInput<T>,
      options?: MutationOptions
    ): Promise<string> => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return '';
      // Inject scope for multi-tenancy
      const scopedData = injectScope(addData, scope);
      const isDraft =
        (scopedData as Record<string, unknown>)?.status === 'draft';
      const schemaToUse = isDraft ? schemas.draft : schemas.create;
      return service.add(
        collection,
        scopedData,
        schemaToUse as dndevSchema<T>,
        options
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema', scope?.provider]
  );

  const bulkAcrossFn = useCallback(
    async (
      batches: BulkAcrossBatch[],
      options?: MutationOptions
    ): Promise<BulkAcrossResult> => {
      const service = getCrudServiceInstance();
      if (!service) return { results: {} };
      return service.bulkAcross(batches, options);
    },
    [] // batches carry their own schemas — no hook-level deps
  );

  const bulkFn = useCallback(
    async (
      ops: BulkOperations<T>,
      options?: MutationOptions
    ): Promise<BulkResult> => {
      const service = getCrudServiceInstance();
      if (!service || !schemas)
        return { insertedIds: [], updatedIds: [], deletedIds: [] };
      // Inject scope on inserts; updates/deletes are scope-checked server-side.
      const scopedOps: BulkOperations<T> = {
        inserts: ops.inserts?.map((row) => injectScope(row, scope)),
        updates: ops.updates,
        deletes: ops.deletes,
      };
      return service.bulk<T>(
        collection,
        scopedOps,
        {
          create: schemas.create as dndevSchema<T>,
          draft: schemas.draft as dndevSchema<T>,
          update: schemas.update as dndevSchema<T>,
        },
        options
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema', scope?.provider]
  );

  const queryFn = useCallback(
    async (queryOptions: QueryOptions): Promise<T[]> => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return [];

      // Auto-inject scope filter for multi-tenancy
      const scopedQueryOptions = injectScopeFilter(queryOptions, scope);

      const result = await service.query<T>(
        collection,
        scopedQueryOptions,
        schemas.list as dndevSchema<T>,
        cacheOptions
      );
      return result.items;
    },
    [
      collection,
      schemas ? 'hasSchema' : 'noSchema',
      cacheOptions,
      scope?.provider,
    ]
  );

  const subscribe = useCallback(
    (
      id: string,
      callback: (data: T | null, error?: Error) => void
    ): (() => void) => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return () => {};
      return service.subscribe(
        collection,
        id,
        callback,
        schemas.get as dndevSchema<T>
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema']
  );

  const subscribeToCollection = useCallback(
    (
      queryOptions: QueryOptions,
      callback: (data: T[], error?: Error) => void
    ): (() => void) => {
      const service = getCrudServiceInstance();
      if (!service || !schemas) return () => {};
      return service.subscribeToCollection(
        collection,
        queryOptions,
        callback,
        schemas.list as dndevSchema<T>
      );
    },
    [collection, schemas ? 'hasSchema' : 'noSchema']
  );

  const invalidate = useCallback(async (): Promise<void> => {
    const service = getCrudServiceInstance();
    if (!service) return;
    await service.invalidateCollection(collection);
  }, [collection]);

  // ==========================================================================
  // Status-only check - early return AFTER all hooks (Rules of Hooks)
  // ==========================================================================
  if (isStatusCheck) {
    return status;
  }

  // ==========================================================================
  // Graceful degradation - apps can work without CRUD feature
  // ==========================================================================
  if (!isAvailable) {
    // Return degraded API + internal getters (for child hooks)
    return {
      ...(DEGRADED_CRUD_API as unknown as UseCrudReturn<T>),
      status, // keep actual status (degraded/error)
      loading, // keep actual loading state
      error, // keep actual error
      // Override specific methods if needed, or rely on DEGRADED_CRUD_API defaults:
      // get: async () => null,
      // set: async () => {}, etc.

      // Preserve subscription stubs from local scope if different,
      // but DEGRADED_CRUD_API has them as () => () => {}.
      // Local subscribe is:
      subscribe,
      subscribeToCollection,
      invalidate,
      // Bulk returns a zeroed result when degraded — no server call.
      bulk: bulkFn,
      bulkAcross: bulkAcrossFn,

      // Internal getters for child hooks
      _collection: collection,
      _schemas: schemas,
      _cacheOptions: cacheOptions,
      _scope: scope,
    };
  }

  // ==========================================================================
  // Return full API
  // ==========================================================================
  return {
    status: FEATURE_STATUS.READY,
    data,
    loading,
    error,
    get,
    set,
    update,
    delete: deleteDoc,
    add: addFn,
    bulk: bulkFn,
    bulkAcross: bulkAcrossFn,
    query: queryFn,
    subscribe,
    subscribeToCollection,
    invalidate,
    isAvailable: true,
    // Internal getters for child hooks
    _collection: collection,
    _schemas: schemas,
    _cacheOptions: cacheOptions,
    _scope: scope,
  };
}
