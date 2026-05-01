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
  dndevSchema,
  QueryOptions,
  PaginatedQueryResult,
  ListSchemaType,
} from '@donotdev/core';
import { LIST_SCHEMA_TYPE, handleError } from '@donotdev/core';

import {
  assertCanAccess,
  ensureAdapter,
  getPiiFields,
  withResilience,
} from './CrudService.internal';
import type { CacheOptions, CrudServiceInternal } from './types';

/** Default stale time - data never becomes stale. Mutations handle cache updates. */
const DEFAULT_STALE_TIME = Infinity;

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
  const adapter = self.adapter;
  const initFn = () => ensureAdapter(self);

  // Single cache key for list + listCard — one network read shared by both
  return {
    queryKey: [
      'crud',
      collection,
      'query',
      JSON.stringify(queryOptions),
    ] as const,
    queryFn: async (): Promise<PaginatedQueryResult<T>> => {
      if (!adapter) await initFn();
      if (!self.adapter) throw new Error('Adapter not initialized');
      const resolvedAdapter = self.adapter;
      return withResilience(() =>
        resolvedAdapter.query<T>(collection, queryOptions, schema, schemaType)
      );
    },
    staleTime: cacheOptions?.staleTime ?? DEFAULT_STALE_TIME,
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
  const adapter = self.adapter;
  const initFn = () => ensureAdapter(self);

  return {
    queryKey: ['crud', collection, 'get', id] as const,
    queryFn: async (): Promise<T | null> => {
      if (!adapter) await initFn();
      if (!self.adapter) throw new Error('Adapter not initialized');
      const resolvedAdapter = self.adapter;
      return withResilience(() =>
        resolvedAdapter.get<T>(collection, id, schema)
      );
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
    assertCanAccess(self, collection, schema);
    const adapter = self.adapter;
    const data = await withResilience(() =>
      adapter.get<T>(collection, id, schema)
    );

    // SOC2: decrypt PII fields after read (mirrors encryptPii on write)
    if (data && self.security) {
      const piiFields = getPiiFields(schema);
      if (piiFields.length > 0) {
        return self.security.decryptPii(
          data as unknown as Record<string, unknown>,
          piiFields
        ) as unknown as T;
      }
    }

    return data;
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
    assertCanAccess(self, collection, schema);
    const adapter = self.adapter;
    const result = await withResilience(() =>
      adapter.query<T>(collection, options, schema, schemaType)
    );

    // SOC2: decrypt PII fields after read (mirrors encryptPii on write)
    if (self.security && result.items.length > 0) {
      const piiFields = getPiiFields(schema);
      if (piiFields.length > 0) {
        result.items = result.items.map(
          (item) =>
            self.security!.decryptPii(
              item as unknown as Record<string, unknown>,
              piiFields
            ) as unknown as T
        );
      }
    }

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
    if (self.store && setLoading) {
      self.store.getState().setLoading(collection, false);
    }
  }
}
