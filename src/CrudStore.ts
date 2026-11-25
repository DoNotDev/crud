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
 * - UI state (filters, favorites, page size); URL-synced filter states mirror the
 *   `f_*` search params (CRUD.md "URL sync")
 *
 * **NOT responsible for:**
 * - Query results caching (TanStack Query owns this)
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  createDoNotDevStore,
  getEntityByCollection,
  isClient,
} from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

import { OPTIMISTIC_STATUSES, CRUD_OPERATION } from './types';
import type {
  OptimisticMeta,
  CrudState,
  CrudActions,
  CrudServiceInterface,
  FilterState,
  CollectionUIState,
} from './types';
import {
  encodeFilterParams,
  readFilterParams,
  writeFilterParams,
} from './utils/filterUrl';

// ===================================================================
// URL ↔ Filter Sync
// ===================================================================
//
// Scope: a filter state syncs with the URL only when its key resolves to an entity
// (`filterUrlEntity`): by default the key of an entity collection (the page list's
// filter state); `setFilterUrlSync` overrides it per key (opt-out, or opt-in of a
// custom key). Only that entity's `f_*` params are read and written.

/** Explicit URL sync per filter key (`setFilterUrlSync`): decoding entity, or `null` = off. */
const filterUrlSync = new Map<string, AnyEntity | null>();

/** Debounced URL writes per key, with the pathname they were scheduled on. */
const pendingUrlWrites = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; pathname: string }
>();

/** Delay between a filter change and its URL write (typing, slider drags). */
const URL_WRITE_DELAY_MS = 500;

let urlListenerInstalled = false;

/** URL-synced keys read so far: the keys a URL change re-reads. */
const urlWatchedKeys = new Set<string>();

/** Entity decoding the URL params of a filter key, or `null` when the key does not sync. */
function filterUrlEntity(key: string): AnyEntity | null {
  const explicit = filterUrlSync.get(key);
  if (explicit !== undefined) return explicit;
  return getEntityByCollection(key) ?? null;
}

/** Write the entity's filter params into the current URL (keeps history state, hash). */
function writeFiltersToUrl(filters: FilterState, entity: AnyEntity): void {
  const params = new URLSearchParams(location.search);
  writeFilterParams(params, filters, entity);
  const search = params.toString();
  if (search === location.search.replace(/^\?/, '')) return;
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${search ? `?${search}` : ''}${location.hash}`
  );
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
      // Side-effect: URL-synced keys write their params (debounced — store now, URL
      // after URL_WRITE_DELAY_MS), unless the user has left the page meanwhile.
      if (!isClient()) return;
      const entity = filterUrlEntity(collection);
      if (!entity) return;
      installUrlListener();
      urlWatchedKeys.add(collection);
      const pending = pendingUrlWrites.get(collection);
      if (pending) clearTimeout(pending.timer);
      const pathname = location.pathname;
      pendingUrlWrites.set(collection, {
        pathname,
        timer: setTimeout(() => {
          pendingUrlWrites.delete(collection);
          if (location.pathname !== pathname) return;
          writeFiltersToUrl(filters, entity);
        }, URL_WRITE_DELAY_MS),
      });
    },

    setFilterUrlSync: (key: string, entity: AnyEntity | null) => {
      filterUrlSync.set(key, entity);
    },

    syncFiltersFromUrl: (key: string) => {
      if (!isClient()) return;
      const entity = filterUrlEntity(key);
      if (!entity) return;
      installUrlListener();
      urlWatchedKeys.add(key);
      const pending = pendingUrlWrites.get(key);
      if (pending) {
        // A pending write on this page is newer than the URL
        if (pending.pathname === location.pathname) return;
        clearTimeout(pending.timer);
        pendingUrlWrites.delete(key);
      }
      const fromUrl = readFilterParams(location.search, entity);
      const current = get().collections[key]?.ui?.filters ?? {};
      if (
        encodeFilterParams(fromUrl, entity) ===
        encodeFilterParams(current, entity)
      )
        return;
      set((state) => {
        const collectionState =
          state.collections[key] || createDefaultCollectionState();
        return {
          collections: {
            ...state.collections,
            [key]: {
              ...collectionState,
              ui: { ...collectionState.ui, filters: fromUrl },
            },
          },
        };
      });
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
      // First access of a URL-synced key: seed from the URL
      const entity = isClient() ? filterUrlEntity(collection) : null;
      if (!entity) return {};
      installUrlListener();
      urlWatchedKeys.add(collection);
      const urlFilters = readFilterParams(location.search, entity);
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

/** Stable empty filter state (render snapshots must keep their reference). */
const EMPTY_FILTERS: FilterState = {};

/** Last URL read per key by {@link peekFilters} (stable snapshot while the URL is unchanged). */
const urlPeekCache = new Map<
  string,
  { search: string; entity: AnyEntity; filters: FilterState }
>();

/**
 * Filter state of a key for render: the stored state, else, for a URL-synced key on
 * the client that is not seeded yet, the filters its `f_*` params encode. Reads only:
 * never writes the store, so render can call it without notifying other components
 * (the store is seeded by `syncFiltersFromUrl`, from an effect). Same reference while
 * neither the store nor the URL changes (a `useSyncExternalStore` snapshot).
 * Internal to `useCrudFilters`.
 */
export function peekFilters(key: string): FilterState {
  const stored = useCrudStore.getState().collections[key]?.ui?.filters;
  if (stored) return stored;
  if (!isClient()) return EMPTY_FILTERS;
  const entity = filterUrlEntity(key);
  if (!entity) return EMPTY_FILTERS;
  const search = location.search;
  const cached = urlPeekCache.get(key);
  if (cached && cached.search === search && cached.entity === entity) {
    return cached.filters;
  }
  const filters = readFilterParams(search, entity);
  urlPeekCache.set(key, { search, entity, filters });
  return filters;
}

/**
 * Re-read every URL-synced filter state when the URL changes: back/forward, router
 * navigations (`history.pushState`), links. Uses the Navigation API
 * (`currententrychange`, fired by every history change); browsers without it get
 * back/forward only (`popstate`), and pages re-read on mount (`useCrudFilters`).
 * Client only, installed once on the first URL-synced access.
 *
 * The re-read runs in a microtask: `currententrychange` fires synchronously inside
 * `history.pushState` / `replaceState`, which routers call during React's commit
 * (Next.js writes history in a `useInsertionEffect`). Updating the store there would
 * schedule React updates inside that effect ("useInsertionEffect must not schedule
 * updates"); the microtask runs once the commit is done.
 */
function installUrlListener(): void {
  if (urlListenerInstalled || !isClient()) return;
  urlListenerInstalled = true;
  const onUrlChange = () => {
    queueMicrotask(() => {
      const { syncFiltersFromUrl } = useCrudStore.getState();
      urlWatchedKeys.forEach((key) => syncFiltersFromUrl(key));
    });
  };
  const navigation = (window as { navigation?: EventTarget }).navigation;
  if (navigation) navigation.addEventListener('currententrychange', onUrlChange);
  else window.addEventListener('popstate', onUrlChange);
}
