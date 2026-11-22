// packages/features/crud/src/__tests__/CrudService.writeResult.test.ts

/**
 * @fileoverview Writes cache what the backend stored
 * @description `update` / `set` / `updateOptimistic` cache the stored values the
 * adapter returns over the client payload: values the backend sets (timestamps,
 * revisions, triggers) reach the cache without a refetch. The read schema given
 * as `readSchema` reaches the adapter. `cacheStored` caches a row written outside
 * the service (app RPC): a row a cache knows replaces it there; a row no cache
 * knows is inserted (document cache, appended to every cached list).
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */

import { QueryClient } from '@tanstack/react-query';
import * as v from 'valibot';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', async () => ({
  // The CRUD rules run for real (core/schemas crud/).
  ...(await vi.importActual<Record<string, unknown>>('@donotdev/core')),
  generateUUID: () => 'uuid',
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: () => false,
  withTimeout: <T>(p: Promise<T>) => p,
  DEFAULT_CRUD_TIMEOUT: 30_000,
  DEFAULT_STATUS_VALUE: 'available',
}));

import { createSchemas } from '@donotdev/core';

import { CrudService } from '../CrudService';
import { updateListCaches } from '../CrudService.cache';
import { setImpl, updateImpl } from '../CrudService.mutations';
import { updateOptimisticImpl } from '../CrudService.optimistic';
import { CRUD_OPERATION } from '../types';
import type { CrudServiceInternal } from '../types';
import { carEntity } from '@dndev/test-entities';

type Row = { id: string; name: string; revision: string; updatedAt: string };

const GET_KEY = ['crud', 'cars', 'get', 'c1'];
const LIST_KEY = ['crud', 'cars', 'query', JSON.stringify({})];
const stored: Row = { id: 'c1', name: 'Saved', revision: 'r1', updatedAt: '2026-01-01T00:00:00.000Z' };
const schema = Object.assign(v.object({ name: v.string() }), { metadata: {} }) as never;
const schemas = createSchemas(carEntity);
const readSchema = Object.assign(v.object({ name: v.string(), revision: v.string() }), { metadata: {} }) as never;

let queryClient: QueryClient;

function makeService(adapter: unknown): CrudServiceInternal {
  const storeState = {
    hideSuccessToasts: true,
    updateOptimistic: vi.fn(),
    confirmUpdate: vi.fn(),
    rejectUpdate: vi.fn(),
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
  queryClient.setQueryData(GET_KEY, stored);
  queryClient.setQueryData(LIST_KEY, { items: [stored] });
});

describe('writes cache the stored row', () => {
  it('update caches the values the backend set and passes the read schema', async () => {
    const written = { id: 'c1', name: 'Edited', revision: 'r2', updatedAt: '2026-01-02T00:00:00.000Z' };
    const update = vi.fn(async () => written);
    const self = makeService({ update });

    const result = await updateImpl<Row>(self, 'cars', 'c1', { name: 'Edited' }, schemas, { readSchema });

    expect(update).toHaveBeenCalledWith('cars', 'c1', { name: 'Edited' }, { readSchema });
    expect(result).toEqual(written);
    expect(queryClient.getQueryData(GET_KEY)).toEqual(written);
    expect(queryClient.getQueryData<{ items: Row[] }>(LIST_KEY)?.items[0]).toEqual(written);
  });

  it('set caches the values the backend set over the payload', async () => {
    const written = { id: 'c1', name: 'Replaced', revision: 'r3', updatedAt: '2026-01-03T00:00:00.000Z' };
    const self = makeService({ set: vi.fn(async () => written) });

    await setImpl<Row>(self, 'cars', 'c1', { id: 'c1', name: 'Replaced' } as Row, schemas);

    // The payload carries the status the CRUD create rules set (rule 7).
    expect(queryClient.getQueryData(GET_KEY)).toEqual({ ...written, status: 'available' });
  });

  it('updateOptimistic caches the stored values, not the optimistic merge', async () => {
    const written = { id: 'c1', name: 'Fast', revision: 'r4' };
    const self = makeService({ update: vi.fn(async () => written) });

    await updateOptimisticImpl<Row>(self, 'cars', 'c1', { name: 'Fast' }, schema);

    expect(queryClient.getQueryData(GET_KEY)).toEqual({ ...stored, ...written });
  });

  it('a row cached as stored replaces the document and list entries', () => {
    const written = { id: 'c1', name: 'From RPC', revision: 'r5', updatedAt: '2026-01-05T00:00:00.000Z' };
    updateListCaches(makeService({}), 'cars', written.id, written, CRUD_OPERATION.SET);

    expect(queryClient.getQueryData(GET_KEY)).toEqual(written);
    expect(queryClient.getQueryData<{ items: Row[] }>(LIST_KEY)?.items[0]).toEqual(written);
  });
});

describe('cacheStored', () => {
  const ARRAY_KEY = ['crud', 'cars', 'extend', 'ownerId', ['o1']];
  const cacheStored = (row: Row) =>
    CrudService.prototype.cacheStored.call(makeService({}), 'cars', row);
  const fresh = (id: string, name: string): Row => ({ id, name, revision: 'r1', updatedAt: '2026-01-06T00:00:00.000Z' });

  it('replaces a row a list holds, without appending', () => {
    const written = fresh('c1', 'From RPC');
    queryClient.removeQueries({ queryKey: GET_KEY, exact: true });
    queryClient.setQueryData(ARRAY_KEY, [stored]);

    cacheStored(written);

    expect(queryClient.getQueryData(GET_KEY)).toEqual(written);
    expect(queryClient.getQueryData(LIST_KEY)).toEqual({ items: [written] });
    expect(queryClient.getQueryData(ARRAY_KEY)).toEqual([written]);
  });

  it('inserts a row no cache knows: document cache set, appended to every list, total bumped', () => {
    const OTHER_LIST_KEY = ['crud', 'cars', 'query', JSON.stringify({ limit: 5 })];
    queryClient.setQueryData(OTHER_LIST_KEY, { items: [stored], total: 7 });
    queryClient.setQueryData(ARRAY_KEY, [stored]);
    const created = fresh('c2', 'Created by RPC');

    cacheStored(created);

    expect(queryClient.getQueryData(['crud', 'cars', 'get', 'c2'])).toEqual(created);
    expect(queryClient.getQueryData(LIST_KEY)).toEqual({ items: [stored, created], total: 2 });
    expect(queryClient.getQueryData(OTHER_LIST_KEY)).toEqual({ items: [stored, created], total: 8 });
    expect(queryClient.getQueryData(ARRAY_KEY)).toEqual([stored, created]);
    // Other documents' caches are untouched.
    expect(queryClient.getQueryData(GET_KEY)).toEqual(stored);
  });

  it('inserts a row whose document cache says it does not exist (null)', () => {
    const DOC_KEY = ['crud', 'cars', 'get', 'c3'];
    queryClient.setQueryData(DOC_KEY, null);
    const created = fresh('c3', 'Recreated');

    cacheStored(created);

    expect(queryClient.getQueryData(DOC_KEY)).toEqual(created);
    expect(queryClient.getQueryData(LIST_KEY)).toEqual({ items: [stored, created], total: 2 });
  });

  it('a row known only to its document cache is updated there, not appended to lists', () => {
    const DOC_KEY = ['crud', 'cars', 'get', 'c4'];
    queryClient.setQueryData(DOC_KEY, fresh('c4', 'Before'));
    const written = fresh('c4', 'After');

    cacheStored(written);

    expect(queryClient.getQueryData(DOC_KEY)).toEqual(written);
    expect(queryClient.getQueryData(LIST_KEY)).toEqual({ items: [stored] });
  });
});
