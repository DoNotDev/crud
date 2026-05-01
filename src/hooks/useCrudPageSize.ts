// packages/features/crud/src/hooks/useCrudPageSize.ts

/**
 * @fileoverview useCrudPageSize Hook - Persistent Page Size per Collection
 * @description Stores items-per-page preference in CrudStore so it survives navigation.
 * Follows the same pattern as useCrudFilters.
 *
 * @version 0.1.0
 * @since 0.0.26
 * @author AMBROISE PARK Consulting
 */

import { useCrudStore } from '../CrudStore';

/** Options for the {@link useCrudPageSize} hook. */
export interface UseCrudPageSizeOptions {
  /** Entity collection name (e.g., 'cars', 'products') */
  collection: string;
  /** Default page size when no preference is stored (default: 12) */
  defaultPageSize?: number;
}

/** Return type of the {@link useCrudPageSize} hook. */
export interface UseCrudPageSizeReturn {
  /** Current page size (from store or default) */
  pageSize: number;
  /** Persist a new page size preference */
  setPageSize: (pageSize: number) => void;
}

/** Default items per page when no preference is stored */
const DEFAULT_PAGE_SIZE = 12;

/**
 * Hook for managing per-collection page size preference from CrudStore
 *
 * @example
 * ```typescript
 * const { pageSize, setPageSize } = useCrudPageSize({ collection: 'cars' });
 *
 * <DataTable
 *   pageSize={pageSize}
 *   onPageSizeChange={setPageSize}
 * />
 * ```
 */
export function useCrudPageSize(
  options: UseCrudPageSizeOptions
): UseCrudPageSizeReturn {
  const { collection, defaultPageSize = DEFAULT_PAGE_SIZE } = options;

  const pageSize = useCrudStore(
    (state) => state.collections[collection]?.ui?.pageSize ?? defaultPageSize
  );

  const setPageSize = (newPageSize: number) => {
    useCrudStore.getState().setPageSize(collection, newPageSize);
  };

  return { pageSize, setPageSize };
}
