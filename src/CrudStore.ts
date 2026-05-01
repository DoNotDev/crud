// packages/features/crud/src/CrudStore.ts

/**
 * @fileoverview CRUD Store - Zustand store for optimistic state management
 * @description Tracks ONLY optimistic operations. TanStack Query owns query results.
 *
 * **Architecture:**
 * - Pure Zustand store (no persist)
 * - Direct updates from CrudService
 * - Loading states per collection
 * - Error states per collection
 * - Optimistic operations with rollback data
 *
 * **NOT responsible for:**
 * - Query results caching (TanStack Query owns this)
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { createDoNotDevStore, isClient } from '@donotdev/core';

import { OPTIMISTIC_STATUSES, CRUD_OPERATION } from './types';

import type {
  OptimisticMeta,
  CrudState,
  CrudActions,
  CrudServiceInterface,
  FilterState,
  CollectionUIState,
} from './types';

// ===================================================================
// URL ↔ Filter Sync (pure functions, no hooks)
// ===================================================================

let urlSyncTimer: ReturnType<typeof setTimeout> | null = null;

const FILTER_PREFIX = 'f_';

/** Serialize FilterState to URL search params */
function filtersToUrl(filters: FilterState): void {
  if (!isClient()) return;
  const current = new URLSearchParams(location.search);
  // Remove existing filter params
  [...current.keys()]
    .filter((k) => k.startsWith(FILTER_PREFIX))
    .forEach((k) => current.delete(k));
  // Write new filter params
  for (const [field, value] of Object.entries(filters)) {
    if (typeof value === 'string') {
      current.set(`${FILTER_PREFIX}${field}`, value);
    } else if (Array.isArray(value)) {
      current.set(`${FILTER_PREFIX}${field}`, value.join(','));
    } else {
      if (value.min) current.set(`${FILTER_PREFIX}${field}_min`, value.min);
      if (value.max) current.set(`${FILTER_PREFIX}${field}_max`, value.max);
    }
  }
  const search = current.toString();
  history.replaceState(
    null,
    '',
    `${location.pathname}${search ? `?${search}` : ''}`
  );
}

/** Deserialize URL search params to FilterState */
function filtersFromUrl(): FilterState {
  if (!isClient()) return {};
  const params = new URLSearchParams(location.search);
  const filters: FilterState = {};
  const ranges = new Map<string, { min?: string; max?: string }>();

  params.forEach((value, key) => {
    if (!key.startsWith(FILTER_PREFIX)) return;
    const rest = key.slice(FILTER_PREFIX.length);

    if (rest.endsWith('_min')) {
      const field = rest.slice(0, -4);
      const r = ranges.get(field) ?? {};
      r.min = value;
      ranges.set(field, r);
    } else if (rest.endsWith('_max')) {
      const field = rest.slice(0, -4);
      const r = ranges.get(field) ?? {};
      r.max = value;
      ranges.set(field, r);
    } else if (value.includes(',')) {
      filters[rest] = value.split(',');
    } else {
      filters[rest] = value;
    }
  });

  ranges.forEach((range, field) => {
    filters[field] = range;
  });
  return filters;
}

/** Default UI state for collections */
const DEFAULT_UI_STATE: CollectionUIState = {
  filters: {},
  showFavoritesOnly: false,
};

/** Create default collection state */
function createDefaultCollectionState() {
  return {
    loading: false,
    error: null,
    lastUpdated: 0,
    optimistic: {},
    ui: { ...DEFAULT_UI_STATE },
  };
}

const initialState: CrudState = {
  crudService: null,
  hideSuccessToasts: false,
  collections: {},
};

/**
 * CRUD store hook for accessing CRUD state and actions
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const useCrudStore = createDoNotDevStore<CrudState & CrudActions>({
  name: 'crud-store',

  createStore: (set, get) => ({
    ...initialState,

    // ===================================================================
    // Service Management
    // ===================================================================

    setCrudService: (service: CrudServiceInterface) => {
      set({ crudService: service });
    },

    setHideSuccessToasts: (hide: boolean) => {
      set({ hideSuccessToasts: hide });
    },

    // ===================================================================
    // Collection-Level Methods
    // ===================================================================

    setLoading: (collection: string, loading: boolean) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              loading,
            },
          },
        };
      });
    },

    setError: (collection: string, error: Error | null) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              error,
              loading: false, // Clear loading on error
            },
          },
        };
      });
    },

    // ===================================================================
    // UI State (Filters, Favorites) - Persists across navigation
    // ===================================================================

    setFilters: (collection: string, filters: FilterState) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              ui: {
                ...collectionState.ui,
                filters,
              },
            },
          },
        };
      });
      // Side-effect: sync filters to URL (debounced — store updates immediately, URL after 500ms)
      if (urlSyncTimer) clearTimeout(urlSyncTimer);
      urlSyncTimer = setTimeout(() => {
        urlSyncTimer = null;
        filtersToUrl(filters);
      }, 500);
    },

    setShowFavoritesOnly: (collection: string, show: boolean) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              ui: {
                ...collectionState.ui,
                showFavoritesOnly: show,
              },
            },
          },
        };
      });
    },

    getFilters: (collection: string) => {
      const existing = get().collections[collection]?.ui?.filters;
      if (existing) return existing;
      // First access: seed from URL if present
      const urlFilters = filtersFromUrl();
      if (Object.keys(urlFilters).length > 0) {
        // Write into store without triggering URL sync (already in URL)
        set((state) => {
          const collectionState =
            state.collections[collection] || createDefaultCollectionState();
          return {
            collections: {
              ...state.collections,
              [collection]: {
                ...collectionState,
                ui: { ...collectionState.ui, filters: urlFilters },
              },
            },
          };
        });
        return urlFilters;
      }
      return {};
    },

    getShowFavoritesOnly: (collection: string) => {
      return get().collections[collection]?.ui?.showFavoritesOnly || false;
    },

    setPageSize: (collection: string, pageSize: number) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              ui: {
                ...collectionState.ui,
                pageSize,
              },
            },
          },
        };
      });
    },

    getPageSize: (collection: string) => {
      return get().collections[collection]?.ui?.pageSize;
    },

    clearCollection: (collection: string) => {
      set((state) => {
        const { [collection]: removed, ...remainingCollections } =
          state.collections;

        return {
          collections: remainingCollections,
        };
      });
    },

    clearError: (collection: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              error: null,
            },
          },
        };
      });
    },

    // ===================================================================
    // Optimistic Operations
    // ===================================================================

    addOptimistic: (collection: string, tempId: string, data: unknown) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: {
                ...collectionState.optimistic,
                [tempId]: {
                  tempId,
                  originalData: null,
                  optimisticData: data,
                  status: OPTIMISTIC_STATUSES.PENDING,
                  operation: CRUD_OPERATION.ADD,
                },
              },
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    confirmOptimistic: (
      collection: string,
      tempId: string,
      realId: string,
      _realData: unknown
    ) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        // Remove temp item from optimistic tracking
        const { [tempId]: _tempOptimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    rejectOptimistic: (collection: string, tempId: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        // Remove temp item completely
        const { [tempId]: _tempOptimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    updateOptimistic: (
      collection: string,
      id: string,
      data: unknown,
      originalData: unknown
    ) => {
      set((state) => {
        const collectionState =
          state.collections[collection] || createDefaultCollectionState();

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: {
                ...collectionState.optimistic,
                [id]: {
                  tempId: id,
                  originalData,
                  optimisticData: data,
                  status: OPTIMISTIC_STATUSES.PENDING,
                  operation: CRUD_OPERATION.UPDATE,
                },
              },
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    confirmUpdate: (collection: string, id: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        // Remove from optimistic tracking
        const { [id]: _optimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
            },
          },
        };
      });
    },

    rejectUpdate: (collection: string, id: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        const optimisticMeta = collectionState.optimistic[id];
        if (
          !optimisticMeta ||
          optimisticMeta.operation !== CRUD_OPERATION.UPDATE
        )
          return state;

        // Remove from optimistic tracking (original data restored via TanStack Query)
        const { [id]: _optimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    deleteOptimistic: (
      collection: string,
      id: string,
      originalData: unknown
    ) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: {
                ...collectionState.optimistic,
                [id]: {
                  tempId: id,
                  originalData,
                  optimisticData: null, // deleted items have no display data
                  status: OPTIMISTIC_STATUSES.PENDING,
                  operation: CRUD_OPERATION.DELETE,
                },
              },
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    confirmDelete: (collection: string, id: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        // Remove from optimistic tracking
        const { [id]: _optimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
            },
          },
        };
      });
    },

    rejectDelete: (collection: string, id: string) => {
      set((state) => {
        const collectionState = state.collections[collection];
        if (!collectionState) return state;

        const optimisticMeta = collectionState.optimistic[id];
        if (
          !optimisticMeta ||
          optimisticMeta.operation !== CRUD_OPERATION.DELETE
        )
          return state;

        // Remove from optimistic tracking (item restored via TanStack Query cache)
        const { [id]: _optimistic, ...remainingOptimistic } =
          collectionState.optimistic;

        return {
          collections: {
            ...state.collections,
            [collection]: {
              ...collectionState,
              optimistic: remainingOptimistic,
              lastUpdated: Date.now(),
            },
          },
        };
      });
    },

    // ===================================================================
    // Getters
    // ===================================================================

    getLoading: (collection: string) => {
      return get().collections[collection]?.loading || false;
    },

    getError: (collection: string) => {
      return get().collections[collection]?.error || null;
    },

    isOptimistic: (collection: string, id: string) => {
      const optimistic = get().collections[collection]?.optimistic[id];
      return optimistic?.status === 'pending';
    },

    getOptimisticStatus: (collection: string, id: string) => {
      return get().collections[collection]?.optimistic[id]?.status ?? null;
    },

    getOptimisticData: (collection: string, id: string) => {
      return (
        get().collections[collection]?.optimistic[id]?.optimisticData ?? null
      );
    },
  }),
});
