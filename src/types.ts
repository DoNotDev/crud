// packages/features/crud/src/types.ts

/**
 * @fileoverview Shared CRUD Types
 * @description Types shared between CrudService and CrudStore.
 *
 * **Architecture:**
 * - TanStack Query = single source of truth for data
 * - CrudStore = only tracks optimistic metadata (optimisticData + originalData)
 * - mergeWithOptimistic merges TanStack cache with optimistic data for display
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
  dndevSchema,
  ICrudAdapter,
  QueryClient,
  QueryOptions,
  PaginatedQueryResult,
  ListSchemaType,
  SecurityContext,
} from '@donotdev/core';

/**
 * Optimistic operation status
 */
export const OPTIMISTIC_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
} as const;

/** Union of optimistic operation status values: 'pending' | 'confirmed' | 'failed'. */
export type OptimisticStatus =
  (typeof OPTIMISTIC_STATUSES)[keyof typeof OPTIMISTIC_STATUSES];

/** Optimistic mutation operation kind */
export const CRUD_OPERATION = {
  ADD: 'add',
  UPDATE: 'update',
  /** Full document replacement (set/upsert) — cache replaces, not merges */
  SET: 'set',
  DELETE: 'delete',
} as const;

/** Union of CRUD mutation operation kinds: 'add' | 'update' | 'set' | 'delete'. */
export type CrudOperation =
  (typeof CRUD_OPERATION)[keyof typeof CRUD_OPERATION];

/**
 * Optimistic operation metadata
 * Contains both original data (for rollback) and current data (for display)
 */
export interface OptimisticMeta {
  tempId: string;
  originalData: unknown | null; // null = new item (add operation)
  /** Current optimistic data to display (the new/updated value) */
  optimisticData: unknown;
  status: OptimisticStatus;
  operation: CrudOperation;
}

/**
 * Filter state type for list views
 * Persists across navigation within CrudStore
 * - string: single value filter (text, select)
 * - string[]: multi-select filter (multiple values)
 * - { min?: string; max?: string }: range filter (number, date)
 */
export type FilterState = Record<
  string,
  string | string[] | { min?: string; max?: string }
>;

/**
 * Collection UI state (filters, favorites toggle)
 * Persists across navigation
 */
export interface CollectionUIState {
  filters: FilterState;
  showFavoritesOnly: boolean;
  /** Persisted items-per-page preference (survives navigation) */
  pageSize?: number;
}

/**
 * CRUD store state interface
 * Note: No data field - TanStack Query owns data, CrudStore only tracks optimistic ops
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface CrudState {
  crudService: CrudServiceInterface | null;

  /** Global flag to hide success toasts (set from app config) */
  hideSuccessToasts: boolean;

  // State per collection
  collections: Record<
    string,
    {
      loading: boolean;
      error: Error | null;
      lastUpdated: number;
      /** Optimistic operation metadata keyed by document id */
      optimistic: Record<string, OptimisticMeta>;
      /** UI state: filters and favorites toggle (persists across navigation) */
      ui: CollectionUIState;
    }
  >;
}

/**
 * CRUD store actions interface
 * Note: No setData/getData - TanStack Query owns data, CrudStore only tracks optimistic ops
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface CrudActions {
  // Service management
  setCrudService: (service: CrudServiceInterface) => void;

  /** Set global flag to hide success toasts (called from app bootstrap) */
  setHideSuccessToasts: (hide: boolean) => void;

  // Collection-level domain methods
  setLoading: (collection: string, loading: boolean) => void;
  setError: (collection: string, error: Error | null) => void;
  clearCollection: (collection: string) => void;
  clearError: (collection: string) => void;

  // UI state (filters, favorites, pageSize) - persists across navigation
  setFilters: (collection: string, filters: FilterState) => void;
  setShowFavoritesOnly: (collection: string, show: boolean) => void;
  setPageSize: (collection: string, pageSize: number) => void;
  getFilters: (collection: string) => FilterState;
  getShowFavoritesOnly: (collection: string) => boolean;
  getPageSize: (collection: string) => number | undefined;

  // Optimistic operations
  /** Add item optimistically (before server confirms) */
  addOptimistic: (collection: string, tempId: string, data: unknown) => void;
  /** Confirm optimistic add - replace temp item with real item */
  confirmOptimistic: (
    collection: string,
    tempId: string,
    realId: string,
    realData: unknown
  ) => void;
  /** Reject optimistic add - remove temp item */
  rejectOptimistic: (collection: string, tempId: string) => void;

  /** Update item optimistically */
  updateOptimistic: (
    collection: string,
    id: string,
    data: unknown,
    originalData: unknown
  ) => void;
  /** Confirm optimistic update */
  confirmUpdate: (collection: string, id: string) => void;
  /** Reject optimistic update - restore original data */
  rejectUpdate: (collection: string, id: string) => void;

  /** Delete item optimistically (hide but keep for rollback) */
  deleteOptimistic: (
    collection: string,
    id: string,
    originalData: unknown
  ) => void;
  /** Confirm optimistic delete - remove completely */
  confirmDelete: (collection: string, id: string) => void;
  /** Reject optimistic delete - restore item */
  rejectDelete: (collection: string, id: string) => void;

  // Getters
  getLoading: (collection: string) => boolean;
  getError: (collection: string) => Error | null;
  /** Check if item is optimistic (not yet confirmed by server) */
  isOptimistic: (collection: string, id: string) => boolean;
  /** Get optimistic status for an item */
  getOptimisticStatus: (
    collection: string,
    id: string
  ) => OptimisticStatus | null;
  /** Get optimistic data for an item (for display during pending state) */
  getOptimisticData: (collection: string, id: string) => unknown | null;
}

/**
 * Store API type for CrudService - typed instead of any
 * Used by CrudService to type the store it receives
 */
export type CrudStoreApi = {
  getState: () => CrudState & CrudActions;
};

/**
 * Cache options for read operations
 */
export interface CacheOptions {
  /** Bypass cache and fetch directly from adapter */
  noCache?: boolean;
  /** Custom stale time in ms (default: Infinity) */
  staleTime?: number;
}

/**
 * Options for mutation operations (add, update, delete, set)
 */
export interface MutationOptions {
  /**
   * Override success toast behavior for this operation
   * - true: always show toast
   * - false: never show toast
   * - undefined: use global setting (hideSuccessToasts)
   */
  showSuccessToast?: boolean;
}

/**
 * CRUD Service Interface
 * Complete interface for CRUD operations with caching and optimistic updates
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface CrudServiceInterface {
  /** Initialize the CRUD adapter from the provider registry. Call configureProviders() first. */
  initialize(): Promise<void>;
  setStore(store: CrudStoreApi): void;

  // Query options for reactive hooks (useQuery)
  /** Schema accepts unknown since OperationSchemas stores dndevSchema<unknown>. T is for return type. */
  getListQueryOptions<T>(
    collection: string,
    queryOptions: QueryOptions,
    schema: dndevSchema<unknown>,
    cacheOptions?: CacheOptions,
    schemaType?: ListSchemaType
  ): {
    queryKey: readonly string[];
    queryFn: () => Promise<PaginatedQueryResult<T>>;
    staleTime: number;
  };
  /** Schema accepts unknown since OperationSchemas stores dndevSchema<unknown>. T is for return type. */
  getDocQueryOptions<T>(
    collection: string,
    id: string,
    schema: dndevSchema<unknown>,
    cacheOptions?: CacheOptions
  ): {
    queryKey: readonly string[];
    queryFn: () => Promise<T | null>;
    staleTime: number;
  };

  // Read operations (with caching)
  get<T>(
    collection: string,
    id: string,
    schema: dndevSchema<T>,
    options?: CacheOptions
  ): Promise<T | null>;
  query<T>(
    collection: string,
    options: QueryOptions,
    schema: dndevSchema<T>,
    cacheOptions?: CacheOptions,
    schemaType?: ListSchemaType
  ): Promise<PaginatedQueryResult<T>>;

  // Write operations (with optimistic + cache updates)
  set<T>(
    collection: string,
    id: string,
    data: T,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<void>;
  update<T>(
    collection: string,
    id: string,
    data: Partial<T>,
    schema?: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<void>;
  delete(
    collection: string,
    id: string,
    options?: MutationOptions
  ): Promise<void>;
  add<T extends Record<string, unknown>>(
    collection: string,
    data: CrudCreateInput<T>,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<string>;

  /**
   * Transactional bulk write — one round-trip, one audit, one toast.
   *
   * @param schemas - `create` validates inserts + resolves their PII fields;
   *   `update` resolves PII fields on update patches.
   * @throws {Error} {@link BulkCollisionError} when the payload carries an id
   *   in two mutually-exclusive buckets (detected before any side effect).
   *
   * Rows for bulk operations are always treated as object records so PII
   * encryption, cache merging and adapter mapping can rely on key/value
   * semantics.
   */
  bulk<T extends Record<string, unknown>>(
    collection: string,
    ops: BulkOperations<T>,
    schemas: {
      create?: dndevSchema<T>;
      draft?: dndevSchema<T>;
      update?: dndevSchema<T>;
    },
    options?: MutationOptions
  ): Promise<BulkResult>;

  /**
   * Cross-collection atomic bulk write. One optimistic pass, writes in
   * topological order, one toast, coordinated rollback.
   *
   * @throws {BulkCollisionError} Id collision within a single batch.
   * @throws {BulkAcrossCycleError} `dependsOn` contains a cycle.
   */
  bulkAcross(
    batches: BulkAcrossBatch[],
    options?: MutationOptions
  ): Promise<BulkAcrossResult>;

  // Subscriptions (with cache sync)
  subscribe<T>(
    collection: string,
    id: string,
    callback: (data: T | null, error?: Error) => void,
    schema: dndevSchema<T>
  ): () => void;
  subscribeToCollection<T>(
    collection: string,
    options: QueryOptions,
    callback: (data: T[], error?: Error) => void,
    schema: dndevSchema<T>
  ): () => void;

  // Optimistic operations
  /** Add with optimistic update - shows item immediately, confirms/rolls back after server */
  addOptimistic<T extends { id?: string }>(
    collection: string,
    data: T,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<T & { id: string }>;
  /** Update with optimistic update - shows change immediately, confirms/rolls back after server */
  updateOptimistic<T>(
    collection: string,
    id: string,
    data: Partial<T>,
    schema: dndevSchema<T>,
    options?: MutationOptions
  ): Promise<T>;
  /** Delete with optimistic update - hides item immediately, confirms/restores after server */
  deleteOptimistic(
    collection: string,
    id: string,
    options?: MutationOptions
  ): Promise<void>;

  // Cache control
  /** Invalidate all cached queries for a collection */
  invalidateCollection(collection: string): Promise<void>;
  /** Get the shared QueryClient instance from @donotdev/core */
  getQueryClient(): QueryClient;
}

/**
 * @internal
 * Extended interface exposing CrudService's internal instance state to sibling
 * impl files (CrudService.*.ts) without forcing a cycle through CrudService.ts.
 * Not part of the public API — consumers must use CrudServiceInterface.
 */
export interface CrudServiceInternal extends CrudServiceInterface {
  adapter: ICrudAdapter | null;
  store: CrudStoreApi | null;
  security: SecurityContext | null;
  currentUserId: string | null;
  _inflightMutations: Map<string, Promise<unknown>>;
}
