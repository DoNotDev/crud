// packages/features/crud/src/hooks/useCrudFilters.ts

/**
 * @fileoverview useCrudFilters Hook - Collection Filters Management
 * @description Reusable hook for managing collection filters from CrudStore
 * Filters persist across navigation and are stored globally per collection.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useCallback } from 'react';

import { useCrudStore } from '../CrudStore';

import type { FilterState } from '../types';

/** Options for the {@link useCrudFilters} hook. */
export interface UseCrudFiltersOptions {
  /** Entity collection name (e.g., 'cars', 'products') */
  collection: string;
}

/** Return type of the {@link useCrudFilters} hook. */
export interface UseCrudFiltersReturn {
  /** Current filter state */
  filters: FilterState;
  /** Update filters */
  setFilters: (filters: FilterState) => void;
  /** Whether favorites-only toggle is enabled */
  showFavoritesOnly: boolean;
  /** Toggle favorites-only filter */
  setShowFavoritesOnly: (show: boolean) => void;
}

/**
 * Hook for managing collection filters from CrudStore
 *
 * @example
 * ```typescript
 * const { filters, setFilters } = useCrudFilters({ collection: 'cars' });
 *
 * <EntityFilters
 *   entity={carEntity}
 *   data={data}
 *   filters={filters}
 *   onFiltersChange={setFilters}
 * />
 * ```
 */
// Stable empty object to avoid infinite re-renders
const emptyFilters: FilterState = {};

export function useCrudFilters(
  options: UseCrudFiltersOptions
): UseCrudFiltersReturn {
  const { collection } = options;

  // Seed from URL on first access (triggers store hydration if URL has filter params)
  if (!useCrudStore.getState().collections[collection]?.ui?.filters) {
    useCrudStore.getState().getFilters(collection);
  }

  // Read filters from CrudStore
  const filters = useCrudStore(
    (state) => state.collections[collection]?.ui?.filters ?? emptyFilters
  );

  // Update filters in CrudStore
  const setFilters = useCallback(
    (newFilters: FilterState) => {
      useCrudStore.getState().setFilters(collection, newFilters);
    },
    [collection]
  );

  // Read favorites toggle from CrudStore
  const showFavoritesOnly = useCrudStore(
    (state) => state.collections[collection]?.ui?.showFavoritesOnly ?? false
  );

  // Update favorites toggle in CrudStore
  const setShowFavoritesOnly = useCallback(
    (show: boolean) => {
      useCrudStore.getState().setShowFavoritesOnly(collection, show);
    },
    [collection]
  );

  return {
    filters,
    setFilters,
    showFavoritesOnly,
    setShowFavoritesOnly,
  };
}
