// packages/features/crud/src/hooks/useEntityFavorites.ts

/**
 * @fileoverview useEntityFavorites Hook - Entity Favorites Management
 * @description Reusable hook for managing entity favorites (e.g., saved cars, favorite products)
 * Uses localStorage with SSR safety and cross-tab sync.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useCallback } from 'react';

import { useLocalStorage } from '@donotdev/core';

/** Options for the {@link useEntityFavorites} hook. */
export interface UseEntityFavoritesOptions {
  /** Storage key (default: 'entity-favorites') */
  storageKey?: string;
  /** Entity collection name (e.g., 'cars', 'products') - used to namespace favorites */
  collection?: string;
}

/** Return type of the {@link useEntityFavorites} hook. */
export interface UseEntityFavoritesReturn {
  /** Array of favorited entity IDs */
  favorites: string[];
  /** Check if an entity is favorited */
  isFavorite: (id: string) => boolean;
  /** Toggle favorite status for an entity */
  toggleFavorite: (id: string) => void;
  /** Add entity to favorites */
  addFavorite: (id: string) => void;
  /** Remove entity from favorites */
  removeFavorite: (id: string) => void;
  /** Clear all favorites */
  clearFavorites: () => void;
  /** Filter function for use with EntityCardList/EntityList (from @donotdev/ui) filter prop */
  favoritesFilter: (item: { id: string }) => boolean;
  /** Whether favorites are loaded from localStorage */
  isLoaded: boolean;
}

/**
 * Hook for managing entity favorites
 *
 * @example
 * ```typescript
 * // In detail page
 * const { isFavorite, toggleFavorite } = useEntityFavorites({ collection: 'cars' });
 *
 * <Button onClick={() => toggleFavorite(carId)}>
 *   {isFavorite(carId) ? 'Saved' : 'Save'}
 * </Button>
 * ```
 *
 * @example
 * ```typescript
 * // In list page with filter (EntityCardList from @donotdev/ui)
 * const { favoritesFilter } = useEntityFavorites({ collection: 'cars' });
 * const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
 *
 * <EntityCardList
 *   entity={carEntity}
 *   filter={showFavoritesOnly ? favoritesFilter : undefined}
 * />
 * ```
 */
export function useEntityFavorites(
  options: UseEntityFavoritesOptions = {}
): UseEntityFavoritesReturn {
  const { storageKey, collection = 'entities' } = options;

  // Storage key: use provided key or generate from collection
  const key = storageKey || `favorites-${collection}`;

  // Use localStorage hook for reactive state
  const {
    value: favorites,
    setValue: setFavorites,
    isLoaded,
  } = useLocalStorage<string[]>(key, {
    defaultValue: [],
  });

  // Check if entity is favorited
  const isFavorite = useCallback(
    (id: string): boolean => {
      return favorites.includes(id);
    },
    [favorites]
  );

  // Toggle favorite status
  const toggleFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        if (prev.includes(id)) {
          return prev.filter((favoriteId) => favoriteId !== id);
        }
        return [...prev, id];
      });
    },
    [setFavorites]
  );

  // Add to favorites
  const addFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      });
    },
    [setFavorites]
  );

  // Remove from favorites
  const removeFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => prev.filter((favoriteId) => favoriteId !== id));
    },
    [setFavorites]
  );

  // Clear all favorites
  const clearFavorites = useCallback(() => {
    setFavorites([]);
  }, [setFavorites]);

  // Filter function for EntityCardList/EntityList (from @donotdev/ui)
  const favoritesFilter = useCallback(
    (item: { id: string }): boolean => {
      return favorites.includes(item.id);
    },
    [favorites]
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
    favoritesFilter,
    isLoaded,
  };
}
