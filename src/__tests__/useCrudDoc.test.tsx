// packages/features/crud/src/__tests__/useCrudDoc.test.tsx

/**
 * @fileoverview useCrudDoc — reactivity to the CRUD cache
 * @description A displayed document must follow every write to its cache key
 * `['crud', collection, 'get', id]`: confirmed mutations (via the real
 * `updateListCaches`), pending optimistic operations (CrudStore) and deletes.
 * Regression: detail views read the document once into local state and showed
 * stale data after an edit until remount.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AnyEntity } from '@donotdev/core';

// -----------------------------------------------------------------------------
// Hoisted state — fake backend, fake service, minimal CrudStore.
// -----------------------------------------------------------------------------

const { db, readSpy, fakeService, store, env } = vi.hoisted(() => {
  const db = new Map<string, Record<string, unknown>>();
  const readSpy = vi.fn(async (id: string) => db.get(id) ?? null);
  const fakeService = {
    getDocQueryOptions: (collection: string, id: string) => ({
      queryKey: ['crud', collection, 'get', id] as const,
      queryFn: () => readSpy(id),
      staleTime: Infinity,
    }),
    bindRequestAccessToken: () => false,
  };

  type State = { collections: Record<string, { optimistic: object }> };
  let state: State = { collections: {} };
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set: (next: State) => {
      state = next;
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };

  // Test-controlled environment: render side, feature status, entity scope.
  const env = {
    client: true,
    status: 'ready',
    scope: undefined as object | undefined,
    authProvider: false,
    language: 'fr',
  };

  return { db, readSpy, fakeService, store, env };
});

vi.mock('@donotdev/core', async () => {
  const rq = await import('@tanstack/react-query');
  const translations = await import(
    '../../../../core/utils/src/common/entityTranslations'
  );
  return {
    useTranslation: () => ({ language: env.language }),
    getTranslatedFieldNames: translations.getTranslatedFieldNames,
    translateRow: translations.translateRow,
    FEATURE_STATUS: {
      INITIALIZING: 'initializing',
      READY: 'ready',
      DEGRADED: 'degraded',
      ERROR: 'error',
    },
    isClient: () => env.client,
    hasProvider: () => env.authProvider,
    useAuthSessionSnapshot: () => null,
    useQuery: rq.useQuery,
    useQueryClient: rq.useQueryClient,
    handleError: (error: unknown) => error,
  };
});

vi.mock('../useCrud', () => ({
  useCrud: (arg: unknown) =>
    arg === 'status'
      ? env.status
      : {
          _collection: 'cars',
          _schemas: { get: {} },
          _cacheOptions: {},
          _scope: env.scope,
        },
  getCrudServiceInstance: () => fakeService,
}));

vi.mock('../CrudStore', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useCrudStore: (selector: (s: ReturnType<typeof store.get>) => unknown) =>
      useSyncExternalStore(store.subscribe, () => selector(store.get())),
  };
});

// -----------------------------------------------------------------------------
// Subject — imported after mocks register.
// -----------------------------------------------------------------------------

import { updateListCaches } from '../CrudService.cache';
import { CRUD_OPERATION } from '../types';
import type { CrudServiceInternal } from '../types';
import { useCrudDoc } from '../useCrudDoc';

type Car = { id: string; model: string; price: number };

let queryClient: QueryClient;
let cacheSelf: CrudServiceInternal;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderDoc(id: string | null, options?: { enabled?: boolean }) {
  return renderHook(
    ({ docId }: { docId: string | null }) =>
      useCrudDoc<Car>('cars', docId, options),
    { wrapper, initialProps: { docId: id } }
  );
}

function suspenseWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{children}</Suspense>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  db.clear();
  db.set('c1', { id: 'c1', model: 'A', price: 10 });
  db.set('c2', { id: 'c2', model: 'Z', price: 99 });
  readSpy.mockReset();
  readSpy.mockImplementation(async (id: string) => db.get(id) ?? null);
  store.set({ collections: {} });
  env.client = true;
  env.status = 'ready';
  env.scope = undefined;
  env.authProvider = false;
  env.language = 'fr';
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cacheSelf = { getQueryClient: () => queryClient } as CrudServiceInternal;
});

describe('useCrudDoc', () => {
  it('reads the document', async () => {
    const { result } = renderDoc('c1');

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.model).toBe('A'));
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
  });

  it('shows a confirmed update made elsewhere, without refetching', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    act(() => {
      updateListCaches(
        cacheSelf,
        'cars',
        'c1',
        { model: 'B' },
        CRUD_OPERATION.UPDATE
      );
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({ id: 'c1', model: 'B', price: 10 })
    );
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('shows a full replacement (set)', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    act(() => {
      updateListCaches(
        cacheSelf,
        'cars',
        'c1',
        { id: 'c1', model: 'S', price: 1 },
        CRUD_OPERATION.SET
      );
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({ id: 'c1', model: 'S', price: 1 })
    );
  });

  it('shows a pending optimistic update immediately', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    act(() => {
      store.set({
        collections: {
          cars: {
            optimistic: {
              c1: {
                tempId: 'c1',
                originalData: { id: 'c1', model: 'A', price: 10 },
                optimisticData: { id: 'c1', model: 'Pending', price: 10 },
                status: 'pending',
                operation: CRUD_OPERATION.UPDATE,
              },
            },
          },
        },
      });
    });

    expect(result.current.data?.model).toBe('Pending');
  });

  it('reports notFound after a delete', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    db.delete('c1');
    act(() => {
      updateListCaches(cacheSelf, 'cars', 'c1', null, CRUD_OPERATION.DELETE);
    });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('reports notFound when no document exists', async () => {
    const { result } = renderDoc('missing');

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces read errors', async () => {
    readSpy.mockRejectedValueOnce(new Error('denied'));
    const { result } = renderDoc('c1');

    await waitFor(() => expect(result.current.error?.message).toBe('denied'));
    expect(result.current.notFound).toBe(false);
  });

  it('waits without an id: no read, not loading', () => {
    const { result } = renderDoc(null);

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('follows id changes', async () => {
    const { result, rerender } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    rerender({ docId: 'c2' });

    await waitFor(() => expect(result.current.data?.model).toBe('Z'));
  });

  it('enabled: false — no read, not loading', () => {
    const { result } = renderDoc('c1', { enabled: false });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('refresh() re-reads the document', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    db.set('c1', { id: 'c1', model: 'Remote', price: 10 });
    await act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data?.model).toBe('Remote'));
    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  it('refresh() without an id is a no-op (no placeholder null cached)', async () => {
    const { result } = renderDoc(null);

    await act(() => result.current.refresh());

    expect(readSpy).not.toHaveBeenCalled();
    expect(result.current.notFound).toBe(false);
    expect(
      queryClient.getQueryState(['crud', 'cars', 'get', null])?.data
    ).toBeUndefined();
  });

  it('merges a partial optimistic update over the cached document', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    act(() => {
      store.set({
        collections: {
          cars: {
            optimistic: {
              c1: {
                tempId: 'c1',
                originalData: null,
                optimisticData: { id: 'c1', model: 'Patched' },
                status: 'pending',
                operation: CRUD_OPERATION.UPDATE,
              },
            },
          },
        },
      });
    });

    expect(result.current.data).toEqual({
      id: 'c1',
      model: 'Patched',
      price: 10,
    });
  });

  it('hides on a pending optimistic delete and comes back on rollback', async () => {
    const { result } = renderDoc('c1');
    await waitFor(() => expect(result.current.data?.model).toBe('A'));

    act(() => {
      store.set({
        collections: {
          cars: {
            optimistic: {
              c1: {
                tempId: 'c1',
                originalData: { id: 'c1', model: 'A', price: 10 },
                optimisticData: null,
                status: 'pending',
                operation: CRUD_OPERATION.DELETE,
              },
            },
          },
        },
      });
    });
    expect(result.current.data).toBeNull();

    // Server refused: the flag is dropped, the cache was never touched.
    act(() => {
      store.set({ collections: { cars: { optimistic: {} } } });
    });
    expect(result.current.data?.model).toBe('A');
  });

  it('while CRUD initializes: loading with an id, no read', () => {
    env.status = 'initializing';
    const { result } = renderDoc('c1');

    expect(result.current.loading).toBe(true);
    expect(result.current.isAvailable).toBe(false);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('CRUD degraded (consent declined): not loading, nothing read', () => {
    env.status = 'degraded';
    const { result } = renderDoc('c1');

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(readSpy).not.toHaveBeenCalled();
  });

  describe('server render', () => {
    it('reads before rendering: the first render carries the document', async () => {
      env.client = false;
      const { result } = renderHook(() => useCrudDoc<Car>('cars', 'c1'), {
        wrapper: suspenseWrapper,
      });

      await waitFor(() => expect(result.current?.data?.model).toBe('A'));
      expect(result.current.loading).toBe(false);
      expect(readSpy).toHaveBeenCalledWith('c1');
    });

    it('a failed read renders loading without an error (the browser retries)', async () => {
      env.client = false;
      readSpy.mockRejectedValue(new Error('denied'));
      const { result } = renderHook(() => useCrudDoc<Car>('cars', 'c1'), {
        wrapper: suspenseWrapper,
      });

      // Regression: the retry render saw a masked error and suspended again,
      // forever (result stayed null, one backend read per loop).
      await waitFor(() => expect(result.current).not.toBeNull());
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('session unknown (auth provider, no snapshot): not read on the server', () => {
      env.client = false;
      env.authProvider = true;
      const fetchSpy = vi.spyOn(queryClient, 'fetchQuery');
      const { result } = renderHook(() => useCrudDoc<Car>('cars', 'c1'), {
        wrapper: suspenseWrapper,
      });

      expect(result.current.loading).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('scoped (tenant) entities are never read on the server', () => {
      env.client = false;
      env.scope = { provider: 'company', field: 'companyId' };
      const fetchSpy = vi.spyOn(queryClient, 'fetchQuery');
      const { result } = renderHook(() => useCrudDoc<Car>('cars', 'c1'), {
        wrapper: suspenseWrapper,
      });

      // Rendered without suspending; the browser loads it
      expect(result.current.loading).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe('useCrudDoc translated fields', () => {
  // `model` is translated (i18n: true); passed as options.entity like the reference resolver does.
  const carEntity = {
    name: 'Car',
    collection: 'cars',
    fields: { model: { name: 'model', type: 'text', i18n: true } },
  } as unknown as AnyEntity;

  function renderTranslated(options?: { translate?: boolean }) {
    return renderHook(
      () => useCrudDoc<Car>('cars', 'c3', { entity: carEntity, ...options }),
      { wrapper }
    );
  }

  beforeEach(() => {
    db.set('c3', { id: 'c3', model: 'Berline', modelI18n: { en: 'Sedan', de: '' }, price: 5 });
  });

  it('shows the current language', async () => {
    env.language = 'en';
    const { result } = renderTranslated();
    await waitFor(() => expect(result.current.data?.model).toBe('Sedan'));
  });

  it('falls back to the stored value when the translation is missing or empty', async () => {
    env.language = 'de';
    const { result } = renderTranslated();
    await waitFor(() => expect(result.current.data?.model).toBe('Berline'));
  });

  it('returns stored values with translate: false (edit forms)', async () => {
    env.language = 'en';
    const { result } = renderTranslated({ translate: false });
    await waitFor(() => expect(result.current.data?.model).toBe('Berline'));
    expect((result.current.data as Record<string, unknown> | null)?.modelI18n).toEqual({ en: 'Sedan', de: '' });
  });

  it('switches language without a new read', async () => {
    const { result, rerender } = renderTranslated();
    await waitFor(() => expect(result.current.data?.model).toBe('Berline'));
    env.language = 'en';
    rerender();
    expect(result.current.data?.model).toBe('Sedan');
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});
