// packages/features/crud/src/useCrudDoc.ts

/**
 * @fileoverview useCrudDoc Hook - Reactive Single Document
 * @description Reads one document through the TanStack Query cache and stays in sync
 * with it: every create / update / delete (optimistic or confirmed) and every
 * subscription write re-renders the consumer. Single-document counterpart of useCrudList.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { useCallback, useMemo } from 'react';

import {
  FEATURE_STATUS,
  isClient,
  useQuery,
  useQueryClient,
} from '@donotdev/core';
import type { AnyEntity, FeatureStatus, InferEntityRow } from '@donotdev/core';

import { cachedListRow } from './CrudService.cache';
import { useCrudStore } from './CrudStore';
import type { OptimisticMeta } from './types';
import { useCrud, getCrudServiceInstance } from './useCrud';
import type { UseCrudOptions } from './useCrud';
import { useServerPrefetch } from './useServerPrefetch';
import { applyOptimisticToDoc } from './utils/mergeWithOptimistic';
import { useRowTranslator } from './utils/useRowTranslator';

/**
 * Options for the {@link useCrudDoc} hook.
 * No `noCache`: the hook is a view of the shared cache entry (use `refresh()` to re-read).
 */
export interface UseCrudDocOptions<T> extends Omit<
  UseCrudOptions<T>,
  'noCache'
> {
  /** Fetch automatically when `id` is set (default: true) */
  enabled?: boolean;
}

/** Return type of the {@link useCrudDoc} hook. */
export interface UseCrudDocReturn<T> {
  status: FeatureStatus;
  /**
   * The document, with pending optimistic changes applied.
   * null while loading, without `id`, or when no document exists.
   */
  data: T | null;
  /** True during the initial fetch, or while CRUD initializes with an `id` to read */
  loading: boolean;
  /** True during a background refetch (show a subtle indicator) */
  fetching: boolean;
  /** True once the read settled and no document exists for `id` */
  notFound: boolean;
  /** Read error (access denied, network, adapter) */
  error: Error | null;
  /** Re-read the document from the backend (no-op without `id` or while CRUD is unavailable) */
  refresh: () => Promise<void>;
  isAvailable: boolean;
}

/**
 * React hook for reading one document, reactive to the CRUD cache.
 *
 * Use this hook for:
 * - Detail / view pages
 * - Any component showing a document that may be edited elsewhere on the page
 *
 * Shares the cache key `['crud', collection, 'get', id]` with `useCrud().get()`
 * and every mutation, so an edit made anywhere shows up here without a refetch.
 * Pass `null` / `undefined` as `id` to wait (no fetch, not loading).
 *
 * @template T - Document type
 * @param entityOrCollection - Entity definition or collection name
 * @param id - Document id; null/undefined disables the read
 * @param options - Configuration options
 * @returns The document and its read state
 *
 * @example
 * ```tsx
 * const { data: car, loading, notFound } = useCrudDoc(carEntity, carId);
 * if (loading) return <Spinner />;
 * if (notFound) return <Text>{t('notFound')}</Text>;
 * return <Text>{car?.model}</Text>;
 * ```
 */
export function useCrudDoc<E extends AnyEntity>(
  entity: E,
  id: string | null | undefined,
  options?: UseCrudDocOptions<InferEntityRow<E>>
): UseCrudDocReturn<InferEntityRow<E>>;
export function useCrudDoc<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  collection: string,
  id: string | null | undefined,
  options?: UseCrudDocOptions<T>
): UseCrudDocReturn<T>;
export function useCrudDoc<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  entityOrCollection: AnyEntity | string,
  id: string | null | undefined,
  options?: UseCrudDocOptions<T>
): UseCrudDocReturn<T>;
export function useCrudDoc<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  entityOrCollection: AnyEntity | string,
  id: string | null | undefined,
  options: UseCrudDocOptions<T> = {}
): UseCrudDocReturn<T> {
  const enabled = options.enabled ?? true;

  // 1. Feature status (global) + collection setup — always called (hook order)
  const status = useCrud('status');
  const isAvailable = status === FEATURE_STATUS.READY;
  const {
    _collection: collection,
    _schemas: schemas,
    _cacheOptions: cacheOptions,
    _scope: scope,
  } = useCrud<T>(entityOrCollection, options);

  // 2. Pending optimistic operation on this document
  const optimistic = useCrudStore((state) =>
    id ? state.collections[collection]?.optimistic[id] : undefined
  ) as OptimisticMeta | undefined;

  // 3. Query descriptor — same key and read path as get()
  const service = isAvailable ? getCrudServiceInstance() : null;
  const query =
    service && schemas && id
      ? service.getDocQueryOptions<T>(collection, id, schemas.get, cacheOptions)
      : null;

  // 4. Subscribe to the cache entry. A document already in a list cache (full visible
  // record) starts from that row: no request until the list entry is stale.
  const queryClient = useQueryClient();
  const listed =
    query && id ? cachedListRow<T>(queryClient, collection, id) : undefined;
  const {
    data: queryData,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery<T | null>({
    // `null` id slot: cannot collide with a real document id
    queryKey: query?.queryKey ?? ['crud', collection, 'get', null],
    queryFn: query?.queryFn ?? (() => Promise.resolve(null)),
    staleTime: query?.staleTime,
    ...(listed && {
      initialData: listed.data,
      initialDataUpdatedAt: listed.updatedAt,
    }),
    enabled: enabled && !!query,
  });

  // 5. Server render: fetch before rendering (see useServerPrefetch)
  useServerPrefetch(query, enabled, scope);

  // 5b. Translated fields in the current language (cache keeps stored rows)
  const translateDoc = useRowTranslator(entityOrCollection, options);
  const data = useMemo(
    () => translateDoc(applyOptimisticToDoc(queryData ?? null, optimistic)),
    [translateDoc, queryData, optimistic]
  );
  const onServer = !isClient();

  // Stable: consumers may list it in effect dependencies. Guarded: refetch() runs even a
  // disabled query, which would cache the placeholder's null under the shared no-id key.
  const hasQuery = !!query;
  const refresh = useCallback(async () => {
    if (!hasQuery) return;
    await refetch();
  }, [refetch, hasQuery]);

  // 6. Not ready. Initializing with an id to read = loading (skeleton); degraded
  // (consent declined, feature absent) = nothing will load, so not loading.
  if (!isAvailable) {
    return {
      status,
      data: null,
      loading: status === FEATURE_STATUS.INITIALIZING && enabled && !!id,
      fetching: false,
      notFound: false,
      error: null,
      refresh,
      isAvailable: false,
    };
  }

  // Server render: no data = loading (the browser's first pass, which fetches on mount,
  // reports loading too), and errors stay with the browser, which retries the read.
  return {
    status,
    data,
    loading: onServer
      ? enabled && !!query && queryData === undefined
      : isLoading,
    fetching: onServer ? false : isFetching,
    notFound: queryData !== undefined && data === null,
    error: onServer ? null : queryError,
    refresh,
    isAvailable: true,
  };
}
