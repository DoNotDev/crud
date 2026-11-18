import { describe, expect, it, vi } from 'vitest';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));
vi.mock('@donotdev/core', async () => ({
  // The CRUD rules run for real (core/schemas crud/), on the shared test entities.
  ...(await vi.importActual<Record<string, unknown>>('@donotdev/core')),
  generateUUID: () => 'generated-id',
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: (error: unknown) => error,
  hasRestrictedVisibility: () => false,
}));
vi.mock('../CrudService.cache', () => ({ updateListCaches: vi.fn(), updateGetCache: vi.fn() }));
vi.mock('../CrudService.internal', () => ({
  assertCanAccess: vi.fn(), ensureAdapter: vi.fn(async () => {}),
  getPiiFields: (schema?: { metadata?: { security?: { piiFields?: string[] } } }) => schema?.metadata?.security?.piiFields ?? [],
  rateLimitKey: () => 'key', shouldShowSuccessToast: () => false,
}));

import { catalogItemEntity, piiSecretEntity, productEntity, productOfferEntity } from '@dndev/test-entities';

import { bulkAcrossImpl } from '../CrudService.bulkAcross';
import { assertCanAccess } from '../CrudService.internal';
import { entitySchemasOf } from '../CrudService.writeRules';
import { AtomicBulkError } from '../../../../core/types/src/crud/errors';
import type { PreparedAtomicBatch } from '../../../../core/types/src/crud/types';
import type { CrudServiceInternal } from '../types';

function fixture(reject = false) {
  const db = new Map<string, Map<string, Record<string, unknown>>>();
  const preflight = vi.fn(async (_batches: PreparedAtomicBatch[]) => {});
  const execute = vi.fn(async (batches: PreparedAtomicBatch[]) => {
    if (reject) throw new AtomicBulkError('denied', 'not-committed');
    const results: Record<string, { insertedIds: string[]; updatedIds: string[]; deletedIds: string[]; failed: [] }> = Object.create(null);
    for (const batch of batches) {
      const rows = new Map<string, Record<string, unknown>>();
      for (const row of batch.inserts ?? []) rows.set(row.id, row);
      db.set(batch.collection, rows);
      results[batch.collection] = { insertedIds: (batch.inserts ?? []).map((r) => r.id), updatedIds: [], deletedIds: [], failed: [] };
    }
    return { results };
  });
  const state = Object.fromEntries(['setLoading', 'setError', 'addOptimistic', 'confirmOptimistic', 'rejectOptimistic', 'updateOptimistic', 'confirmUpdate', 'rejectUpdate', 'deleteOptimistic', 'confirmDelete', 'rejectDelete'].map((key) => [key, vi.fn()]));
  const service = { adapter: { atomicBulkAcross: { preflight, execute }, bulk: vi.fn() }, store: { getState: () => state }, security: null,
    getQueryClient: () => ({ getQueriesData: () => [], getQueryData: () => null }), invalidateCollection: vi.fn(async () => {}) } as unknown as CrudServiceInternal;
  return { service, db, execute, preflight, state };
}
const products = productEntity.collection;
const offers = productOfferEntity.collection;
const secrets = piiSecretEntity.collection;
const batches = [
  { collection: products, inserts: [{ id: 'p', name: 'product' }], schemas: {} },
  { collection: offers, inserts: [{ id: 'o', productId: 'p', price: 1 }], schemas: {}, dependsOn: [products] },
];

describe('atomic bulkAcross', () => {
  it('keeps the acknowledged atomic result when audit throws', async () => {
    const f = fixture();
    f.service.security = { checkRateLimit: vi.fn(), audit: () => { throw new Error('sensitive'); } } as never;
    const output = await bulkAcrossImpl(f.service, batches, { execution: 'atomic' });
    expect(output.results.products?.insertedIds).toEqual(['p']);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.state.rejectOptimistic).not.toHaveBeenCalled();
    expect(f.db.get(offers)?.has('o')).toBe(true);
  });
  it('commits both collections exactly once preserving references', async () => {
    const f = fixture();
    const result = await bulkAcrossImpl(f.service, batches, { execution: 'atomic' });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.db.get(products)?.has('p')).toBe(true);
    expect(f.db.get(offers)?.get('o')?.productId).toBe('p');
    expect(result.results[offers]?.insertedIds).toEqual(['o']);
  });
  it('leaves both collections absent on definitive rejection', async () => {
    const f = fixture(true);
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.db.size).toBe(0);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, {}, [null], [{ collection: 'x', schemas: null }],
    [{ collection: 'x', schemas: {}, inserts: '' }],
    [{ collection: 'x', schemas: {}, updates: [{ id: 'x', patch: null }] }],
    [{ collection: 'x', schemas: {}, dependsOn: [null] }],
    [{ collection: 'x', schemas: { create: false } }],
    [{ collection: 'x', schemas: { draft: {} } }],
  ])('rejects malformed structure before effects: %j', async (input) => {
    const f = fixture();
    await expect(bulkAcrossImpl(f.service, input as never, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('returns a safe own result for prototype-named collections', async () => {
    const f = fixture();
    const result = await bulkAcrossImpl(f.service, [{ collection: '__proto__', inserts: [{ id: 'p' }], schemas: {} }], { execution: 'atomic' });
    expect(Object.hasOwn(result.results, '__proto__')).toBe(true);
    expect(result.results.__proto__.insertedIds).toEqual(['p']);
    expect(Object.getPrototypeOf(result.results)).toBeNull();
  });
  // The rules pick the schema of the row's status from the entity (`entitySchemasOf`),
  // whatever the batch passes; access and PII read that schema.
  it('uses the draft schema for both access and PII encryption', async () => {
    const f = fixture();
    const encryptPii = vi.fn((row: Record<string, unknown>) => ({ ...row, secret: 'encrypted' }));
    f.service.security = { encryptPii, checkRateLimit: vi.fn(), audit: vi.fn() } as never;
    await bulkAcrossImpl(f.service, [{ collection: secrets, inserts: [{ id: 'p', status: 'draft', secret: 'plaintext' }], schemas: {} }], { execution: 'atomic' });
    expect(assertCanAccess).toHaveBeenCalledWith(f.service.adapter, secrets, entitySchemasOf(secrets).draft);
    expect(encryptPii).toHaveBeenCalledWith(expect.objectContaining({ secret: 'plaintext' }), ['secret']);
    expect(f.db.get(secrets)?.get('p')?.secret).toBe('encrypted');
  });
  it('uses the draft schema for a draft patch: access and PII encryption', async () => {
    const f = fixture();
    const encryptPii = vi.fn((row: Record<string, unknown>) => ({ ...row, secret: 'encrypted' }));
    f.service.security = { encryptPii, checkRateLimit: vi.fn(), audit: vi.fn() } as never;
    f.execute.mockImplementationOnce(async () => ({ results: { [secrets]: { insertedIds: [], updatedIds: ['p'], deletedIds: [], failed: [] } } }));
    const stored = { id: 'p', secret: 'old', status: 'available' };
    await bulkAcrossImpl(f.service, [{ collection: secrets, updates: [{ id: 'p', patch: { status: 'draft', secret: 'plaintext' }, stored }], schemas: {} }], { execution: 'atomic' });
    expect(assertCanAccess).toHaveBeenCalledWith(f.service.adapter, secrets, entitySchemasOf(secrets).draft);
    expect(encryptPii).toHaveBeenCalledWith({ status: 'draft', secret: 'plaintext' }, ['secret']);
    expect(f.execute.mock.calls[0]![0][0]!.updates![0]!.patch.secret).toBe('encrypted');
  });
  // Regression (one status rule): no other schema stands in for the one the status needs:
  // a non-draft patch is checked with the update rules, whatever schemas the batch passes.
  it('rejects an invalid non-draft patch when only the draft schema is passed, before effects', async () => {
    const f = fixture();
    const draft = entitySchemasOf(offers).draft;
    const stored = { id: 'o', productId: 'p', price: 1, status: 'available' };
    await expect(bulkAcrossImpl(f.service, [{ collection: offers, updates: [{ id: 'o', patch: { price: null }, stored }], schemas: { draft } }], { execution: 'atomic' }))
      .rejects.toThrow(/validation/i);
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  // Regression (one status rule): an update of a stored draft without a status change is a draft write.
  it('validates a patch of a cached stored draft with the draft schema', async () => {
    const f = fixture();
    f.service.getQueryClient = (() => ({ getQueriesData: () => [], getQueryData: () => ({ id: 'o', productId: 'p', price: 1, status: 'draft' }) })) as never;
    f.execute.mockImplementationOnce(async () => ({ results: { [offers]: { insertedIds: [], updatedIds: ['o'], deletedIds: [], failed: [] } } }));
    await bulkAcrossImpl(f.service, [{ collection: offers, updates: [{ id: 'o', patch: { price: null } }], schemas: {} }], { execution: 'atomic' });
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown execution modes without legacy calls', async () => {
    const f = fixture();
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'typo' as never })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.service.adapter!.bulk).not.toHaveBeenCalled();
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.state.setLoading).not.toHaveBeenCalled();
  });
  it('uses the original targets and payload for optimism and confirmation after rate limiting', async () => {
    const f = fixture();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    f.service.security = { checkRateLimit: async () => { entered(); await gate; }, audit: vi.fn() } as never;
    const items = catalogItemEntity.collection;
    f.execute.mockImplementationOnce(async () => ({ results: { [items]: { insertedIds: ['new'], updatedIds: ['update'], deletedIds: ['delete'], failed: [] } } }));
    const stored = { id: 'update', name: 'stored', status: 'available' };
    const input = [{ collection: items, inserts: [{ id: 'new', details: { name: 'original' } }], updates: [{ id: 'update', patch: { name: 'original' }, stored }], deletes: ['delete'], schemas: {} }];
    const operation = bulkAcrossImpl(f.service, input, { execution: 'atomic' });
    await ready;
    input[0]!.collection = 'changed';
    input[0]!.inserts[0]!.details.name = 'changed';
    input[0]!.updates[0]!.id = 'changed';
    input[0]!.updates[0]!.patch.name = 'changed';
    input[0]!.deletes[0] = 'changed';
    release();
    await expect(operation).resolves.toMatchObject({ results: { [items]: { deletedIds: ['delete'] } } });
    expect(f.state.addOptimistic).toHaveBeenCalledWith(items, expect.any(String), expect.objectContaining({ details: { name: 'original' } }));
    expect(f.state.updateOptimistic).toHaveBeenCalledWith(items, 'update', expect.objectContaining({ name: 'original' }), null);
    expect(f.state.confirmUpdate).toHaveBeenCalledWith(items, 'update');
    expect(f.state.confirmDelete).toHaveBeenCalledWith(items, 'delete');
    expect(f.state.rejectUpdate).not.toHaveBeenCalled();
  });
  it('rejects duplicate targets before effects', async () => {
    const f = fixture();
    await expect(bulkAcrossImpl(f.service, [{ ...batches[0]!, deletes: ['p'] }], { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects schema and access failures before effects', async () => {
    const f = fixture();
    // An offer without its required price fails the create rules.
    await expect(bulkAcrossImpl(f.service, [{ collection: offers, inserts: [{ id: 'o', productId: 'p' }], schemas: {} }], { execution: 'atomic' })).rejects.toThrow(/validation/i);
    vi.mocked(assertCanAccess).mockImplementationOnce(() => { throw new Error('access denied'); });
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'atomic' })).rejects.toThrow('access denied');
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects malformed update schema and duplicate collections without effects', async () => {
    const f = fixture();
    const stored = { id: 'p', name: 'stored', status: 'available' };
    await expect(bulkAcrossImpl(f.service, [{ collection: products, updates: [{ id: 'p', patch: { name: 1 }, stored }], schemas: {} }], { execution: 'atomic' })).rejects.toThrow(/validation/i);
    await expect(bulkAcrossImpl(f.service, [batches[0]!, batches[0]!], { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([null, {}, { execute: 1 }, false])('rejects malformed non-void plans before effects: %j', async (plan) => {
    const f = fixture();
    f.preflight.mockResolvedValueOnce(plan as never);
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.state.addOptimistic).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects a malformed empty-request plan', async () => {
    const f = fixture();
    f.preflight.mockResolvedValueOnce(null as never);
    await expect(bulkAcrossImpl(f.service, [], { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('preflight failure is definitively not committed and has no effects', async () => {
    const f = fixture();
    f.preflight.mockRejectedValueOnce(new Error('unsupported'));
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(f.state.setLoading).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('generates missing IDs once before preflight and execution', async () => {
    const f = fixture();
    await bulkAcrossImpl(f.service, [{ collection: products, inserts: [{ name: 'x' }], schemas: {} }], { execution: 'atomic' });
    expect(f.preflight.mock.calls[0]?.[0][0]?.inserts?.[0]?.id).toBe('generated-id');
    expect(f.execute.mock.calls[0]?.[0][0]?.inserts?.[0]?.id).toBe('generated-id');
  });
  it('treats malformed acknowledgements as unknown and reconciles', async () => {
    const f = fixture();
    f.execute.mockImplementationOnce(async () => ({ results: {} }));
    await expect(bulkAcrossImpl(f.service, batches, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.service.invalidateCollection).toHaveBeenCalledTimes(2);
  });
  it('times out without replay and reconciles late settlement', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let resolve!: (value: Awaited<ReturnType<typeof f.execute>>) => void;
      f.execute.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
      const operation = bulkAcrossImpl(f.service, batches, { execution: 'atomic' }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await operation).toMatchObject({ outcome: 'unknown' });
      expect(f.execute).toHaveBeenCalledTimes(1);
      resolve({ results: {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(f.service.invalidateCollection).toHaveBeenCalledTimes(4);
    } finally { vi.useRealTimers(); }
  });
  it('preflights supported empty requests without execute', async () => {
    const f = fixture();
    await expect(bulkAcrossImpl(f.service, [], { execution: 'atomic' })).resolves.toEqual({ results: {} });
    expect(f.preflight).toHaveBeenCalledWith([]);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
