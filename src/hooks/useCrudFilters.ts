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

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getEntityByCollection } from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

import { peekFilters, useCrudStore } from '../CrudStore';
import type { FilterState } from '../types';

/** Options for the {@link useCrudFilters} hook. */
export interface UseCrudFiltersOptions {
  /**
   * Entity collection name (e.g., 'cars', 'products'): the filter state the lists
   * of that collection apply. Any other key (an `EntityFilters` `filterKey`) holds
   * its own, separate filter state.
   */
  collection: string;
  /**
   * Sync this filter state with the URL (`f_<field>` params: shareable links,
   * back/forward). Default: `true` when `collection` is the collection of an entity
   * defined with `defineEntity` (the page list's filter state), `false` for any other
   * key (pickers, dialogs). One URL-synced filter state per page: set `false` on the
   * others. `true` on a custom key needs `entity`.
   * @since 0.3.0
   */
  urlSync?: boolean;
  /**
   * Entity whose fields the URL params encode, for `urlSync: true`.
   * Default: the entity of `collection`.
   * @since 0.3.0
   */
  entity?: AnyEntity;
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
 * Hook for managing collection filters from CrudStore.
 * URL-synced keys (see {@link UseCrudFiltersOptions.urlSync}) seed from the URL, write
 * their changes to it (debounced 500ms, `history.replaceState`) and follow URL changes.
 * Render is pure: the first render reads the URL without writing the store, the mount
 * effect seeds it; server render and hydration show no filters.
 *
 * @example
 * ```typescript
 * const { filters, setFilters } = useCrudFilters({ collection: 'cars' });
 *
 * // EntityFilters reads and writes the same state (key: the entity's collection)
 * <EntityFilters entity={carEntity} />
 *
 * // Picker filters: own key, never in the URL (default for a non-collection key)
 * useCrudFilters({ collection: 'products#picker' });
 * ```
 */
// Stable empty object to avoid infinite re-renders
const emptyFilters: FilterState = {};

export function useCrudFilters(
  options: UseCrudFiltersOptions
): UseCrudFiltersReturn {
  const { collection, urlSync, entity } = options;

  // URL sync mode of this key (before the first read, which decodes the URL)
  if (urlSync === false) {
    useCrudStore.getState().setFilterUrlSync(collection, null);
  } else if (urlSync === true) {
    const urlEntity = entity ?? getEntityByCollection(collection);
    if (!urlEntity) {
      throw new Error(
        `useCrudFilters: urlSync on "${collection}" needs the entity whose fields the URL params encode (pass \`entity\`).`
      );
    }
    useCrudStore.getState().setFilterUrlSync(collection, urlEntity);
  }

  // Seed the store from the URL on mount, outside render (a store write during render
  // re-renders every subscriber mid-render). Also re-reads a state that predates this
  // page's URL (a link without params, another `?f_…` link). Later URL changes:
  // CrudStore listener.
  useEffect(() => {
    useCrudStore.getState().syncFiltersFromUrl(collection);
  }, [collection]);

  // Read filters: the stored state, or the URL's until the mount effect seeds it
  // (first client paint already filtered). Server render and hydration: no filters
  // (the server has no URL state), the client snapshot follows right after.
  const filters = useSyncExternalStore(
    useCrudStore.subscribe,
    () => peekFilters(collection),
    () => emptyFilters
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
