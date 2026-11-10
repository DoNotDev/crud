// packages/features/crud/src/__tests__/CrudService.delete.test.ts

/**
 * @fileoverview Delete cache semantics
 * @description
 * - `updateGetCache` DELETE: a displayed document turns into "does not exist"
 *   (observers notified, entry stale); an undisplayed entry is dropped; an id never
 *   read (temp-id cleanup) creates nothing.
 * - Failed delete (optimistic and plain): caches are written only after the server
 *   confirms, so the rollback must not re-add the row. Regression: it appended a
 *   second copy to every cached list.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', () => ({
  generateUUID: () => 'uuid',
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: () => false,
  withTimeout: <T>(p: Promise<T>) => p,
  DEFAULT_CRUD_TIMEOUT: 30_000,
}));

import { updateGetCache } from '../CrudService.cache';
import { deleteImpl } from '../CrudService.mutations';
import { deleteOptimisticImpl } from '../CrudService.optimistic';
import { CRUD_OPERATION } from '../types';
import type { CrudServiceInternal } from '../types';

type Row = { id: string; name: string };

const GET_KEY = ['crud', 'cars', 'get', 'c1'];
const LIST_KEY = ['crud', 'cars', 'query', JSON.stringify({})];

let queryClient: QueryClient;

function makeService(adapter: unknown): CrudServiceInternal {
  const storeState = {
    hideSuccessToasts: true,
    deleteOptimistic: vi.fn(),
    rejectDelete: vi.fn(),
    confirmDelete: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
  };
  return {
    adapter,
    security: null,
    store: { getState: () => storeState },
    currentUserId: null,
    _inflightMutations: new Map(),
    initialize: vi.fn(async () => {}),
    getQueryClient: () => queryClient,
  } as unknown as CrudServiceInternal;
}

beforeEach(() => {
  queryClient = new QueryClient();
});

describe('updateGetCache — DELETE', () => {
  it('creates nothing for an id never read (temp-id cleanup)', () => {
    const self = makeService({});

    updateGetCache(self, 'cars', 'temp_1', null, CRUD_OPERATION.DELETE);

    expect(
      queryClient.getQueryState(['crud', 'cars', 'get', 'temp_1'])
    ).toBeUndefined();
  });

  it('drops an entry nobody displays (next read asks the backend)', () => {
    const self = makeService({});
    queryClient.setQueryData(GET_KEY, { id: 'c1', name: 'A' });

    updateGetCache(self, 'cars', 'c1', null, CRUD_OPERATION.DELETE);

    expect(queryClient.getQueryState(GET_KEY)).toBeUndefined();
  });

  it('turns a displayed document into "does not exist", notified and stale', () => {
    const self = makeService({});
    queryClient.setQueryData(GET_KEY, { id: 'c1', name: 'A' });
    const observer = new QueryObserver(queryClient, {
      queryKey: GET_KEY,
      queryFn: async () => null,
      staleTime: Infinity,
      enabled: false,
    });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((r) => seen.push(r.data));

    updateGetCache(self, 'cars', 'c1', null, CRUD_OPERATION.DELETE);

    expect(queryClient.getQueryData(GET_KEY)).toBeNull();
    expect(queryClient.getQueryState(GET_KEY)?.isInvalidated).toBe(true);
    expect(seen).toContain(null);
    unsubscribe();
  });
});

describe('failed delete — no duplicate row', () => {
  const row: Row = { id: 'c1', name: 'A' };

  function seed() {
    queryClient.setQueryData(LIST_KEY, { items: [row], total: 1 });
    queryClient.setQueryData(GET_KEY, row);
  }

  function failingAdapter() {
    return { delete: vi.fn(async () => Promise.reject(new Error('denied'))) };
  }

  it('optimistic delete: the list still holds the row once', async () => {
    seed();
    const self = makeService(failingAdapter());

    await expect(deleteOptimisticImpl(self, 'cars', 'c1')).rejects.toThrow();

    const list = queryClient.getQueryData<{ items: Row[]; total: number }>(
      LIST_KEY
    );
    expect(list?.items).toEqual([row]);
    expect(list?.total).toBe(1);
    expect(queryClient.getQueryData(GET_KEY)).toEqual(row);
    expect(self.store!.getState().rejectDelete).toHaveBeenCalledWith(
      'cars',
      'c1'
    );
  });

  it('plain delete: the list still holds the row once', async () => {
    seed();
    const self = makeService(failingAdapter());

    await expect(deleteImpl(self, 'cars', 'c1')).rejects.toThrow();

    const list = queryClient.getQueryData<{ items: Row[]; total: number }>(
      LIST_KEY
    );
    expect(list?.items).toEqual([row]);
    expect(list?.total).toBe(1);
  });
});
