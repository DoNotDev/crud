import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as v from 'valibot';

const native = vi.hoisted(() => ({ writes: [] as Array<{ path: string; data: unknown }>, commit: vi.fn(), batch: vi.fn(), doc: vi.fn(), initialize: vi.fn(), converter: vi.fn(), actor: 'actor' }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  getFirestore: native.initialize.mockReturnValue({}),
  doc: native.doc,
  writeBatch: native.batch.mockImplementation(() => ({
    set: (ref: { path: string }, data: unknown) => native.writes.push({ path: ref.path, data }),
    update: (ref: { path: string }, data: unknown) => native.writes.push({ path: ref.path, data }),
    delete: (ref: { path: string }) => native.writes.push({ path: ref.path, data: null }), commit: native.commit,
  })),
}));
vi.mock('../../../../providers/firebase/src/client/firestore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../providers/firebase/src/client/firestore')>();
  native.converter.mockImplementation(original.prepareForFirestore);
  return { ...original, prepareForFirestore: native.converter };
});
vi.mock('../../../../providers/firebase/src/client/sdk', () => ({
  getFirebaseSDK: () => ({ getApp: async () => ({}), getCurrentUser: () => ({ uid: native.actor }) }),
}));

import { catalogItemEntity, catalogPriceEntity, piiSecretEntity, restrictedSecretEntity } from '@dndev/test-entities';

import { bulkAcrossImpl } from '../CrudService.bulkAcross';
import { FirestoreAdapter } from '../../../../providers/firebase/src/client/FirestoreAdapter';
import type { CrudServiceInternal } from '../types';

beforeEach(() => {
  native.writes.length = 0; native.actor = 'actor';
  native.commit.mockReset().mockResolvedValue(undefined);
  native.batch.mockClear(); native.initialize.mockClear(); native.converter.mockClear();
  native.doc.mockReset().mockImplementation((_db, collection, id) => ({ path: `${collection}/${id}` }));
});

/**
 * The real Firestore adapter. `secure`: its database enforces field security
 * (`dbLevelSecurity`), as updates need: every update schema holds the technical `id`,
 * which a direct adapter may not write (`assertCanAccess`).
 */
function fixture({ secure = false }: { secure?: boolean } = {}) {
  const adapter = new FirestoreAdapter();
  if (secure) Object.assign(adapter, { dbLevelSecurity: true });
  const queryClient = new QueryClient();
  const service = { adapter, store: null, security: null,
    getQueryClient: () => queryClient, invalidateCollection: async () => {} } as unknown as CrudServiceInternal;
  return { adapter, service };
}

// Rows go to entities a direct (client) adapter may write: every field guest
// (shared test entities `catalogItemEntity`, `catalogPriceEntity`).
describe('atomic service to native adapter boundary', () => {
  // CRUD rule 8: an own `__proto__` is no entity field. Top-level it is an unknown field
  // (warned, not written); nested, the field's value schema keeps it out. It never reaches
  // the native write, and nothing is polluted.
  it.each(['top-level', 'nested', 'null-prototype top-level', 'null-prototype nested'] as const)('never writes an own __proto__ at %s and pollutes nothing', async (location) => {
    const { adapter, service } = fixture({ secure: true });
    const preflight = vi.spyOn(adapter.atomicBulkAcross, 'preflight');
    const payload = JSON.parse('{"__proto__":{"atomicPolluted":true}}') as Record<string, unknown>;
    const map = location.startsWith('null-prototype') ? Object.assign(Object.create(null), payload) as Record<string, unknown> : payload;
    const fields = location.endsWith('top-level') ? map : { details: map };
    expect(Object.hasOwn(map, '__proto__')).toBe(true);
    for (const operations of [
      { inserts: [Object.defineProperty(Object.create(Object.getPrototypeOf(fields), Object.getOwnPropertyDescriptors(fields)), 'id', { value: 'p', enumerable: true })] },
      { updates: [{ id: 'p', patch: fields, stored: { id: 'p', status: 'available' } }] },
    ]) {
      await bulkAcrossImpl(service, [{ collection: 'catalog_items', ...operations, schemas: {} }], { execution: 'atomic', showSuccessToast: false });
    }
    expect(preflight).toHaveBeenCalledTimes(2);
    expect(native.writes).toHaveLength(2);
    for (const { data } of native.writes) {
      const row = data as Record<string, unknown>;
      expect(Object.hasOwn(row, '__proto__')).toBe(false);
      if (row.details) expect(Object.hasOwn(row.details as object, '__proto__')).toBe(false);
    }
    expect(Object.hasOwn(Object.prototype, 'atomicPolluted')).toBe(false);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('uses the captured plan and metadata after input mutation and delay, never raw execute', async () => {
    const { adapter, service } = fixture();
    const raw = vi.spyOn(adapter.atomicBulkAcross, 'execute');
    const original = adapter.atomicBulkAcross.preflight;
    const planExecutions = vi.fn();
    vi.spyOn(adapter.atomicBulkAcross, 'preflight').mockImplementation(async (prepared) => {
      const plan = await original(prepared);
      if (!plan) throw new Error('expected plan');
      prepared[0]!.inserts![0]!.name = 'mutated prepared';
      prepared[0]!.inserts![0]!.createdById = 'mutated metadata';
      return { execute: () => { planExecutions(); return plan.execute(); } };
    });
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    service.security = { checkRateLimit: async () => { entered(); await gate; }, audit: vi.fn() } as never;
    const input = [{ collection: 'catalog_items', inserts: [{ id: 'p', name: 'original', createdById: 'original metadata' }], schemas: {} }];
    const operation = bulkAcrossImpl(service, input, { execution: 'atomic', showSuccessToast: false });
    await ready;
    input[0]!.inserts[0]!.name = 'mutated input';
    release();
    await operation;
    // CRUD rule 9: `createdById` is backend-generated, never the caller's: the plan's actor.
    expect(native.writes[0]?.data).toMatchObject({ name: 'original', createdById: 'actor', updatedById: 'actor' });
    expect(planExecutions).toHaveBeenCalledTimes(1);
    expect(raw).not.toHaveBeenCalled();
  });

  it('validates acknowledgements against private identities after preflight mutates its input', async () => {
    const { adapter, service } = fixture({ secure: true });
    const original = adapter.atomicBulkAcross.preflight;
    vi.spyOn(adapter.atomicBulkAcross, 'preflight').mockImplementation(async (prepared) => {
      const plan = await original(prepared);
      prepared[0]!.collection = 'changed';
      prepared[0]!.inserts![0]!.id = 'changed';
      prepared[0]!.updates![0]!.id = 'changed';
      prepared[0]!.deletes!.splice(0, 1, 'changed');
      return plan;
    });
    const stored = { id: 'update', name: 'stored', status: 'available' };
    const result = await bulkAcrossImpl(service, [{ collection: 'catalog_items', inserts: [{ id: 'new' }], updates: [{ id: 'update', patch: { name: 'x' }, stored }], deletes: ['delete'], schemas: {} }], { execution: 'atomic', showSuccessToast: false });
    expect(result.results.catalog_items).toMatchObject({ insertedIds: ['new'], updatedIds: ['update'], deletedIds: ['delete'] });
    expect(native.writes.map((write) => write.path)).toEqual(['catalog_items/new', 'catalog_items/update', 'catalog_items/delete']);
    expect(native.commit).toHaveBeenCalledTimes(1);
  });

  it.each(['visibility', 'pii'])('snapshots %s before adapter initialization yields', async (mode) => {
    const { adapter, service } = fixture();
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    service.adapter = null;
    service.initialize = async () => { entered(); await gate; service.adapter = adapter; };
    // The rules read the entity's schemas: a caller's schema mutated after the call changes nothing.
    const collection = mode === 'visibility' ? restrictedSecretEntity.collection : piiSecretEntity.collection;
    const field = Object.assign(v.string(), { visibility: mode === 'visibility' ? 'user' : 'guest' });
    const schema = Object.assign(v.object({ secret: field }), { metadata: { security: { piiFields: ['secret'] }, customValidate: async () => {} } });
    const encryptPii = vi.fn((row: Record<string, unknown>) => ({ ...row, secret: 'encrypted' }));
    service.security = { encryptPii, checkRateLimit: vi.fn(), audit: vi.fn() } as never;
    const operation = bulkAcrossImpl(service, [{ collection, inserts: [{ id: 'p', secret: 'plaintext' }], schemas: { create: schema as never } }], { execution: 'atomic', showSuccessToast: false });
    await ready;
    field.visibility = 'guest';
    schema.metadata.security.piiFields.length = 0;
    release();
    if (mode === 'visibility') {
      await expect(operation).rejects.toThrow('restricted field visibility');
      expect(native.commit).not.toHaveBeenCalled();
    } else {
      await operation;
      expect(encryptPii).toHaveBeenCalledWith(expect.objectContaining({ secret: 'plaintext' }), ['secret']);
      expect(native.writes[0]?.data).toMatchObject({ secret: 'encrypted' });
    }
  });

  it.each(['preflight', 'rate limit'])('snapshots all caller operations before %s can yield', async (phase) => {
    const { adapter, service } = fixture({ secure: true });
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pause = async () => { entered(); await gate; };
    const original = adapter.atomicBulkAcross.preflight;
    if (phase === 'preflight') vi.spyOn(adapter.atomicBulkAcross, 'preflight').mockImplementation(async (prepared) => { await pause(); return original(prepared); });
    service.security = { checkRateLimit: phase === 'rate limit' ? pause : vi.fn(), audit: vi.fn() } as never;
    const date = new Date('2020-01-01T00:00:00Z');
    const stored = { id: 'update', name: 'stored', status: 'available' };
    const input = [{ collection: 'catalog_items', inserts: [{ id: 'new', details: { name: 'original' }, releasedAt: date }], updates: [{ id: 'update', patch: { name: 'original' }, stored }], deletes: ['delete'], schemas: {}, dependsOn: [] as string[] }];
    const operation = bulkAcrossImpl(service, input, { execution: 'atomic', showSuccessToast: false });
    await ready;
    input[0]!.collection = 'changed';
    input[0]!.inserts[0]!.details.name = 'changed';
    date.setUTCFullYear(2030);
    input[0]!.updates[0]!.id = 'other';
    input[0]!.updates[0]!.patch.name = 'changed';
    input[0]!.deletes.splice(0, 1, 'other-delete');
    input[0]!.dependsOn.push('missing');
    release();
    const result = await operation;
    expect(result.results.catalog_items).toMatchObject({ insertedIds: ['new'], updatedIds: ['update'], deletedIds: ['delete'] });
    expect(native.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'catalog_items/new', data: expect.objectContaining({ details: { name: 'original' } }) }),
      expect.objectContaining({ path: 'catalog_items/update', data: expect.objectContaining({ name: 'original' }) }),
      { path: 'catalog_items/delete', data: null },
    ]));
    expect(native.commit).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('rejects invalid empty collection paths (mixed: %s)', async (mixed) => {
    const { service } = fixture();
    const input = [{ collection: 'bad/path', schemas: {} }, ...(mixed ? [{ collection: 'catalog_items', inserts: [{ id: 'p' }], schemas: {} }] : [])];
    await expect(bulkAcrossImpl(service, input, { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(native.commit).not.toHaveBeenCalled();
  });

  it('validates a supported empty collection alongside writes without returning an empty result', async () => {
    const { service } = fixture();
    const output = await bulkAcrossImpl(service, [
      { collection: 'empty', schemas: {} },
      { collection: 'catalog_items', inserts: [{ id: 'p' }], schemas: {} },
    ], { execution: 'atomic', showSuccessToast: false });
    expect(Object.keys(output.results)).toEqual(['catalog_items']);
    expect(native.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects class instances instead of flattening unsupported values', async () => {
    const { service } = fixture();
    class Unsupported { value = 'x'; }
    await expect(bulkAcrossImpl(service, [{ collection: 'catalog_items', inserts: [{ id: 'p', details: new Unsupported() }], schemas: {} }], { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(native.commit).not.toHaveBeenCalled();
  });

  it('keeps concurrent plans independent for the same input and prepared-array identities', async () => {
    const { adapter, service } = fixture();
    const original = adapter.atomicBulkAcross.preflight;
    const shared: Parameters<typeof original>[0] = [];
    let call = 0;
    vi.spyOn(adapter.atomicBulkAcross, 'preflight').mockImplementation(async (prepared) => {
      shared.splice(0, shared.length, ...prepared);
      shared[0]!.inserts![0]!.name = ++call === 1 ? 'first' : 'second';
      return original(shared);
    });
    const raw = vi.spyOn(adapter.atomicBulkAcross, 'execute');
    const input = [{ collection: 'catalog_items', inserts: [{ id: 'p', name: 'input' }], schemas: {} }];
    await Promise.all([bulkAcrossImpl(service, input, { execution: 'atomic', showSuccessToast: false }), bulkAcrossImpl(service, input, { execution: 'atomic', showSuccessToast: false })]);
    expect(native.writes.map((write) => (write.data as { name: string }).name).sort()).toEqual(['first', 'second']);
    expect(native.commit).toHaveBeenCalledTimes(2);
    expect(raw).not.toHaveBeenCalled();
  });

  it('fails closed if auth changes after preflight', async () => {
    const { adapter, service } = fixture();
    const original = adapter.atomicBulkAcross.preflight;
    vi.spyOn(adapter.atomicBulkAcross, 'preflight').mockImplementation(async (prepared) => {
      const plan = await original(prepared);
      native.actor = 'other';
      return plan;
    });
    const raw = vi.spyOn(adapter.atomicBulkAcross, 'execute');
    await expect(bulkAcrossImpl(service, [{ collection: 'catalog_items', inserts: [{ id: 'p' }], schemas: {} }], { execution: 'atomic' })).rejects.toMatchObject({ outcome: 'not-committed' });
    expect(raw).not.toHaveBeenCalled();
    expect(native.commit).not.toHaveBeenCalled();
  });
  it('stages a linked item and price through the real adapter and converter', async () => {
    native.writes.length = 0;
    native.commit.mockResolvedValue(undefined);
    const queryClient = new QueryClient();
    const service = { adapter: new FirestoreAdapter(), store: null, security: null,
      getQueryClient: () => queryClient, invalidateCollection: async () => {} } as unknown as CrudServiceInternal;
    const result = await bulkAcrossImpl(service, [
      { collection: 'catalog_items', inserts: [{ id: 'p', name: 'product' }], schemas: {} },
      { collection: 'catalog_prices', inserts: [{ id: 'o', itemId: 'p', price: 1 }], schemas: {}, dependsOn: ['catalog_items'] },
    ], { execution: 'atomic', showSuccessToast: false });
    expect(native.commit).toHaveBeenCalledTimes(1);
    expect(native.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'catalog_items/p', data: expect.objectContaining({ name: 'product' }) }),
      expect.objectContaining({ path: 'catalog_prices/o', data: expect.objectContaining({ itemId: 'p' }) }),
    ]));
    expect(result.results[catalogPriceEntity.collection]?.insertedIds).toEqual(['o']);
  });
});
