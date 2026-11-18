// packages/features/crud/src/__tests__/CrudService.bulkAcross.test.ts

/**
 * @fileoverview CrudService.bulkAcross() — pre-minted ids
 * @description Regression: the create schema excludes technical fields (`id`), so
 * validation stripped the caller's pre-minted id and dependent batches referenced a
 * row that was written under another id (BULK_ACROSS.md "Pre-Minted IDs").
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', async () => ({
  // The CRUD rules run for real (core/schemas crud/), on the shared test entities.
  ...(await vi.importActual<Record<string, unknown>>('@donotdev/core')),
  BulkAcrossCycleError: class extends Error {},
  BulkCollisionError: class extends Error {},
  detectBulkCollisions: () => ({ collisions: [], where: null }),
  generateUUID: (() => {
    let i = 0;
    return () => `temp-${++i}`;
  })(),
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
}));

vi.mock('../CrudService.cache', () => ({ updateListCaches: vi.fn() }));

vi.mock('../CrudService.internal', () => ({
  assertCanAccess: vi.fn(),
  ensureAdapter: vi.fn(async () => {}),
  getPiiFields: () => [],
  rateLimitKey: () => 'key',
  shouldShowSuccessToast: () => false,
  withResilience: <T>(fn: () => Promise<T>) => fn(),
}));

import { productEntity, productOfferEntity } from '@dndev/test-entities';

import { bulkAcrossImpl } from '../CrudService.bulkAcross';
import type { CrudServiceInternal } from '../types';

function makeService(adapterBulk: ReturnType<typeof vi.fn>) {
  const state = {
    setLoading: vi.fn(),
    setError: vi.fn(),
    addOptimistic: vi.fn(),
    confirmOptimistic: vi.fn(),
    rejectOptimistic: vi.fn(),
    updateOptimistic: vi.fn(),
    confirmUpdate: vi.fn(),
    rejectUpdate: vi.fn(),
    deleteOptimistic: vi.fn(),
    confirmDelete: vi.fn(),
    rejectDelete: vi.fn(),
  };
  const queryClient = {
    getQueryData: vi.fn(() => null),
    getQueriesData: vi.fn(() => []),
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(() => Promise.resolve()),
  };
  // why: test double of the service internals bulkAcrossImpl reads
  return {
    adapter: { bulk: adapterBulk },
    store: { getState: () => state },
    security: null,
    currentUserId: 'user-1',
    getQueryClient: () => queryClient,
    invalidateCollection: vi.fn(async () => {}),
  } as unknown as CrudServiceInternal;
}

describe('bulkAcrossImpl — pre-minted ids', () => {
  it('rejects atomic requests before any legacy side effect, including empty requests', async () => {
    const adapterBulk = vi.fn();
    const service = makeService(adapterBulk);
    const state = service.store!.getState();
    for (const batches of [[], [{ collection: 'products', inserts: [{ id: 'p1' }], schemas: {} }]]) {
      await expect(bulkAcrossImpl(service, batches, { execution: 'atomic' })).rejects.toMatchObject({
        name: 'AtomicBulkError', outcome: 'not-committed',
      });
    }
    expect(adapterBulk).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
    expect(state.addOptimistic).not.toHaveBeenCalled();
    expect(service.invalidateCollection).not.toHaveBeenCalled();
  });

  // The create schema excludes technical fields (`id`): the rules never write it, the
  // writer restores the caller's pre-minted id.
  it('sends the caller-provided id of an insert to the adapter', async () => {
    const adapterBulk = vi.fn(async (_collection: string, ops: { inserts?: Array<{ id?: string }> }) => ({
      insertedIds: (ops.inserts ?? []).map((row) => row.id ?? 'generated'),
      updatedIds: [],
      deletedIds: [],
      failed: [],
    }));
    const service = makeService(adapterBulk);
    const schemas = { create: {} } as never;

    await bulkAcrossImpl(service, [
      { collection: productEntity.collection, inserts: [{ id: 'p-1', name: 'Serum' }], schemas },
      { collection: productOfferEntity.collection, inserts: [{ productId: 'p-1', price: 1 }], schemas, dependsOn: ['products'] },
    ]);

    const productsCall = adapterBulk.mock.calls.find(([collection]) => collection === 'products');
    expect(productsCall?.[1].inserts?.[0]).toMatchObject({ id: 'p-1', name: 'Serum' });
    const offersCall = adapterBulk.mock.calls.find(([collection]) => collection === 'product_offers');
    expect(offersCall?.[1].inserts?.[0]).not.toHaveProperty('id');
  });
});

// Regression: the legacy (non-atomic) mode sent update patches unvalidated while the
// atomic mode validated them with the write schema of their resulting status. The CRUD
// rules run on the entity's schemas (whatever the batch passes) and the stored row.
describe('bulkAcrossImpl — legacy mode validates update patches', () => {
  const result = { insertedIds: [], updatedIds: ['o'], deletedIds: [], failed: [] };
  const offers = productOfferEntity.collection;
  const available = { id: 'o', productId: 'p', price: 3, status: 'available' };
  const draft = { ...available, status: 'draft' };

  it('rejects an invalid patch before the adapter write', async () => {
    const adapterBulk = vi.fn(async () => result);
    const service = makeService(adapterBulk);
    const schemas = {} as never;
    await expect(
      bulkAcrossImpl(service, [{ collection: offers, updates: [{ id: 'o', patch: { price: null }, stored: available }], schemas }])
    ).rejects.toThrow(/validation/i);
    expect(adapterBulk).not.toHaveBeenCalled();
  });

  it('writes the parse output of a valid patch', async () => {
    const adapterBulk = vi.fn(async () => result);
    const service = makeService(adapterBulk);
    const schemas = {} as never;
    await bulkAcrossImpl(service, [{ collection: offers, updates: [{ id: 'o', patch: { price: 5 }, stored: available }], schemas }]);
    expect(adapterBulk).toHaveBeenCalledWith(offers, expect.objectContaining({ updates: [{ id: 'o', patch: { price: 5 } }] }));
  });

  it('validates a patch of a draft with the draft schema', async () => {
    const adapterBulk = vi.fn(async () => result);
    const service = makeService(adapterBulk);
    const schemas = {} as never;
    await bulkAcrossImpl(service, [{ collection: offers, updates: [{ id: 'o', patch: { status: 'draft', price: null }, stored: available }], schemas }]);
    expect(adapterBulk).toHaveBeenCalledTimes(1);
  });

  // Regression: the form validated a stored draft with the draft schema (its
  // defaultValues.status) while bulkAcross, without the row in its caches, used
  // the update schema: the caller's stored row picks the same schema.
  it("picks the write schema from the caller's stored row", async () => {
    const adapterBulk = vi.fn(async () => result);
    const service = makeService(adapterBulk);
    const schemas = {} as never;
    await bulkAcrossImpl(service, [{ collection: offers, updates: [{ id: 'o', patch: { price: null }, stored: draft }], schemas }]);
    expect(adapterBulk).toHaveBeenCalledTimes(1);
    await expect(
      bulkAcrossImpl(service, [{ collection: offers, updates: [{ id: 'o', patch: { price: null }, stored: available }], schemas }])
    ).rejects.toThrow(/validation/i);
  });
});
