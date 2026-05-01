// packages/features/crud/src/useCrudCardList.ts

/**
 * @fileoverview useCrudCardList Hook - Optimized Card List Management
 * @description Specialized hook for fetching lists of entities optimized for card views.
 * Fetches only the fields defined in `listCardFields` (or `listFields`) to reduce payload size.
 *
 * **Pagination strategy:** This hook fetches all documents at once and applies client-side
 * filtering, sorting, and search. This is the recommended approach for collections under
 * ~1,000 documents — it provides instant search/filter UX with no round-trips. For larger
 * collections (1,000+ docs), consider server-side cursor pagination via `queryOptions`.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo } from 'react';

import type {
  AnyEntity,
  FeatureStatus,
  InferEntityRow,
  QueryOptions,
} from '@donotdev/core';

import { useCrudFilters } from './hooks/useCrudFilters';
import {
  useBaseCrudList,
  type UseBaseCrudListOptions,
} from './useBaseCrudList';
import {
  applyFilters,
  applySearch,
  applySort,
} from './utils/clientListProcessing';

import type { UseCrudOptions } from './useCrud';
import type {
  ClientSort,
  ClientSortConfig,
} from './utils/clientListProcessing';

/** Options for the {@link useCrudCardList} hook. */
export interface UseCrudCardListOptions<T> extends UseCrudOptions<T> {
  /** Automatically fetch data on mount (default: true) */
  enabled?: boolean;
  /** Where/orderBy/limit passed to listCard query */
  queryOptions?: QueryOptions;
  /** Client-side search query. Applied after filters. */
  searchQuery?: string;
  /** Client-side sort: field config, comparator function, or null to disable. Defaults to entity.defaultSort. */
  clientSort?: ClientSort<T> | ClientSortConfig | null;
}

/** Return type of the {@link useCrudCardList} hook. */
export interface UseCrudCardListReturn<T> {
  status: FeatureStatus;
  data: { items: T[] } | null;
  /** Convenience: items array (data?.items ?? []) — raw + optimistic, no client processing */
  items: T[];
  /** Items after client-side filters + search + sort — ready to render */
  processed: T[];
  /** Count of items after filters + search (before pagination) */
  filteredTotal: number;
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
}

/**
 * React hook for fetching a list of entities optimized for Card views
 *
 * Use this hook for:
 * - Public-facing grids
 * - Dashboard widgets
 * - Summary lists
 *
 * @template T - Document type
 * @param entityOrCollection - Entity definition or collection name
 * @param options - Configuration options
 * @returns List data and control methods
 *
 * @example
 * ```typescript
 * // processed has filters + search + sort applied
 * const { processed, loading } = useCrudCardList(carEntity, {
 *   searchQuery: search,
 * });
 * ```
 */
export function useCrudCardList<E extends AnyEntity>(
  entity: E,
  options?: UseCrudCardListOptions<InferEntityRow<E>>
): UseCrudCardListReturn<InferEntityRow<E>>;
export function useCrudCardList<
  T extends { id: string } & Record<string, unknown> = Record<
    string,
    unknown
  > & { id: string },
>(
  collection: string,
  options?: UseCrudCardListOptions<T>
): UseCrudCardListReturn<T>;
export function useCrudCardList<
  T extends { id: string } & Record<string, unknown> = Record<
    string,
    unknown
  > & { id: string },
>(
  entityOrCollection: AnyEntity | string,
  options: UseCrudCardListOptions<T> = {}
): UseCrudCardListReturn<T> {
  // Extract base options
  const baseOptions: UseBaseCrudListOptions<T> = {
    enabled: options.enabled,
    queryOptions: options.queryOptions,
    schema: options.schema,
    entity: options.entity,
    staleTime: options.staleTime,
    noCache: options.noCache,
  };

  // Use base hook with 'listCard' schema and no pagination
  const result = useBaseCrudList<T>(
    entityOrCollection,
    'listCard',
    null,
    baseOptions
  );

  // Resolve entity for client processing
  const entity =
    typeof entityOrCollection === 'string' ? null : entityOrCollection;
  const collection = entity?.collection ?? (entityOrCollection as string);

  // Read filters from CrudStore
  const { filters } = useCrudFilters({ collection });

  // Resolve sort: explicit > entity.defaultSort > none
  const resolvedSort =
    options.clientSort === null
      ? null
      : (options.clientSort ?? entity?.defaultSort ?? null);

  // Client-side processing pipeline: filters → search → sort
  const { processed, filteredTotal } = useMemo(() => {
    let items = result.items as (T & Record<string, any>)[];

    // Apply filters (only if entity is available for field type lookup)
    if (entity && Object.keys(filters).length > 0) {
      items = applyFilters(items, filters, entity);
    }

    // Apply search
    if (entity && options.searchQuery) {
      items = applySearch(items, options.searchQuery, entity);
    }

    const total = items.length;

    // Apply sort
    if (resolvedSort) {
      items = applySort(items, resolvedSort);
    }

    return { processed: items as T[], filteredTotal: total };
  }, [result.items, filters, options.searchQuery, resolvedSort, entity]);

  // Return without total (card lists don't need pagination info)
  return {
    status: result.status,
    data: result.data ? { items: result.data.items } : null,
    items: result.items,
    processed,
    filteredTotal,
    loading: result.loading,
    fetching: result.fetching,
    error: result.error,
    mutate: result.mutate,
    refresh: result.refresh,
    isAvailable: result.isAvailable,
  };
}
