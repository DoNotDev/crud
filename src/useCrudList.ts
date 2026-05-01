// packages/features/crud/src/useCrudList.ts

/**
 * @fileoverview useCrudList Hook - Collection Management with Pagination
 * @description Specialized hook for fetching and managing lists of entities.
 * Supports both client-side and server-side pagination.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo } from 'react';

import type { AnyEntity, FeatureStatus, InferEntityRow } from '@donotdev/core';
import type { QueryOptions } from '@donotdev/core';

import { useCrudFilters } from './hooks/useCrudFilters';
import {
  useBaseCrudList,
  type UseBaseCrudListOptions,
  type PaginationConfig,
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

/** Options for the {@link useCrudList} hook. */
export interface UseCrudListOptions<T> extends UseCrudOptions<T> {
  /** Automatically fetch data on mount (default: true) */
  enabled?: boolean;
  /**
   * Pagination mode:
   * - `'auto'` (default) — fetches up to 1000 client-side. If total > 1000, auto-switches to server pagination.
   * - `'client'` — forces client-side (fetches all, paginates in browser).
   * - `'server'` — forces server-side (cursor pagination, one page at a time).
   */
  pagination?: 'auto' | 'client' | 'server';
  /** Page number for server-side pagination (1-indexed, default: 1) */
  page?: number;
  /** Page size for server-side pagination (default: 10) */
  pageSize?: number;
  /** Where/orderBy/limit passed to list query (merged with pagination on server) */
  queryOptions?: QueryOptions;
  /** Client-side search query. Applied after filters. */
  searchQuery?: string;
  /** Client-side sort: field config, comparator function, or null to disable. Defaults to entity.defaultSort. */
  clientSort?: ClientSort<T> | ClientSortConfig | null;
}

/** Return type of the {@link useCrudList} hook. */
export interface UseCrudListReturn<T> {
  status: FeatureStatus;
  data: { items: T[]; total?: number } | null;
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
  /** Effective pagination mode after auto-detection ('client' or 'server'). */
  effectiveMode: 'client' | 'server';
}

/**
 * React hook for fetching and managing a list of entities
 *
 * Use this hook for:
 * - Admin tables
 * - Data grids
 * - Lists of items
 *
 * @template T - Document type
 * @param entityOrCollection - Entity definition or collection name
 * @param options - Configuration options
 * @returns List data and control methods
 *
 * @example
 * ```typescript
 * // Basic usage — processed has filters + search + sort applied
 * const { processed, loading, refresh } = useCrudList(carEntity, {
 *   searchQuery: search,
 * });
 *
 * // With explicit sort
 * const { processed } = useCrudList(carEntity, {
 *   searchQuery: search,
 *   clientSort: { field: 'price', direction: 'asc' },
 * });
 * ```
 */
export function useCrudList<E extends AnyEntity>(
  entity: E,
  options?: UseCrudListOptions<InferEntityRow<E>>
): UseCrudListReturn<InferEntityRow<E>>;
export function useCrudList<
  T extends { id: string } & Record<string, unknown> = Record<
    string,
    unknown
  > & { id: string },
>(collection: string, options?: UseCrudListOptions<T>): UseCrudListReturn<T>;
export function useCrudList<
  T extends { id: string } & Record<string, unknown> = Record<
    string,
    unknown
  > & { id: string },
>(
  entityOrCollection: AnyEntity | string,
  options: UseCrudListOptions<T> = {}
): UseCrudListReturn<T> {
  const paginationMode = options.pagination ?? 'auto';
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 10;

  // Build pagination config
  const pagination: PaginationConfig = {
    mode: paginationMode,
    page,
    pageSize,
  };

  // Extract base options (without pagination-specific props)
  const baseOptions: UseBaseCrudListOptions<T> = {
    enabled: options.enabled,
    queryOptions: options.queryOptions,
    schema: options.schema,
    entity: options.entity,
    staleTime: options.staleTime,
    noCache: options.noCache,
  };

  const baseResult = useBaseCrudList<T>(
    entityOrCollection,
    'list',
    pagination,
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
    let result = baseResult.items as (T & Record<string, any>)[];

    // Apply filters (only if entity is available for field type lookup)
    if (entity && Object.keys(filters).length > 0) {
      result = applyFilters(result, filters, entity);
    }

    // Apply search
    if (entity && options.searchQuery) {
      result = applySearch(result, options.searchQuery, entity);
    }

    const total = result.length;

    // Apply sort
    if (resolvedSort) {
      result = applySort(result, resolvedSort);
    }

    return { processed: result as T[], filteredTotal: total };
  }, [baseResult.items, filters, options.searchQuery, resolvedSort, entity]);

  return {
    ...baseResult,
    processed,
    filteredTotal,
  };
}
