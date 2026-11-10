// packages/features/crud/src/CrudService.queries.ts

/**
 * @fileoverview CrudService read operations
 * @description get / query / getListQueryOptions / getDocQueryOptions impl
 * functions. Extracted from CrudService.ts to keep each file under the 500-LOC
 * cap. The class methods are thin thunks — all logic lives here.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type {
  CrudDocQuery,
  CrudListQuery,
  ICrudAdapter,
  dndevSchema,
  QueryOptions,
  PaginatedQueryResult,
  ListSchemaType,
} from '@donotdev/core';
import { LIST_SCHEMA_TYPE, handleError } from '@donotdev/core';

import {
  assertCanAccess,
  decryptPiiRow,
  ensureAdapter,
  withResilience,
} from './CrudService.internal';
import type { CacheOptions, CrudServiceInternal } from './types';

/** Default stale time - data never becomes stale. Mutations handle cache updates. */
const DEFAULT_STALE_TIME = Infinity;

/**
 * Request-scoped adapters for the server render, keyed by that request's QueryClient
 * (one per request on the server). A query run with this client reads as the visitor
 * (ICrudAdapter.forAccessToken); no entry = the shared adapter (public role).
 */
const requestAdapters = new WeakMap<object, ICrudAdapter>();

/**
 * Bind the visitor's access token to this request's QueryClient (server render).
 * Returns false when the configured adapter cannot read as a token holder.
 */
export function bindRequestAccessToken(
  self: CrudServiceInternal,
  client: object,
  accessToken: string
): boolean {
  if (requestAdapters.has(client)) return true;
  const adapter = self.adapter?.forAccessToken?.(accessToken);
  if (!adapter) return false;
  requestAdapters.set(client, adapter);
  return true;
}

/**
 * Get query options for list queries. Use with useQuery() in hooks.
 * Returns reactive loading states via TanStack Query.
 * @param schema - Accepts dndevSchema<unknown> since OperationSchemas uses unknown. T is for return type.
 */
export function getListQueryOptionsImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  queryOptions: QueryOptions,
  schema: dndevSchema<unknown>,
  cacheOptions?: CacheOptions,
  schemaType: ListSchemaType = LIST_SCHEMA_TYPE.LIST
): CrudListQuery<T> {
  // Single cache key for list + listCard — one network read shared by both
  return {
    queryKey: [
      'crud',
      collection,
      'query',
      JSON.stringify(queryOptions),
    ] as const,
    queryFn: async ({ client }): Promise<PaginatedQueryResult<T>> => {
      await ensureAdapter(self);
      if (!self.adapter) throw new Error('Adapter not initialized');
      const adapter = requestAdapters.get(client) ?? self.adapter;
      return readQuery<T>(
        self,
        adapter,
        collection,
        queryOptions,
        schema,
        schemaType
      );
    },
    staleTime: cacheOptions?.staleTime ?? DEFAULT_STALE_TIME,
  };
}

/**
 * Read one document: access check, adapter read, PII decryption.
 * The one read path behind `get()` and `getDocQueryOptions()`: both fill the cache
 * key `['crud', collection, 'get', id]`, so both must produce the same value.
 */
async function readDocument<T>(
  self: CrudServiceInternal,
  adapter: ICrudAdapter,
  collection: string,
  id: string,
  schema: dndevSchema<unknown>
): Promise<T | null> {
  assertCanAccess(adapter, collection, schema);
  const data = await withResilience(() =>
    adapter.get<T>(collection, id, schema)
  );
  return data ? decryptPiiRow(self, schema, data) : null;
}

/**
 * Run one list query: access check, adapter query, PII decryption per row.
 * The one read path behind `query()` and `getListQueryOptions()`: both fill the cache
 * key `['crud', collection, 'query', JSON(options)]`, so both must produce the same value.
 */
async function readQuery<T>(
  self: CrudServiceInternal,
  adapter: ICrudAdapter,
  collection: string,
  options: QueryOptions,
  schema: dndevSchema<unknown>,
  schemaType: ListSchemaType
): Promise<PaginatedQueryResult<T>> {
  assertCanAccess(adapter, collection, schema);
  const result = await withResilience(() =>
    adapter.query<T>(collection, options, schema, schemaType)
  );
  return {
    ...result,
    items: result.items.map((item) => decryptPiiRow(self, schema, item)),
  };
}

/**
 * Get query options for single document queries. Use with useQuery() in hooks.
 * Returns reactive loading states via TanStack Query.
 * @param schema - Accepts dndevSchema<unknown> since OperationSchemas uses unknown. T is for return type.
 */
export function getDocQueryOptionsImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  schema: dndevSchema<unknown>,
  cacheOptions?: CacheOptions
): CrudDocQuery<T> {
  return {
    queryKey: ['crud', collection, 'get', id] as const,
    queryFn: async ({ client }): Promise<T | null> => {
      await ensureAdapter(self);
      if (!self.adapter) throw new Error('Adapter not initialized');
      const adapter = requestAdapters.get(client) ?? self.adapter;
      return readDocument<T>(self, adapter, collection, id, schema);
    },
    staleTime: cacheOptions?.staleTime ?? DEFAULT_STALE_TIME,
  };
}

export async function getImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  schema: dndevSchema<T>,
  options?: CacheOptions
): Promise<T | null> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // Direct fetch if noCache
  if (options?.noCache) {
    return getFromAdapter(self, collection, id, schema);
  }

  // Set loading BEFORE TanStack Query call (so it shows even for cached data)
  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  try {
    // Use TanStack Query for caching
    const queryClient = self.getQueryClient();
    return await queryClient.fetchQuery({
      queryKey: ['crud', collection, 'get', id],
      queryFn: () => getFromAdapter(self, collection, id, schema, false), // Pass false to skip loading set
      staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    });
  } catch (error) {
    const wrappedError = handleError(error, {
      userMessage: `Failed to fetch ${collection}`,
      showNotification: true,
    });

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    // ALWAYS set loading false, even on error or cached data
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

/** Internal: fetch from adapter with store updates */
async function getFromAdapter<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  schema: dndevSchema<T>,
  setLoading = true
): Promise<T | null> {
  if (self.store && setLoading) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }
    return await readDocument<T>(self, self.adapter, collection, id, schema);
  } catch (error) {
    const wrappedError = handleError(error, {
      userMessage: `Failed to fetch ${collection}`,
      showNotification: true,
    });

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store && setLoading) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

export async function queryImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  options: QueryOptions,
  schema: dndevSchema<T>,
  cacheOptions?: CacheOptions,
  schemaType: ListSchemaType = LIST_SCHEMA_TYPE.LIST
): Promise<PaginatedQueryResult<T>> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // Direct fetch if noCache
  if (cacheOptions?.noCache) {
    return queryFromAdapter(
      self,
      collection,
      options,
      schema,
      true,
      schemaType
    );
  }

  // Set loading BEFORE TanStack Query call (so it shows even for cached data)
  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  try {
    // Use TanStack Query for caching — one cache for list and listCard (same key)
    const queryClient = self.getQueryClient();
    const result = await queryClient.fetchQuery({
      queryKey: ['crud', collection, 'query', JSON.stringify(options)],
      queryFn: () =>
        queryFromAdapter(self, collection, options, schema, false, schemaType), // Pass false to skip loading set
      staleTime: cacheOptions?.staleTime ?? DEFAULT_STALE_TIME,
    });

    return result;
  } catch (error) {
    const wrappedError = handleError(error, {
      userMessage: `Failed to query ${collection}`,
      showNotification: true,
    });

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    // ALWAYS set loading false, even on error or cached data
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

/** Internal: query from adapter with store updates */
async function queryFromAdapter<T>(
  self: CrudServiceInternal,
  collection: string,
  options: QueryOptions,
  schema: dndevSchema<T>,
  setLoading = true,
  schemaType: ListSchemaType = LIST_SCHEMA_TYPE.LIST
): Promise<PaginatedQueryResult<T>> {
  if (self.store && setLoading) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }
    return await readQuery<T>(
      self,
      self.adapter,
      collection,
      options,
      schema,
      schemaType
    );
  } catch (error) {
    const wrappedError = handleError(error, {
      userMessage: `Failed to query ${collection}`,
      showNotification: true,
    });

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store && setLoading) {
      self.store.getState().setLoading(collection, false);
    }
  }
}
