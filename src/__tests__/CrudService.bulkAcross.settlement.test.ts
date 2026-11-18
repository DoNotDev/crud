import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { create as importStore } from 'zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BulkAcrossBatch, BulkOperations, BulkResult } from '@donotdev/core';
import { toast } from '@donotdev/components';

import { DEFAULT_CRUD_TIMEOUT } from '../../../../core/utils/src/common/withTimeout';

// Identity assertions below verify forwarding into the existing error path, not
// production error identity: handleError normally returns a DoNotDevError.
const { reportError, restricted } = vi.hoisted(() => ({
  reportError: vi.fn((error: unknown) => error),
  restricted: vi.fn(() => false),
}));
vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));
vi.mock('@donotdev/core', async () => ({
  // The CRUD rules run for real (core/schemas crud/), on the shared test entities.
  ...(await vi.importActual<Record<string, unknown>>('@donotdev/core')),
  createDoNotDevStore: ({ createStore }: { createStore: import('zustand').StateCreator<Record<string, unknown>> }) => importStore(createStore),
  isClient: () => false,
  AtomicBulkError: class extends Error {},
  BulkAcrossCycleError: class extends Error {},
  BulkCollisionError: class extends Error {},
  detectBulkCollisions: () => ({ collisions: [], where: null }),
  generateUUID: (() => { let id = 0; return () => `uuid-${++id}`; })(),
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: reportError,
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: restricted,
}));

import { piiSecretEntity } from '@dndev/test-entities';

import { useCrudStore } from '../CrudStore';
import { bulkAcrossImpl } from '../CrudService.bulkAcross';
import { bulkImpl } from '../CrudService.bulk';
import { invalidateCollectionImpl } from '../CrudService.cache';
import type { CrudServiceInternal } from '../types';

type Row = Record<string, unknown> & { id: string };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function result(insertedIds: string[] = []): BulkResult {
  return { insertedIds, updatedIds: [], deletedIds: [], failed: [] };
}
function batch(collection: string, dependsOn?: string[]): BulkAcrossBatch {
  return { collection, inserts: [{ id: `${collection}-1` }], schemas: {}, dependsOn };
}

/**
 * Actual writes mutate db; invalidation reads db through the real cache helpers.
 * Collections are shared test entities with no required field: products, stock_movements
 * (after products), orders (independent), events (dependent).
 */
function fixture(beforeWrite?: (collection: string) => Promise<BulkResult | void>) {
  const db = new Map<string, Map<string, Row>>();
  const events: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const key = (collection: string) => ['crud', collection, 'query', '{}'];
  for (const collection of ['products', 'stock_movements', 'orders', 'events']) {
    db.set(collection, new Map());
    client.setQueryData(key(collection), { items: [], total: 0 });
  }
  const state = {
    setLoading: vi.fn(), setError: vi.fn(),
    addOptimistic: vi.fn(), confirmOptimistic: vi.fn(), rejectOptimistic: vi.fn(),
    updateOptimistic: vi.fn(), confirmUpdate: vi.fn(), rejectUpdate: vi.fn(),
    deleteOptimistic: vi.fn(), confirmDelete: vi.fn(), rejectDelete: vi.fn(),
  };
  const bulk = vi.fn(async (collection: string, ops: BulkOperations<Record<string, unknown>>) => {
    events.push(`start:${collection}`);
    const override = await beforeWrite?.(collection);
    if (override) return override;
    const rows = db.get(collection)!;
    const written = result();
    for (const row of ops.inserts ?? []) {
      const id = String(row.id);
      rows.set(id, { ...row, id });
      written.insertedIds.push(id);
    }
    for (const { id, patch } of ops.updates ?? []) {
      rows.set(id, { ...rows.get(id), ...patch, id });
      written.updatedIds.push(id);
    }
    for (const id of ops.deletes ?? []) {
      rows.delete(id);
      written.deletedIds.push(id);
    }
    events.push(`commit:${collection}`);
    return written;
  });
  const invalidate = vi.fn(async (collection: string) => {
    events.push(`refetch:${collection}`);
    const items = [...db.get(collection)!.values()];
    client.setQueryData(key(collection), { items, total: items.length });
  });
  // `get`: the stored row an update needs when no cache holds it (CRUD update rules).
  const get = vi.fn(async (collection: string, id: string) => db.get(collection)?.get(id) ?? null);
  const service = {
    adapter: { bulk, get }, store: { getState: () => state }, security: null,
    currentUserId: 'user', getQueryClient: () => client,
    invalidateCollection: invalidate,
  } as unknown as CrudServiceInternal;
  return { db, events, client, key, state, bulk, invalidate, service };
}

beforeEach(() => {
  useCrudStore.setState({ collections: {} });
  vi.mocked(toast).mockReset();
  reportError.mockReset().mockImplementation((error: unknown) => error);
  restricted.mockReset().mockReturnValue(false);
});
afterEach(() => { vi.useRealTimers(); });

describe('bulkAcross settlement and storage boundary', () => {
  it.each(['bulk', 'across'])('uses TanStack active-refetch/inactive-stale policy in %s', async (mode) => {
    const f = fixture();
    f.service.invalidateCollection = (collection) => invalidateCollectionImpl(f.service, collection);
    let activeFetches = 0;
    let inactiveFetches = 0;
    const activeKey = f.key('products');
    const inactiveKey = ['crud', 'products', 'query', 'inactive'];
    const active = new QueryObserver(f.client, { queryKey: activeKey, staleTime: Infinity, queryFn: async () => { activeFetches++; return { items: [], total: 0 }; } });
    const unsubscribe = active.subscribe(() => {});
    await active.refetch();
    const activeFetchesBeforeMutation = activeFetches;
    f.client.setQueryData(inactiveKey, { items: [{ id: 'old' }], total: 1 });
    f.client.setQueryDefaults(inactiveKey, { queryFn: async () => { inactiveFetches++; return { items: [], total: 0 }; } });
    if (mode === 'bulk') await bulkImpl(f.service, 'products', { inserts: [{ id: 'products-1' }] }, {}, { suppressToast: true } as never);
    else await bulkAcrossImpl(f.service, [{ collection: 'products', inserts: [{ id: 'products-1' }], schemas: {} }]);
    expect(activeFetches).toBeGreaterThan(activeFetchesBeforeMutation);
    expect(inactiveFetches).toBe(0);
    const inactive = f.client.getQueryCache().find({ queryKey: inactiveKey, exact: true });
    expect(inactive?.state.isInvalidated).toBe(true);
    expect(f.client.getQueryData(inactiveKey)).toEqual({ items: [{ id: 'old' }], total: 1 });
    unsubscribe();
  });

  it('confirms generated insert IDs in detail cache before production invalidation', async () => {
    const returnedId = 'server-generated-id';
    const f = fixture(async (collection) => {
      f.db.get(collection)!.set(returnedId, { name: 'Created', status: 'available' } as Row);
      return result([returnedId]);
    });
    f.service.invalidateCollection = (collection) => invalidateCollectionImpl(f.service, collection);
    const detailKey = ['crud', 'products', 'get', returnedId];
    let inactiveFetches = 0;
    f.client.setQueryDefaults(detailKey, { queryFn: async () => { inactiveFetches++; return null; } });

    await bulkAcrossImpl(f.service, [{ collection: 'products', inserts: [{ name: 'Created' }], schemas: {} }]);

    expect(f.client.getQueryData(detailKey)).toEqual({ name: 'Created', status: 'available', id: returnedId });
    expect(f.client.getQueryCache().find({ queryKey: detailKey, exact: true })?.state.isInvalidated).toBe(true);
    expect(inactiveFetches).toBe(0);
  });

  it.each(['bulk', 'across'])('settles partial acknowledgements and restores original details after confirmation interruption in %s', async (mode) => {
    let f!: ReturnType<typeof fixture>;
    f = fixture(async () => {
      f.db.get('products')!.set('new', { id: 'new', status: 'available' });
      return { ...result(['new']), failed: [
        { op: 'update' as const, id: 'existing', error: 'denied' },
        { op: 'delete' as const, id: 'new', error: 'denied' },
      ] };
    });
    f.service.store = useCrudStore;
    const old = { id: 'existing', name: 'before', serverField: true };
    f.client.setQueryData(['crud', 'products', 'get', 'existing'], old);
    const setQueryData = f.client.setQueryData.bind(f.client);
    let interrupt = true;
    vi.spyOn(f.client, 'setQueryData').mockImplementation((key, updater, options) => {
      if (interrupt && key[0] === 'crud' && key[2] === 'get' && key[3] === 'new') {
        interrupt = false;
        throw new Error('confirmation interrupted');
      }
      return setQueryData(key, updater, options);
    });
    if (mode === 'bulk') await bulkImpl(f.service, 'products', { inserts: [{ id: 'new' }], updates: [{ id: 'existing', patch: { name: 'optimistic' } }], deletes: ['new'] }, {});
    else await expect(bulkAcrossImpl(f.service, [{ collection: 'products', inserts: [{ id: 'new' }], updates: [{ id: 'existing', patch: { name: 'optimistic' } }], deletes: ['new'], schemas: {} }])).rejects.toThrow('rows not written');
    expect(f.client.getQueryData(['crud', 'products', 'get', 'existing'])).toEqual(old);
    expect(f.client.getQueryData(['crud', 'products', 'get', 'new'])).toEqual({ id: 'new', status: 'available' });
    expect(useCrudStore.getState().collections.products?.optimistic).toEqual({});
  });

  it.each(['bulk', 'across'])('clears real store entries when confirmation is interrupted in %s', async (mode) => {
    let acknowledged = false;
    let f!: ReturnType<typeof fixture>;
    f = fixture(async () => { acknowledged = true; });
    f.service.store = useCrudStore;
    const client = f.client;
    const original = client.setQueryData.bind(client);
    let interrupted = false;
    vi.spyOn(client, 'setQueryData').mockImplementation((key, updater, options) => {
      if (acknowledged && !interrupted && key[0] === 'crud' && key[1] === 'products' && key[2] === 'get' && key[3] === 'a') {
        interrupted = true;
        throw new Error('interrupted cache confirmation');
      }
      return original(key, updater, options);
    });
    const ops = { inserts: [{ id: 'a' }, { id: 'b' }] };
    if (mode === 'bulk') await bulkImpl(f.service, 'products', ops, {});
    else await bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    expect(interrupted).toBe(true);
    expect(useCrudStore.getState().collections.products?.optimistic).toEqual({});
    expect(client.getQueryData(['crud', 'products', 'get', 'a'])).toEqual({ id: 'a', status: 'available' });
    expect(client.getQueryData(['crud', 'products', 'get', 'b'])).toEqual({ id: 'b', status: 'available' });
    expect(f.bulk).toHaveBeenCalledTimes(1);
  });
  it.each([['legacy', false], ['atomic', true]] as const)('clears real pending state when staging throws after mutation (%s)', async (mode, atomic) => {
    const f = fixture();
    f.service.store = useCrudStore;
    const original = useCrudStore.getState().addOptimistic;
    useCrudStore.setState({
      addOptimistic: (collection, id, data) => {
        original(collection, id, data);
        throw new Error('staging failed after mutation');
      },
    });
    const execute = vi.fn(async () => ({ results: { products: result(['p']) } }));
    if (atomic) {
      (f.service.adapter as unknown as { atomicBulkAcross: unknown }).atomicBulkAcross = {
        preflight: vi.fn(async () => undefined), execute,
      };
    }
    const operation = bulkAcrossImpl(f.service, [{ collection: 'products', inserts: [{ id: 'products-1' }], schemas: {} }], atomic ? { execution: 'atomic' } : undefined);
    await expect(operation).rejects.toThrow('staging failed after mutation');
    expect(useCrudStore.getState().collections.products?.optimistic).toEqual({});
    expect(f.bulk).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    useCrudStore.setState({ addOptimistic: original });
  });

  it.each(['bulk', 'across'])('keeps filtered list membership and order on failed delete in %s', async (mode) => {
    const failure = { ...result(), failed: [{ op: 'delete' as const, id: 'p', error: 'denied' }] };
    const f = fixture(async () => failure);
    const a = ['crud', 'products', 'query', 'A'];
    const b = ['crud', 'products', 'query', 'B'];
    const listA = { items: [{ id: 'x' }, { id: 'p' }, { id: 'y' }], total: 3 };
    const listB = { items: [{ id: 'z' }], total: 8 };
    f.client.setQueryData(a, listA);
    f.client.setQueryData(b, listB);
    f.invalidate.mockImplementation(async () => {});
    if (mode === 'bulk') await bulkImpl(f.service, 'products', { deletes: ['p'] }, {});
    else await expect(bulkAcrossImpl(f.service, [{ collection: 'products', deletes: ['p'], schemas: {} }])).rejects.toThrow();
    expect(f.client.getQueryData(a)).toEqual(listA);
    expect(f.client.getQueryData(b)).toEqual(listB);
  });

  it.each([['bulk', true], ['bulk', false], ['across', true], ['across', false]] as const)('leaves inserted then deleted ID absent in %s (warm: %s)', async (mode, warm) => {
    const f = fixture();
    const detail = ['crud', 'products', 'get', 'p'];
    if (warm) f.client.setQueryData(detail, { id: 'p', old: true });
    const ops = { inserts: [{ id: 'p' }], deletes: ['p'] };
    if (mode === 'bulk') await bulkImpl(f.service, 'products', ops, {});
    else await bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    expect(f.client.getQueryData(detail)).toBeUndefined();
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [], total: 0 });
  });

  it.each([['bulk', false], ['bulk', true], ['across', false], ['across', true]] as const)('keeps successful insert detail after its subsequent delete fails in %s (warm: %s)', async (mode, warm) => {
    let f!: ReturnType<typeof fixture>;
    f = fixture(async () => {
      f.db.get('products')!.set('p', { id: 'p', status: 'available' });
      return { ...result(['p']), failed: [{ op: 'delete' as const, id: 'p', error: 'denied' }] };
    });
    const detailKey = ['crud', 'products', 'get', 'p'];
    if (warm) f.client.setQueryData(detailKey, { id: 'p', previous: true });
    if (mode === 'bulk') await bulkImpl(f.service, 'products', { inserts: [{ id: 'p' }], deletes: ['p'] }, {});
    else await expect(bulkAcrossImpl(f.service, [{ collection: 'products', inserts: [{ id: 'p' }], deletes: ['p'], schemas: {} }])).rejects.toThrow('rows not written');
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [{ id: 'p', status: 'available' }], total: 1 });
    expect(f.client.getQueryData(detailKey)).toEqual({ id: 'p', status: 'available' });
  });
  it.each(['bulk', 'across'])('refetches a cold update with full server fields in %s', async (mode) => {
    const f = fixture();
    f.db.get('products')!.set('p', { id: 'p', name: 'old', serverField: 'preserved' });
    const detailKey = ['crud', 'products', 'get', 'p'];
    const observer = new QueryObserver(f.client, { queryKey: detailKey, enabled: false, queryFn: async () => f.db.get('products')!.get('p') });
    const unsubscribe = observer.subscribe(() => {});
    f.service.invalidateCollection = async (collection) => {
      const row = f.db.get(collection)!.get('p');
      f.client.setQueryData(detailKey, row);
    };
    const ops = { updates: [{ id: 'p', patch: { name: 'new' } }] };
    if (mode === 'bulk') await bulkImpl(f.service, 'products', ops, {});
    else await bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    expect(f.client.getQueryData(detailKey)).toEqual({ id: 'p', name: 'new', serverField: 'preserved' });
    expect(f.bulk).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it.each(['bulk', 'across'])('does not corrupt cold failed delete caches in %s', async (mode) => {
    const failure = { ...result(), failed: [{ op: 'delete' as const, id: 'p', error: 'denied' }] };
    const f = fixture(async () => failure);
    f.db.get('products')!.set('p', { id: 'p', name: 'server' });
    f.client.setQueryData(f.key('products'), { items: [], total: 1 });
    const key = ['crud', 'products', 'get', 'p'];
    const observer = new QueryObserver(f.client, { queryKey: key, enabled: false, queryFn: async () => f.db.get('products')!.get('p') });
    const unsubscribe = observer.subscribe(() => {});
    f.invalidate.mockImplementation(async (collection) => {
      const items = [...f.db.get(collection)!.values()];
      f.client.setQueryData(f.key(collection), { items, total: items.length });
      f.client.setQueryData(key, items[0]);
    });
    if (mode === 'bulk') expect(await bulkImpl(f.service, 'products', { deletes: ['p'] }, {})).toEqual(failure);
    else await expect(bulkAcrossImpl(f.service, [{ collection: 'products', deletes: ['p'], schemas: {} }])).rejects.toThrow('rows not written');
    expect(f.client.getQueryData(key)).toEqual({ id: 'p', name: 'server' });
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [{ id: 'p', name: 'server' }], total: 1 });
    unsubscribe();
  });

  it.each(['bulk', 'across'])('preserves acknowledged result when toast throws in %s', async (mode) => {
    const f = fixture();
    vi.mocked(toast).mockImplementation(() => { throw new Error('sensitive toast'); });
    const ops = { inserts: [{ id: 'products-1' }] };
    const output = mode === 'bulk' ? await bulkImpl(f.service, 'products', ops, {}) : await bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    expect(output).toEqual(mode === 'bulk' ? result(['products-1']) : { results: { products: result(['products-1']) } });
    expect(f.bulk).toHaveBeenCalledTimes(1);
    expect(f.state.rejectOptimistic).not.toHaveBeenCalled();
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ total: 1 });
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bulk post-commit side effect failed' }), expect.anything());
  });

  it('preserves a partial bulk result when anomaly reporting throws', async () => {
    const failure = { ...result(), failed: [{ op: 'delete' as const, id: 'p', error: 'denied' }] };
    const f = fixture(async () => failure);
    f.service.security = { checkRateLimit: vi.fn(), audit: vi.fn(), recordAnomaly: () => { throw new Error('sensitive anomaly'); } } as never;
    expect(await bulkImpl(f.service, 'products', { deletes: ['p'] }, {})).toEqual(failure);
    expect(f.bulk).toHaveBeenCalledTimes(1);
    expect(f.state.rejectDelete).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bulk post-commit side effect failed' }), expect.anything());
  });

  it.each(['bulk', 'across'])('preserves acknowledged result when audit throws in %s', async (mode) => {
    const f = fixture();
    f.service.security = { checkRateLimit: vi.fn(), audit: () => { throw new Error('sensitive'); } } as never;
    reportError.mockImplementation(() => { throw new Error('reporter failed'); });
    const ops = { inserts: [{ id: 'products-1' }] };
    const output = mode === 'bulk' ? await bulkImpl(f.service, 'products', ops, {}) : await bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    expect(output).toEqual(mode === 'bulk' ? result(['products-1']) : { results: { products: result(['products-1']) } });
    expect(f.bulk).toHaveBeenCalledTimes(1);
    expect(f.state.rejectOptimistic).not.toHaveBeenCalled();
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ total: 1 });
  });
  it.each(['bulk', 'across'])('leaves loading false on preparation failures in %s', async (mode) => {
    // The PII entity's schemas (security.piiFields) are the ones the rules resolve.
    const secrets = piiSecretEntity.collection;
    for (const stage of ['access', 'rate', 'schema', 'encryption']) {
      const f = fixture();
      const failure = new Error(stage);
      restricted.mockReturnValue(stage === 'access');
      // An invalid value fails the CRUD create rules.
      const row = { secret: stage === 'schema' ? 1 : 'x' };
      f.service.security = {
        checkRateLimit: async () => { if (stage === 'rate') throw failure; },
        encryptPii: () => { if (stage === 'encryption') throw failure; return {}; },
      } as never;
      const operation = mode === 'bulk'
        ? bulkImpl(f.service, secrets, { inserts: [row] }, {})
        : bulkAcrossImpl(f.service, [{ collection: secrets, inserts: [row], schemas: {} }]);
      await expect(operation).rejects.toThrow();
      expect(f.state.setLoading).not.toHaveBeenCalledWith(secrets, true);
      expect(f.bulk).not.toHaveBeenCalled();
    }
  });

  it.each(['bulk', 'across'])('composes duplicate patches and rolls back once in %s', async (mode) => {
    const gate = deferred();
    const started = deferred();
    let fail = false;
    const f = fixture(async () => {
      started.resolve();
      await gate.promise;
      if (fail) throw new Error('write failed');
    });
    const original = { id: 'p', name: 'n0', brandId: 'b0' };
    f.db.get('products')!.set('p', original);
    f.client.setQueryData(f.key('products'), { items: [original], total: 1 });
    const ops = { updates: [{ id: 'p', patch: { name: 'n1' } }, { id: 'p', patch: { brandId: 'b1' } }] };
    const run = () => mode === 'bulk'
      ? bulkImpl(f.service, 'products', ops, {}, { suppressToast: true } as never)
      : bulkAcrossImpl(f.service, [{ collection: 'products', ...ops, schemas: {} }]);
    const operation = run();
    await started.promise;
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [original], total: 1 });
    expect(f.client.getQueryData(['crud', 'products', 'get', 'p'])).toEqual({ id: 'p', name: 'n1', brandId: 'b1' });
    expect(f.state.updateOptimistic).toHaveBeenCalledTimes(2);
    gate.resolve();
    await operation;
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [{ id: 'p', name: 'n1', brandId: 'b1' }], total: 1 });
    f.db.get('products')!.set('p', original);
    f.client.setQueryData(f.key('products'), { items: [original], total: 1 });
    fail = true;
    await expect(run()).rejects.toThrow('write failed');
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [original], total: 1 });
    expect(f.state.rejectUpdate).toHaveBeenCalledTimes(1);
  });

  it.each(['bulk', 'across'])('does not decrement totals twice for duplicate deletes in %s', async (mode) => {
    const f = fixture();
    const rows = [{ id: 'p' }, { id: 'q' }];
    for (const row of rows) f.db.get('products')!.set(row.id, row);
    f.client.setQueryData(f.key('products'), { items: rows, total: 2 });
    if (mode === 'bulk') await bulkImpl(f.service, 'products', { deletes: ['p', 'p'] }, {});
    else await bulkAcrossImpl(f.service, [{ collection: 'products', deletes: ['p', 'p'], schemas: {} }]);
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [{ id: 'q' }], total: 1 });
  });

  it.each(['bulk', 'across'])('bounds a stuck refetch, cancels its query and reconciles late settlement in %s', async (mode) => {
    vi.useFakeTimers();
    const write = deferred();
    const fetch = deferred();
    const started = deferred();
    const f = fixture(async () => { started.resolve(); await write.promise; });
    const old = { id: 'old' };
    f.client.setQueryData(f.key('products'), { items: [old], total: 1 });
    let calls = 0;
    const observer = new QueryObserver(f.client, {
      queryKey: f.key('products'), staleTime: Infinity,
      queryFn: async () => {
        if (++calls === 1) { await fetch.promise; return { items: [old], total: 1 }; }
        const items = [...f.db.get('products')!.values()];
        return { items, total: items.length };
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    f.service.invalidateCollection = (collection) => invalidateCollectionImpl(f.service, collection);
    const operation = (mode === 'bulk'
      ? bulkImpl(f.service, 'products', { inserts: [{ id: 'products-1' }] }, {})
      : bulkAcrossImpl(f.service, [batch('products')])).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT * 2 + 1);
    expect(await operation).toMatchObject({ name: 'TimeoutError' });
    expect(f.state.setLoading).toHaveBeenLastCalledWith('products', false);
    write.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1' }] });
    fetch.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1' }] });
    unsubscribe();
  });

  it.each(['bulk', 'across'])('observes throwing late reconciliation diagnostics in %s', async (mode) => {
    vi.useFakeTimers();
    const write = deferred();
    const started = deferred();
    const f = fixture(async () => { started.resolve(); await write.promise; });
    f.invalidate.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('late refetch failed'));
    const operation = (mode === 'bulk'
      ? bulkImpl(f.service, 'products', { deletes: ['p'] }, {})
      : bulkAcrossImpl(f.service, [batch('products')])).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT + 1);
    expect(await operation).toMatchObject({ name: 'TimeoutError' });
    reportError.mockImplementation(() => { throw new Error('logger failed'); });
    write.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
  });

  it.each(['bulk', 'across'])('preserves write failures and cleanup when real store subscribers throw in %s', async (mode) => {
    const original = new Error('write failed');
    const f = fixture(async () => { throw original; });
    f.service.store = useCrudStore;
    let armed = false;
    const unsubscribe = useCrudStore.subscribe((state) => {
      const collection = state.collections.products;
      if (armed && collection?.error === original) throw new Error('error subscriber');
      if (armed && collection?.loading === false && collection?.error !== null) throw new Error('loading subscriber');
    });
    armed = true;
    const operation = mode === 'bulk'
      ? bulkImpl(f.service, 'products', { deletes: ['p'] }, {})
      : bulkAcrossImpl(f.service, [{ collection: 'products', deletes: ['p'], schemas: {} }]);
    await expect(operation).rejects.toBe(original);
    expect(useCrudStore.getState().collections.products?.loading).toBe(false);
    unsubscribe();
    useCrudStore.setState({ collections: {} });
  });

  it.each(['bulk', 'across'])('preserves the write failure when diagnostics throw in %s', async (mode) => {
    const original = new Error('write failed');
    const f = fixture(async () => { throw original; });
    f.invalidate.mockRejectedValue(new Error('refetch failed'));
    reportError.mockImplementation(() => { throw new Error('logger failed'); });
    const operation = mode === 'bulk'
      ? bulkImpl(f.service, 'products', { deletes: ['p'] }, {})
      : bulkAcrossImpl(f.service, [batch('products')]);
    await expect(operation).rejects.toBe(original);
    expect(f.state.setLoading).toHaveBeenLastCalledWith('products', false);
    reportError.mockImplementation((error: unknown) => error);
  });
  it.each([
    { ...result() },
    { ...result(['same', 'same']) },
    { ...result(['new']), updatedIds: ['unknown'] },
    { ...result(), failed: [{ op: 'insert', index: 2, error: 'denied' }] },
  ])('stops dependent waves and cleans owned pending state before refetch for invalid ack %j', async (ack) => {
    const f = fixture(async () => ack as BulkResult);
    // Cold: in no cache; the update rules read the stored row once.
    f.db.get('products')!.set('cold', { id: 'cold', name: 'stored', status: 'available' });
    f.invalidate.mockImplementation(async () => {
      expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(2);
      expect(f.state.rejectUpdate).toHaveBeenCalledWith('products', 'cold');
      expect(f.client.getQueryData(['crud', 'products', 'get', 'cold'])).toBeUndefined();
    });
    await expect(bulkAcrossImpl(f.service, [
      { ...batch('products'), updates: [{ id: 'cold', patch: { name: 'optimistic' } }] },
      batch('events', ['products']),
    ])).rejects.toThrow();
    expect(f.bulk).toHaveBeenCalledTimes(1);
    expect(f.state.confirmOptimistic).not.toHaveBeenCalled();
    expect(f.state.confirmUpdate).not.toHaveBeenCalled();
  });

  it('allows complete legacy acknowledgements before downstream waves', async () => {
    const f = fixture(async (collection) => ({
      insertedIds: [`${collection}-1`], updatedIds: [], deletedIds: [],
    }) as BulkResult);
    await expect(bulkAcrossImpl(f.service, [batch('products'), batch('events', ['products'])]))
      .resolves.toEqual({ results: { products: result(['products-1']), events: result(['events-1']) } });
    expect(f.state.confirmOptimistic).toHaveBeenCalledTimes(2);
  });
  it.each(['throw', 'partial'])('keeps the product when the offer fails (%s), without executing dependents', async (mode) => {
    const error = new Error('offer rejected');
    const f = fixture(async (collection) => {
      if (collection !== 'stock_movements') return;
      if (mode === 'throw') throw error;
      return { ...result(), failed: [{ op: 'insert', index: 0, id: 'stock_movements-1', error: 'denied' }] };
    });
    const promise = bulkAcrossImpl(f.service, [
      batch('products'), batch('stock_movements', ['products']), batch('events', ['stock_movements']),
    ]);
    if (mode === 'throw') await expect(promise).rejects.toBe(error);
    else await expect(promise).rejects.toThrow('rows not written in stock_movements (1)');
    expect(f.db.get('products')?.has('products-1')).toBe(true);
    expect(f.db.get('stock_movements')?.size).toBe(0);
    expect(f.bulk.mock.calls.map(([collection]) => collection)).toEqual(['products', 'stock_movements']);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1' }] });
    if (mode === 'partial') {
      expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(2);
      expect(f.state.confirmOptimistic).toHaveBeenCalledTimes(1);
    } else {
      expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(3);
      expect(f.state.confirmOptimistic).not.toHaveBeenCalled();
    }
  });

  it('waits for a delayed sibling commit before rollback, refetch and rejection', async () => {
    const gate = deferred();
    const started = deferred();
    const failed = deferred();
    const error = new Error('offer rejected early');
    const f = fixture(async (collection) => {
      if (collection === 'stock_movements') { failed.resolve(); throw error; }
      if (collection === 'products') { started.resolve(); await gate.promise; }
    });
    const operation = bulkAcrossImpl(f.service, [batch('stock_movements'), batch('products'), batch('events', ['products'])]);
    let finished = false;
    const outcome = operation.catch((error: unknown) => { finished = true; return error; });
    await Promise.all([started.promise, failed.promise]);
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(f.invalidate).not.toHaveBeenCalled();
    expect(f.state.rejectOptimistic).not.toHaveBeenCalled();
    gate.resolve();
    expect(await outcome).toBe(error);
    expect(f.events.indexOf('commit:products')).toBeLessThan(f.events.indexOf('refetch:products'));
    expect(f.bulk).toHaveBeenCalledTimes(2);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1' }] });
  });

  it.each([new Error('first rejection'), null])('preserves the first rejection rather than input order or an aggregate (%s)', async (firstError) => {
    const gate = deferred();
    const rejected = deferred();
    const f = fixture(async (collection) => {
      if (collection === 'products') {
        await gate.promise;
        throw new Error('later rejection');
      }
      rejected.resolve();
      throw firstError;
    });
    const operation = bulkAcrossImpl(f.service, [batch('products'), batch('stock_movements')]);
    const assertion = expect(operation).rejects.toBe(firstError);
    await rejected.promise;
    await Promise.resolve();
    gate.resolve();
    await assertion;
  });

  it('returns unchanged per-collection results for independent and dependent successful waves', async () => {
    const gate = deferred();
    const bothStarted = deferred();
    let starts = 0;
    const f = fixture(async (collection) => {
      if (collection === 'events') return;
      if (++starts === 2) bothStarted.resolve();
      await gate.promise;
    });
    const operation = bulkAcrossImpl(f.service, [batch('products'), batch('orders'), batch('events', ['products'])]);
    await bothStarted.promise;
    expect(f.bulk).toHaveBeenCalledTimes(2);
    expect(f.state.addOptimistic).toHaveBeenCalledTimes(3);
    gate.resolve();
    await expect(operation).resolves.toEqual({ results: {
      products: result(['products-1']), orders: result(['orders-1']), events: result(['events-1']),
    } });
    expect(f.events.indexOf('start:events')).toBeGreaterThan(f.events.indexOf('commit:orders'));
    expect(f.state.confirmOptimistic).toHaveBeenCalledTimes(3);
    expect(f.invalidate).toHaveBeenCalledTimes(3);
  });

  it('restores all optimistic buckets before refetch, never patching stale snapshots afterward', async () => {
    const error = new Error('offer failure');
    const f = fixture(async (collection) => { if (collection === 'stock_movements') throw error; });
    const old = { id: 'old', name: 'before' };
    const removed = { id: 'removed', name: 'before' };
    f.db.get('products')!.set(old.id, old);
    f.db.get('products')!.set(removed.id, removed);
    f.client.setQueryData(f.key('products'), { items: [old, removed], total: 2 });
    f.invalidate.mockImplementation(async (collection) => {
      // All rollback patches and store rejection must precede ANY invalidation.
      expect(f.state.rejectUpdate).toHaveBeenCalledWith('products', 'old');
      expect(f.state.rejectDelete).toHaveBeenCalledWith('products', 'removed');
      expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(2);
      const items = [...f.db.get(collection)!.values()];
      f.client.setQueryData(f.key(collection), { items, total: items.length });
    });
    await expect(bulkAcrossImpl(f.service, [
      { ...batch('products'), updates: [{ id: 'old', patch: { name: 'committed' } }], deletes: ['removed'] },
      batch('stock_movements', ['products']),
    ])).rejects.toBe(error);
    expect(f.client.getQueryData(f.key('products'))).toEqual({ items: [
      { id: 'old', name: 'committed' }, { id: 'products-1', status: 'available' },
    ], total: 2 });
  });

  it('awaits all invalidations and preserves the write error if refetch rejects', async () => {
    const gate = deferred();
    const refetchStarted = deferred();
    const error = new Error('write failed');
    const f = fixture(async () => { throw error; });
    f.invalidate.mockImplementation(async (collection) => {
      if (collection === 'products') throw new Error('refetch failed');
      refetchStarted.resolve();
      await gate.promise;
    });
    let finished = false;
    const outcome = bulkAcrossImpl(f.service, [batch('products'), batch('stock_movements')])
      .catch((error: unknown) => { finished = true; return error; });
    await refetchStarted.promise;
    expect(finished).toBe(false);
    gate.resolve();
    expect(await outcome).toBe(error);
    expect(f.state.setLoading).toHaveBeenCalledWith('stock_movements', false);
  });

  it('bounds caller completion and clears loading when the raw write stays pending forever', async () => {
    vi.useFakeTimers();
    const started = deferred();
    const f = fixture(async () => { started.resolve(); await new Promise<void>(() => {}); });
    const outcome = bulkAcrossImpl(f.service, [batch('products')]).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT * 2 + 2000);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    expect(f.bulk).toHaveBeenCalledTimes(1);
    expect(f.invalidate).toHaveBeenCalledTimes(1);
    expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(1);
    expect(f.state.setLoading).toHaveBeenLastCalledWith('products', false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never retries a timed-out write and reconciles its late commit', async () => {
    vi.useFakeTimers();
    const gates = [deferred()];
    const started = deferred();
    let attempts = 0;
    const f = fixture(async () => {
      const attempt = attempts++;
      started.resolve();
      await gates[attempt]!.promise;
      f.db.get('products')!.set('products-1', { id: 'products-1', attempt });
      return result(['products-1']);
    });
    const outcome = bulkAcrossImpl(f.service, [batch('products')]).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT * 2 + 2000);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    expect(attempts).toBe(1);
    for (const attempt of [0]) {
      gates[attempt]!.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1', attempt }] });
    }
    expect(f.invalidate).toHaveBeenCalledTimes(2);
    expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(1);
    expect(f.state.confirmOptimistic).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('reconciles a sibling raw attempt that settles after failure returns (%s)', async (settlement) => {
    vi.useFakeTimers();
    const gate = deferred();
    const started = deferred();
    const original = new Error('offer denied');
    let attempts = 0;
    const f = fixture(async (collection) => {
      if (collection === 'stock_movements') throw original;
      if (++attempts > 1) throw new Error('retry denied');
      started.resolve();
      await gate.promise;
      if (settlement === 'reject') throw new Error('late rejection');
    });
    const outcome = bulkAcrossImpl(f.service, [batch('products'), batch('stock_movements'), batch('events', ['products'])])
      .catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT + 2000);
    expect(await outcome).toBe(original);
    expect(f.state.setLoading).toHaveBeenCalledWith('products', false);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [] });
    const rollbackCount = f.state.rejectOptimistic.mock.calls.length;
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.invalidate.mock.calls.map(([collection]) => collection)).toEqual(['products', 'stock_movements', 'events', 'products']);
    expect(f.client.getQueryData(f.key('products'))).toMatchObject({
      items: settlement === 'resolve' ? [{ id: 'products-1' }] : [],
    });
    expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(rollbackCount);
    expect(f.state.confirmOptimistic).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('reconciles a timed-out raw attempt without replaying it', async () => {
    vi.useFakeTimers();
    const gate = deferred();
    const started = deferred();
    let attempts = 0;
    const f = fixture(async () => {
      if (++attempts === 1) {
        started.resolve();
        await gate.promise;
        f.db.get('products')!.set('late-id', { id: 'late-id', name: 'authoritative' });
        return result(['late-id']);
      }
      throw new Error('bulk must not be replayed');
    });
    const outcome = bulkAcrossImpl(f.service, [batch('products')]).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT + 2000);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    expect(attempts).toBe(1);
    expect(f.state.setLoading).toHaveBeenLastCalledWith('products', false);
    const confirmations = f.state.confirmOptimistic.mock.calls.length;
    const rejections = f.state.rejectOptimistic.mock.calls.length;
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.client.getQueryData(f.key('products'))).toEqual({
      items: [...f.db.get('products')!.values()], total: f.db.get('products')!.size,
    });
    expect(f.state.confirmOptimistic).toHaveBeenCalledTimes(confirmations);
    expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(rejections);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
  });

  it('stops downstream waves after timeout and reconciles late settlement', async () => {
    vi.useFakeTimers();
    const raw = deferred();
    const started = deferred();
    const f = fixture(async () => {
      started.resolve();
      await raw.promise;
      f.db.get('products')!.set('late-id', { id: 'late-id' });
      return result(['late-id']);
    });
    const operation = bulkAcrossImpl(f.service, [batch('products'), batch('events', ['products'])])
      .catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT + 2000);
    expect(await operation).toMatchObject({ name: 'TimeoutError' });
    expect(f.bulk).toHaveBeenCalledTimes(1);
    raw.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.invalidate.mock.calls.map(([collection]) => collection)).toEqual(['products', 'events', 'products']);
    expect(f.client.getQueryData(f.key('products'))).toEqual({
      items: [...f.db.get('products')!.values()], total: 1,
    });
  });

  it.each([false, true])('serializes late refetch behind initial reconciliation without replacing the write error (refetch fails: %s)', async (refetchFails) => {
    vi.useFakeTimers();
    const raw = deferred();
    const started = deferred();
    const refetch = deferred();
    const original = new Error('offer denied');
    const refetchError = new Error('late refetch denied');
    let attempts = 0;
    const f = fixture(async (collection) => {
      if (collection === 'stock_movements') throw original;
      if (++attempts > 1) throw new Error('retry denied');
      started.resolve();
      await raw.promise;
    });
    let productFetches = 0;
    f.invalidate.mockImplementation(async (collection) => {
      expect(f.state.rejectOptimistic).toHaveBeenCalledTimes(2);
      if (collection !== 'products') return;
      if (++productFetches > 1) {
        if (refetchFails) throw refetchError;
        const items = [...f.db.get(collection)!.values()];
        f.client.setQueryData(f.key(collection), { items, total: items.length });
        return;
      }
      await refetch.promise;
      // Simulate an initial request holding an old server snapshot.
      f.client.setQueryData(f.key(collection), { items: [], total: 0 });
    });
    const outcome = bulkAcrossImpl(f.service, [batch('products'), batch('stock_movements')]).catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(DEFAULT_CRUD_TIMEOUT + 2000);
    raw.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(productFetches).toBe(1);
    refetch.resolve();
    expect(await outcome).toBe(original);
    await vi.advanceTimersByTimeAsync(0);
    expect(productFetches).toBe(2);
    if (refetchFails) {
      expect(reportError).toHaveBeenCalledWith(refetchError, {
        context: { operation: 'bulkAcross.lateReconciliation', collection: 'products' }, showNotification: false,
      });
    } else {
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(f.client.getQueryData(f.key('products'))).toMatchObject({ items: [{ id: 'products-1' }] });
    }
    expect(f.state.setError.mock.calls.every(([, error]) => error === null || error === original)).toBe(true);
  });
});
