// packages/features/crud/src/__tests__/CrudService.bulkAcross.toast.test.ts

import { describe, it, expect, vi } from 'vitest';

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock('@donotdev/components', () => ({ toast: toastSpy }));

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
  getI18nInstance: () => ({
    t: (key: string, options?: { entity?: string }) => `${key}:${options?.entity ?? ''}`,
  }),
  handleError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
}));

vi.mock('../CrudService.cache', () => ({ updateListCaches: vi.fn() }));

vi.mock('../CrudService.internal', () => ({
  assertCanAccess: vi.fn(),
  ensureAdapter: vi.fn(async () => {}),
  getPiiFields: () => [],
  rateLimitKey: () => 'key',
  shouldShowSuccessToast: () => true,
  getEntityName: (collection: string) => `Name(${collection})`,
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


const okBulk = () =>
  vi.fn(async (_collection: string, ops: { inserts?: Array<{ id?: string }>; updates?: Array<{ id: string }> }) => ({
    insertedIds: (ops.inserts ?? []).map((row) => row.id ?? 'generated'),
    updatedIds: (ops.updates ?? []).map((row) => row.id),
    deletedIds: [],
    failed: [],
  }));
// Each update carries its stored row (the CRUD update rules run on it).
const batches = [
  {
    collection: productEntity.collection,
    updates: [{ id: 'p1', patch: { name: 'Serum' }, stored: { id: 'p1', name: 'Toner', status: 'available' } }],
    schemas: { update: {} } as never,
  },
  {
    collection: productOfferEntity.collection,
    updates: [{ id: 'o1', patch: { price: 3 }, stored: { id: 'o1', productId: 'p1', price: 2, status: 'available' } }],
    schemas: { update: {} } as never,
  },
];

describe('bulkAcrossImpl — toasts name the primary record', () => {
  it('success: the entity name of the first batch collection', async () => {
    toastSpy.mockClear();
    await bulkAcrossImpl(makeService(okBulk()), batches);
    expect(toastSpy).toHaveBeenCalledExactlyOnceWith('success', 'messages.updateSuccess:Name(products)');
  });

  it('success: successMessage overrides the default', async () => {
    toastSpy.mockClear();
    await bulkAcrossImpl(makeService(okBulk()), batches, { successMessage: 'Campaign saved' });
    expect(toastSpy).toHaveBeenCalledExactlyOnceWith('success', 'Campaign saved');
  });

  it('error: the entity name of the first batch collection', async () => {
    toastSpy.mockClear();
    const failing = vi.fn(async () => { throw new Error('denied'); });
    await expect(bulkAcrossImpl(makeService(failing), batches)).rejects.toThrow();
    expect(toastSpy).toHaveBeenCalledWith('error', 'messages.updateError:Name(products)');
  });
});
