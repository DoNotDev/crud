// packages/features/crud/src/CrudService.cache.ts

/**
 * @fileoverview CrudService cache helpers
 * @description TanStack Query cache read/update helpers used by mutation,
 * query, subscription and optimistic impl files.
 *
 * Cache keys:
 * - `['crud', collection, 'get', id]`            single document
 * - `['crud', collection, 'query', JSON(opts)]`  list + listCard (shared, full visible rows)
 *
 * Prefix `['crud', collection]` fans out across both — used when a mutation
 * must refresh every derived view.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { dndevSchema, QueryClient, QueryOptions } from '@donotdev/core';
import { handleError } from '@donotdev/core';

import { CRUD_OPERATION } from './types';
import type { CrudOperation, CrudServiceInternal } from './types';

/**
 * Cache key of one list query, shared by list and listCard: both read the full
 * visible record (`schemas.get`), and `listFields` / `listCardFields` only choose
 * what each view displays. One network read serves both views and the doc cache.
 */
export function listQueryKey(
  collection: string,
  options: QueryOptions
): readonly ['crud', string, 'query', string] {
  return ['crud', collection, 'query', JSON.stringify(options)];
}

/**
 * The freshest cached list row of one document. List reads hold the full visible
 * record (same read as `get`), so a document already listed opens without a request:
 * the doc query starts from this row (`initialData`) and refetches only once the
 * list entry it came from is stale.
 *
 * @param queryClient - The client that renders (request-scoped on the server)
 * @returns The row and its list entry's `dataUpdatedAt`, or undefined when not listed
 */
export function cachedListRow<T>(
  queryClient: QueryClient,
  collection: string,
  id: string
): { data: T; updatedAt: number } | undefined {
  let found: { data: T; updatedAt: number } | undefined;
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: ['crud', collection, 'query'] })) {
    const items = (query.state.data as { items?: unknown[] } | undefined)
      ?.items;
    const row = items?.find(
      (item) =>
        item != null &&
        typeof item === 'object' &&
        (item as { id?: unknown }).id === id
    );
    if (row && (!found || query.state.dataUpdatedAt > found.updatedAt)) {
      found = { data: row as T, updatedAt: query.state.dataUpdatedAt };
    }
  }
  return found;
}

/** Document with required id field for cache operations */
interface DocumentWithId {
  id: string;
  [key: string]: unknown;
}

/**
 * Update single document GET cache after mutation.
 * Key format: ['crud', collection, 'get', id]
 */
export function updateGetCache<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  data: T | null,
  operation: CrudOperation
): void {
  const queryClient = self.getQueryClient();
  const queryKey = ['crud', collection, 'get', id];

  if (operation === CRUD_OPERATION.DELETE) {
    const query = queryClient.getQueryCache().find({ queryKey, exact: true });
    if (!query) return;
    // Nobody shows it (temp-id cleanup, closed detail page): drop the entry, so the
    // next read asks the backend and a recreated id is not negative-cached.
    if (query.getObserversCount() === 0) {
      queryClient.removeQueries({ queryKey, exact: true });
      return;
    }
    // Displayed: null = "does not exist" (what a read returns). removeQueries would
    // not notify the mounted observers, so the document would stay on screen.
    // Marked stale, not refetched: the next read asks the backend again.
    queryClient.setQueryData(queryKey, null);
    void queryClient.invalidateQueries({
      queryKey,
      exact: true,
      refetchType: 'none',
    });
  } else if (operation === CRUD_OPERATION.SET && data) {
    // Full replacement — do not merge with stale old data
    queryClient.setQueryData(queryKey, data);
  } else if (
    (operation === CRUD_OPERATION.UPDATE || operation === CRUD_OPERATION.ADD) &&
    data
  ) {
    // Partial update — merge new fields onto existing cache entry
    queryClient.setQueryData(queryKey, (old: T | null | undefined) => {
      if (!old) return data;
      return { ...old, ...data };
    });
  }
}

/**
 * Update all caches after mutation (list queries + single document GET cache).
 * Automatically syncs both list and document caches for consistency.
 */
export function updateListCaches<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  data: T | null,
  operation: CrudOperation
): void {
  const queryClient = self.getQueryClient();

  // Also update single document GET cache (for all operations)
  updateGetCache(self, collection, id, data, operation);

  /**
   * INTENTIONAL: Prefix match ['crud', collection] updates BOTH list and get caches.
   * This shares cache across query types to reduce API calls and improve response times.
   * Get queries benefit from list fetches and vice versa.
   * Do NOT narrow to ['crud', collection, 'list'] — that defeats the shared cache optimization.
   */
  queryClient.setQueriesData(
    { queryKey: ['crud', collection] },
    (old: unknown) => {
      // Handle PaginatedQueryResult structure { items: T[], total?: number }
      if (old && typeof old === 'object' && 'items' in old) {
        const paginated = old as { items: DocumentWithId[]; total?: number };
        let updatedItems = paginated.items;

        if (operation === CRUD_OPERATION.DELETE) {
          updatedItems = paginated.items.filter(
            (item: DocumentWithId) =>
              item != null && typeof item === 'object' && item.id !== id
          );
          return {
            ...paginated,
            items: updatedItems,
            // Floor at 0 — total can't go negative if deletes race or cache is stale.
            total: Math.max(0, (paginated.total ?? updatedItems.length) - 1),
          };
        }

        if (operation === CRUD_OPERATION.ADD && data) {
          updatedItems = [
            ...paginated.items,
            { ...data, id } as DocumentWithId,
          ];
          return {
            ...paginated,
            items: updatedItems,
            total: (paginated.total ?? paginated.items.length) + 1,
          };
        }

        if (
          (operation === CRUD_OPERATION.UPDATE ||
            operation === CRUD_OPERATION.SET) &&
          data
        ) {
          const exists = paginated.items.some(
            (item: DocumentWithId) =>
              item != null && typeof item === 'object' && item.id === id
          );
          if (exists) {
            updatedItems = paginated.items.map((item: DocumentWithId) => {
              if (item == null || typeof item !== 'object' || item.id !== id)
                return item;
              // SET = full replacement; UPDATE = partial merge
              return operation === CRUD_OPERATION.SET
                ? ({ ...data, id } as DocumentWithId)
                : { ...item, ...data };
            });
            return { ...paginated, items: updatedItems };
          }
          // Item doesn't exist in this query result, leave unchanged
          return old;
        }

        return old;
      }

      // Fallback: handle plain array (legacy format)
      if (Array.isArray(old)) {
        if (operation === CRUD_OPERATION.DELETE) {
          return old.filter((item: DocumentWithId) => item.id !== id);
        }

        if (operation === CRUD_OPERATION.ADD && data) {
          return [...old, { ...data, id }];
        }

        if (
          (operation === CRUD_OPERATION.UPDATE ||
            operation === CRUD_OPERATION.SET) &&
          data
        ) {
          const exists = old.some(
            (item: DocumentWithId) =>
              item != null && typeof item === 'object' && item.id === id
          );
          if (exists) {
            return old.map((item: DocumentWithId) => {
              if (item == null || typeof item !== 'object' || item.id !== id)
                return item;
              return operation === CRUD_OPERATION.SET
                ? ({ ...data, id } as DocumentWithId)
                : { ...item, ...data };
            });
          }
          return old;
        }
      }

      return old;
    }
  );
}

/**
 * Check uniqueness constraints against cached data (list/listCard queries).
 * For findOrCreate: returns existing item's ID without server call.
 * For strict uniqueness: throws error to block the operation.
 * Returns null if no match found or no cache available.
 */
export function checkUniquenessFromCache<T>(
  self: CrudServiceInternal,
  collection: string,
  data: Record<string, unknown>,
  schema: dndevSchema<T>
): string | null {
  const schemaWithMeta = schema as {
    metadata?: {
      uniqueKeys?: Array<{
        fields: string[];
        findOrCreate?: boolean;
        errorMessage?: string;
      }>;
    };
  };
  const uniqueKeys = schemaWithMeta.metadata?.uniqueKeys;
  if (!uniqueKeys || uniqueKeys.length === 0) return null;

  const queryClient = self.getQueryClient();
  const queries = queryClient.getQueriesData<{ items: DocumentWithId[] }>({
    queryKey: ['crud', collection],
  });

  // Collect all cached items from list/listCard queries
  const allItems: DocumentWithId[] = [];
  for (const [, queryData] of queries) {
    if (queryData && typeof queryData === 'object' && 'items' in queryData) {
      allItems.push(...queryData.items);
    } else if (Array.isArray(queryData)) {
      allItems.push(...(queryData as DocumentWithId[]));
    }
  }

  if (allItems.length === 0) return null;

  const payload = data;

  for (const uniqueKey of uniqueKeys) {
    // Skip if payload doesn't have all uniqueKey fields
    const allFieldsHaveValues = uniqueKey.fields.every(
      (field) => payload[field] != null && payload[field] !== ''
    );
    if (!allFieldsHaveValues) continue;

    // Find matching item (case-insensitive for strings)
    const match = allItems.find((item) =>
      uniqueKey.fields.every((field) => {
        const payloadVal =
          typeof payload[field] === 'string'
            ? payload[field].toLowerCase()
            : payload[field];
        const itemVal =
          typeof item[field] === 'string'
            ? item[field].toLowerCase()
            : item[field];
        return payloadVal === itemVal;
      })
    );

    if (match) {
      if (uniqueKey.findOrCreate) {
        // Return existing ID silently — caller skips server call
        return match.id;
      }
      // Strict uniqueness violation
      const fieldNames = uniqueKey.fields.join(' + ');
      throw handleError(
        new Error(uniqueKey.errorMessage || `Duplicate ${fieldNames}`),
        {
          userMessage:
            uniqueKey.errorMessage ||
            `A record with this ${fieldNames} already exists`,
          showNotification: true,
        }
      );
    }
  }

  return null;
}

/**
 * Get an item from any list cache for this collection.
 * Used to get previous data for optimistic operations when individual GET cache is empty.
 */
export function getItemFromListCache<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string
): T | null {
  const queryClient = self.getQueryClient();
  const queries = queryClient.getQueriesData<{ items: DocumentWithId[] }>({
    queryKey: ['crud', collection],
  });

  for (const [, data] of queries) {
    if (data?.items) {
      const item = data.items.find((i) => i.id === id);
      if (item) return item as T;
    }
  }

  return null;
}

/**
 * Invalidate all cached queries for a collection
 */
export async function invalidateCollectionImpl(
  self: CrudServiceInternal,
  collection: string
): Promise<void> {
  const queryClient = self.getQueryClient();
  await queryClient.invalidateQueries({
    queryKey: ['crud', collection],
  });
}
