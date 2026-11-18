// packages/features/crud/src/hooks/__tests__/useChildRows.extend.test.tsx

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productCostEntity as secretEntity, productEntity, productOfferEntity as offerEntity } from '@dndev/test-entities';

import { useEntityForm } from '../../forms/hooks/useEntityForm';
import { useFormStore } from '../../stores';
import { useChildRows } from '../useChildRows';

// 1:1 extensions (`extend`): a record split across two tables read, edited and
// saved as one, in useChildRows and useEntityForm.

const { list, service } = vi.hoisted(() => ({
  list: { items: [] as Array<Record<string, unknown> & { id: string }> },
  service: {
    offers: [] as Array<Record<string, unknown> & { id: string }>,
    query: vi.fn(),
    bulkAcross: vi.fn(async () => ({ results: {} })),
    invalidateCollection: vi.fn(async () => {}),
  },
}));

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/components')>()),
  toast: vi.fn(),
}));
vi.mock('../../useCrudList', () => ({
  useCrudList: (_collection: string, options: { queryOptions?: unknown }) => {
    listOptions.push(options.queryOptions);
    return {
      items: list.items,
      data: { items: list.items },
      loading: false,
      error: null,
      refresh: async () => {},
    };
  },
}));
vi.mock('../../useCrud', () => ({
  EMPTY_OPTIMISTIC: {},
  getCrudServiceInstance: () => service,
  useCrud: () => ({ bulk: vi.fn() }),
}));

const listOptions: unknown[] = [];

const extend = {
  offer: { entity: offerEntity, field: 'productId' },
  secret: { entity: secretEntity, field: 'productId' },
};

const PRODUCTS = [
  { id: 'p1', name: 'Toner', status: 'available' },
  { id: 'p2', name: 'Cream', status: 'available' },
];

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  list.items = PRODUCTS;
  listOptions.length = 0;
  service.offers = [{ id: 'o1', productId: 'p1', price: 10, status: 'available' }];
  service.query.mockReset();
  service.query.mockImplementation(async (_collection: string, options: { where: Array<{ value: string[] }> }) => ({
    items: service.offers.filter((offer) => options.where[0]!.value.includes(String(offer.productId))),
  }));
  service.bulkAcross.mockClear();
  useFormStore.setState({ drafts: {}, forms: {}, openRecords: [], childEdits: {}, childWriters: {}, childDrafts: {} });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  client.clear();
  localStorage.clear();
});

describe('useChildRows extend', () => {
  it('lists every record without a parent and merges extensions (one batched read)', async () => {
    const { result } = renderHook(() => useChildRows(productEntity, undefined, { viewerRole: 'admin', extend }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listOptions[0]).toBeUndefined(); // no parent: no where
    expect(result.current.joined).toBe(false);
    expect(service.query).toHaveBeenCalledOnce();
    expect(service.query.mock.calls[0]![1]).toMatchObject({
      where: [{ field: 'productId', operator: 'in', value: ['p1', 'p2'] }],
    });
    expect(result.current.items[0]).toMatchObject({ offer: { id: 'o1', price: 10 }, 'offer.price': 10 });
    expect(result.current.items[1]).toMatchObject({ offer: null });
    // No read access to the secret extension: no fields, no read, no error.
    expect(result.current.extensionFields.map((field) => field.name)).toEqual(['offer.price']);
    expect(result.current.items[0]).not.toHaveProperty('secret');
    expect(result.current.error).toBeNull();
  });

  it('chunks the extension read where the adapter limits `in`', async () => {
    list.items = Array.from({ length: 35 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const { result } = renderHook(() => useChildRows(productEntity, undefined, { viewerRole: 'admin', extend }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(service.query.mock.calls.map((call) => (call[1] as { where: Array<{ value: string[] }> }).where[0]!.value.length)).toEqual([30, 5]);
  });

  it('edits extension fields as key.field and writes update or insert on save', async () => {
    const { result } = renderHook(() => useChildRows(productEntity, undefined, { viewerRole: 'admin', extend }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.update('p1', { 'offer.price': 12 });
      result.current.update('p2', { 'offer.price': 4 });
    });
    expect(result.current.items[0]).toMatchObject({ offer: { price: 12 }, 'offer.price': 12 });
    expect(() => result.current.update('p1', { 'secret.cost': 1 })).toThrow(/not writable/);
    await act(async () => { await result.current.save(); });
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(batches).toEqual([
      expect.objectContaining({
        collection: 'product_offers',
        updates: [{ id: 'o1', patch: { price: 12 } }],
        inserts: [expect.objectContaining({ productId: 'p2', price: 4 })],
      }),
    ]);
    expect(result.current.hasEdits).toBe(false);
  });
});

describe('useEntityForm extend', () => {
  const mountForm = (record: { id: string; name: string } | null) =>
    renderHook(() => useEntityForm(productEntity, {
      formId: 'product',
      operation: record ? 'edit' : 'create',
      ...(record && { defaultValues: record }),
      viewerRole: 'admin',
      successPath: null,
      extend,
    }), { wrapper });

  it('adds the extension fields, prefixed, with the stored values', async () => {
    const { result } = mountForm({ id: 'p1', name: 'Toner' });
    await waitFor(() => expect(result.current.getValues()).toMatchObject({ offer: { price: 10 } }));
    const names = result.current.fields.map((field) => field.name);
    expect(names).toContain('offer.price');
    expect(names).not.toContain('offer.productId');
    expect(names.some((name) => name.startsWith('secret.'))).toBe(false);
  });

  it('default writer: record update + extension update in one bulkAcross', async () => {
    const { result } = mountForm({ id: 'p1', name: 'Toner' });
    await waitFor(() => expect(result.current.getValues()).toMatchObject({ offer: { price: 10 } }));
    act(() => { result.current.setValue('offer.price' as never, 15 as never); });
    await act(async () => { await result.current.handleSubmit()(); });
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(batches[0]).toMatchObject({ collection: 'products', updates: [{ id: 'p1', patch: { name: 'Toner' } }] });
    expect(batches[1]).toMatchObject({ collection: 'product_offers', updates: [{ id: 'o1', patch: { price: 15 } }] });
  });

  it('inserts a missing extension; on create after the record (pre-minted id)', async () => {
    const edit = mountForm({ id: 'p2', name: 'Cream' });
    await waitFor(() => expect(edit.result.current.getValues()).toHaveProperty('offer'));
    act(() => { edit.result.current.setValue('offer.price' as never, 7 as never); });
    await act(async () => { await edit.result.current.handleSubmit()(); });
    const [editBatches] = service.bulkAcross.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(editBatches[1]).toMatchObject({ collection: 'product_offers', inserts: [{ productId: 'p2', price: 7 }] });
    expect(editBatches[1]).not.toHaveProperty('dependsOn');
    edit.unmount();

    const create = mountForm(null);
    act(() => {
      create.result.current.setValue('name' as never, 'Serum' as never);
      create.result.current.setValue('offer.price' as never, 3 as never);
    });
    await act(async () => { await create.result.current.handleSubmit()(); });
    const [createBatches] = service.bulkAcross.mock.calls[1] as unknown as [Array<Record<string, Array<Record<string, unknown>>>>];
    const newId = createBatches[0]!.inserts![0]!.id;
    expect(typeof newId).toBe('string');
    expect(createBatches[1]).toMatchObject({
      collection: 'product_offers',
      inserts: [{ productId: newId, price: 3 }],
      dependsOn: ['products'],
    });
  });

  it('validates extension fields with the record (a missing extension, inserted, against its create rules)', async () => {
    const { result } = mountForm({ id: 'p2', name: 'Cream' });
    await waitFor(() => expect(result.current.getValues()).toHaveProperty('offer'));
    const onValid = vi.fn();
    await act(async () => { await result.current.handleSubmit(onValid)(); });
    expect(onValid).not.toHaveBeenCalled();
    expect(result.current.formState.errors).toHaveProperty('offer.price');
  });

  it('app writer: pendingWrites() carries the extension; unread → explicit error', async () => {
    const { result } = mountForm({ id: 'p1', name: 'Toner' });
    await waitFor(() => expect(result.current.getValues()).toMatchObject({ offer: { price: 10 } }));
    let writes: unknown;
    await act(async () => {
      await result.current.handleSubmit(async () => { writes = result.current.pendingWrites(); })();
    });
    // The update carries the stored extension row (the CRUD update rules run on it).
    expect(writes).toEqual([expect.objectContaining({
      collection: 'product_offers',
      updates: [{ id: 'o1', patch: { price: 10 }, stored: expect.objectContaining({ id: 'o1', price: 10 }) }],
    })]);
    await act(async () => {
      await expect(result.current.handleSubmit(async () => {})()).rejects.toThrow();
    });
  });
});

describe('deterministic minted ids', () => {
  const mountForm = (record: { id: string; name: string } | null) =>
    renderHook(() => useEntityForm(productEntity, {
      formId: 'product',
      operation: record ? 'edit' : 'create',
      ...(record && { defaultValues: record }),
      viewerRole: 'admin',
      successPath: null,
      extend,
    }), { wrapper });

  it('pendingWrites() returns the same extension insert id on every call', async () => {
    const { result } = mountForm({ id: 'p2', name: 'Cream' });
    await waitFor(() => expect(result.current.getValues()).toHaveProperty('offer'));
    const first = result.current.pendingWrites();
    const second = result.current.pendingWrites();
    expect(first[0]!.inserts![0]!.id).toBeDefined();
    expect(second).toEqual(first);
  });

  it('a retried create sends the same ids; success releases them', async () => {
    useFormStore.setState({ mintedIds: {} });
    service.bulkAcross.mockRejectedValueOnce(new Error('timeout'));
    const { result } = mountForm(null);
    act(() => {
      result.current.setValue('name' as never, 'Serum' as never);
      result.current.setValue('offer.price' as never, 3 as never);
    });
    await act(async () => {
      await expect(result.current.handleSubmit()()).rejects.toThrow('timeout');
    });
    await act(async () => { await result.current.handleSubmit()(); });
    const calls = service.bulkAcross.mock.calls as unknown as Array<[Array<{ inserts: Array<{ id: string }> }>]>;
    const [failed, retried] = calls.slice(-2).map(([batches]) => batches.map((batch) => batch.inserts[0]!.id));
    expect(retried).toEqual(failed);
    expect(useFormStore.getState().mintedIds).toEqual({});
  });
});
