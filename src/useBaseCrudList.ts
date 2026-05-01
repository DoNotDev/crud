// packages/features/crud/src/useBaseCrudList.ts

/**
 * @fileoverview useBaseCrudList Hook - Internal Base Hook for List Operations
 * @description Shared implementation for useCrudList and useCrudCardList.
 * Not exported to consumers - internal use only.
 *
 * @version 0.1.0
 * @since 0.0.10
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';

import { useQuery } from '@donotdev/core';
import type {
  AnyEntity,
  FeatureStatus,
  ListSchemaType,
  ScopeConfig,
  QueryOptions,
} from '@donotdev/core';

import { useCrudStore } from './CrudStore';
import { CRUD_OPERATION } from './types';
import { useCrud, getCrudServiceInstance, EMPTY_OPTIMISTIC } from './useCrud';
import { mergeWithOptimistic } from './utils/mergeWithOptimistic';
import { injectScopeFilter, getCurrentScopeValue } from './utils/scopeUtils';

import type { OptimisticMeta, CacheOptions } from './types';
import type { UseCrudOptions } from './useCrud';

/** Cursor cache for server-side pagination */
type CursorCache = Map<number, string | null>;

/** Max items for client-side mode. Beyond this, auto-switches to server pagination. */
const AUTO_CLIENT_LIMIT = 1000;

/** Pagination configuration */
export interface PaginationConfig {
  /**
   * Pagination mode:
   * - `'auto'` (default) — fetches up to 1000 client-side. If total > 1000, auto-switches to server pagination.
   * - `'client'` — fetches all (up to limit), paginates in browser. Best for < 1000 items.
   * - `'server'` — fetches one page at a time via cursor. Required for very large collections.
   */
  mode: 'auto' | 'client' | 'server';
  /** Page number for server-side pagination (1-indexed) */
  page: number;
  /** Page size for server-side pagination */
  pageSize: number;
}

/** Base options for list hooks */
export interface UseBaseCrudListOptions<T> extends UseCrudOptions<T> {
  /** Automatically fetch data on mount (default: true) */
  enabled?: boolean;
  /** Where/orderBy/limit passed to query */
  queryOptions?: QueryOptions;
}

/** Base return type for list hooks */
export interface UseBaseCrudListReturn<T> {
  status: FeatureStatus;
  data: { items: T[]; total?: number } | null;
  /** Convenience: items array (data?.items ?? []) */
  items: T[];
  /** True during initial fetch (show skeletons) */
  loading: boolean;
  /** True during background refetch (show subtle indicator) */
  fetching: boolean;
  error: Error | null;
  /** Manual refresh function */
  mutate: () => Promise<void>;
  /** Alias for mutate (manual refresh) */
  refresh: () => Promise<void>;
  isAvailable: boolean;
  /** Effective pagination mode after auto-detection. 'client' or 'server'. */
  effectiveMode: 'client' | 'server';
}

/**
 * Internal base hook for list operations
 * Used by useCrudList and useCrudCardList
 *
 * @internal Not exported to consumers
 */
export function useBaseCrudList<T extends { id: string } = { id: string }>(
  entityOrCollection: AnyEntity | string,
  schemaType: ListSchemaType,
  pagination: PaginationConfig | null,
  options: UseBaseCrudListOptions<T> = {}
): UseBaseCrudListReturn<T> {
  const enabled = options.enabled ?? true;

  // 1. Feature Status Check (Reactive & Global)
  const status = useCrud('status');
  const isAvailable = status === 'ready';

  // 2. Full Initialization - always call to maintain hook order
  const crud = useCrud<T>(entityOrCollection, options);
  const {
    error: crudError,
    invalidate,
    _collection: collection,
    _schemas: schemas,
    _cacheOptions: cacheOptions,
    _scope: scope,
  } = crud;

  // 3. Optimistic state from store
  const optimistic = useCrudStore(
    (state) => state.collections[collection]?.optimistic || EMPTY_OPTIMISTIC
  ) as Record<string, OptimisticMeta>;

  // 4. Server-side pagination: cursor cache (only for paginated lists)
  const cursorCacheRef = useRef<CursorCache>(new Map([[1, null]]));
  const lastFetchedPageRef = useRef<number>(0);

  // 4b. Auto-mode: start as client, switch to server if total > AUTO_CLIENT_LIMIT
  const [autoSwitchedToServer, setAutoSwitchedToServer] = useState(false);
  const effectiveMode: 'client' | 'server' =
    pagination?.mode === 'auto'
      ? autoSwitchedToServer
        ? 'server'
        : 'client'
      : (pagination?.mode ?? 'client');

  // 5. Get current scope value for dependency tracking
  const scopeValue = getCurrentScopeValue(scope);

  // 6. Build query options
  const queryOptions = useMemo(() => {
    if (!isAvailable || !schemas) return null;
    const service = getCrudServiceInstance();
    if (!service) return null;

    // Get the correct schema based on type
    const schema = schemaType === 'listCard' ? schemas.listCard : schemas.list;

    // Inject scope filter for multi-tenancy
    const scopedQueryOptions = injectScopeFilter(options.queryOptions, scope);

    // No pagination - simple case (useCrudCardList)
    if (!pagination) {
      return service.getListQueryOptions<T>(
        collection,
        scopedQueryOptions,
        schema,
        cacheOptions,
        schemaType
      );
    }

    // Client-side pagination - fetch all (up to AUTO_CLIENT_LIMIT for auto mode)
    if (effectiveMode === 'client') {
      const clientOpts =
        pagination.mode === 'auto' && !scopedQueryOptions?.limit
          ? { ...scopedQueryOptions, limit: AUTO_CLIENT_LIMIT }
          : scopedQueryOptions;
      return service.getListQueryOptions<T>(
        collection,
        clientOpts,
        schema,
        cacheOptions,
        schemaType
      );
    }

    // Server-side pagination - cursor-based
    const cursorCache = cursorCacheRef.current;
    const lastFetchedPage = lastFetchedPageRef.current;
    const { page, pageSize } = pagination;

    let startAfter: string | undefined;
    let itemsToFetch: number;

    if (cursorCache.has(page)) {
      startAfter = cursorCache.get(page) ?? undefined;
      itemsToFetch = pageSize;
    } else if (page > lastFetchedPage && cursorCache.has(lastFetchedPage)) {
      const pagesToFetch = page - lastFetchedPage;
      startAfter = cursorCache.get(lastFetchedPage) ?? undefined;
      itemsToFetch = pagesToFetch * pageSize;
    } else {
      startAfter = undefined;
      itemsToFetch = page * pageSize;
    }

    return service.getListQueryOptions<T>(
      collection,
      { ...scopedQueryOptions, limit: itemsToFetch, startAfter },
      schema,
      cacheOptions,
      schemaType
    );
  }, [
    isAvailable,
    collection,
    cacheOptions,
    schemas ? 'hasSchema' : 'noSchema',
    schemaType,
    effectiveMode,
    pagination?.page,
    pagination?.pageSize,
    options.queryOptions,
    scope?.provider,
    scopeValue,
  ]);

  // 7. useQuery for reactive loading states
  const {
    data: queryData,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryOptions?.queryKey ?? ['crud', collection, 'disabled'],
    queryFn: queryOptions?.queryFn ?? (() => Promise.resolve({ items: [] })),
    staleTime: queryOptions?.staleTime,
    enabled: enabled && !!queryOptions,
  });

  // 7b. Auto-switch: if auto mode and total exceeds what we fetched, flip to server
  useEffect(() => {
    if (
      pagination?.mode === 'auto' &&
      !autoSwitchedToServer &&
      queryData &&
      queryData.total != null &&
      queryData.total > queryData.items.length
    ) {
      setAutoSwitchedToServer(true);
    }
  }, [queryData, pagination?.mode, autoSwitchedToServer]);

  // 8. Process query result and handle server-side pagination cursors
  const processedData = useMemo(() => {
    if (!queryData || !isAvailable) return { items: [], total: undefined };

    let items = queryData.items;

    // Server-side pagination: extract current page and update cursor cache
    if (effectiveMode === 'server' && pagination && items.length > 0) {
      const cursorCache = cursorCacheRef.current;
      const lastFetchedPage = lastFetchedPageRef.current;
      const { page, pageSize } = pagination;

      const totalItemsFetched = items.length;
      const pagesFetched = Math.ceil(totalItemsFetched / pageSize);

      if (pagesFetched > 1 || page > lastFetchedPage) {
        const startPage = cursorCache.has(page) ? page : lastFetchedPage + 1;

        for (let p = startPage; p <= page; p++) {
          const endIndex = (p - startPage + 1) * pageSize - 1;
          if (endIndex < items.length) {
            const lastItemOfPage = items[endIndex] as { id: string };
            cursorCache.set(p + 1, lastItemOfPage.id);
          }
        }
      }

      if (queryData.lastVisible) {
        cursorCache.set(page + 1, queryData.lastVisible);
      }

      lastFetchedPageRef.current = Math.max(lastFetchedPage, page);

      const startIndex = cursorCache.has(page)
        ? 0
        : (page - lastFetchedPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      items = items.slice(startIndex, endIndex);
    }

    // Merge with optimistic updates
    const mergedItems = mergeWithOptimistic(items, optimistic);

    // Calculate adjusted total
    const queryDataIds = new Set(items.map((item) => item.id));
    let optimisticAdditions = 0;
    let optimisticDeletions = 0;

    for (const [id, meta] of Object.entries(optimistic)) {
      if (meta.operation === CRUD_OPERATION.ADD && !queryDataIds.has(id)) {
        optimisticAdditions++;
      } else if (
        meta.operation === CRUD_OPERATION.DELETE &&
        queryDataIds.has(id)
      ) {
        optimisticDeletions++;
      }
    }

    const baseTotal = queryData.total ?? items.length;
    const adjustedTotal = baseTotal + optimisticAdditions - optimisticDeletions;

    return {
      items: mergedItems,
      // Always return total so auto-mode can detect when to switch
      total: adjustedTotal,
    };
  }, [
    queryData,
    optimistic,
    isAvailable,
    effectiveMode,
    pagination?.page,
    pagination?.pageSize,
  ]);

  // 9. Refresh function
  const refreshList = useCallback(async () => {
    if (!isAvailable) return;
    // Reset cursor cache on refresh for server-side pagination
    if (effectiveMode === 'server') {
      cursorCacheRef.current = new Map([[1, null]]);
      lastFetchedPageRef.current = 0;
    }
    await invalidate();
    await refetch();
  }, [invalidate, refetch, isAvailable, effectiveMode]);

  // 10. Graceful degradation — loading: true so consumers show skeletons while CRUD initializes
  if (!isAvailable) {
    const noop = async () => {};
    return {
      status,
      data: { items: [], total: undefined },
      items: [],
      loading: true,
      fetching: false,
      error: crudError,
      mutate: noop,
      refresh: noop,
      isAvailable: false,
      effectiveMode,
    };
  }

  const items = processedData?.items ?? [];

  return {
    status,
    data: processedData,
    items,
    loading: isLoading,
    fetching: isFetching,
    error: queryError ?? crudError,
    mutate: refreshList,
    refresh: refreshList,
    isAvailable: true,
    effectiveMode,
  };
}
