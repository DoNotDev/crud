// packages/features/crud/src/hooks/__tests__/useChildRows.test.tsx

import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { orderEntity, orderLineEntity as lineEntity } from '@dndev/test-entities';

import { FormNavigationProvider, type FormNavigation } from '../../forms/FormNavigation';
import { useEntityForm } from '../../forms/hooks/useEntityForm';
import { useFormStore } from '../../stores';
import { useChildRows, useJoinedForm } from '../useChildRows';

// Child rows of a record: joined to the edit form open on it, saved by its Save.

const { list, service, bulkSpy } = vi.hoisted(() => ({
  list: {
    items: [] as Array<Record<string, unknown> & { id: string }>,
    refresh: async () => {},
  },
  service: {
    bulkAcross: vi.fn(async () => ({ results: {} })),
    invalidateCollection: vi.fn(async () => {}),
  },
  bulkSpy: vi.fn(async () => ({
    insertedIds: [] as string[],
    updatedIds: [] as string[],
    deletedIds: [] as string[],
    failed: [] as Array<{ op: string; id?: string; index?: number; error: string }>,
  })),
}));

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/components')>()),
  toast: vi.fn(),
}));
vi.mock('../../useCrudList', () => ({
  useCrudList: () => ({
    items: list.items,
    data: { items: list.items },
    loading: false,
    error: null,
    refresh: list.refresh,
  }),
}));
vi.mock('../../useCrud', () => ({
  getCrudServiceInstance: () => service,
  useCrud: () => ({ bulk: bulkSpy }),
}));

const SAVED = [
  { id: 'l1', orderId: 'o1', productId: 'p1', quantity: 1, status: 'available' },
  { id: 'l2', orderId: 'o1', productId: 'p2', quantity: 2, status: 'available' },
];
const parent = { field: 'orderId', value: 'o1' };

function router(path = '/orders/o1') {
  let current = path;
  const navigate = vi.fn((to: string) => { current = to; });
  const value: FormNavigation = { navigate, currentPath: () => current, parentPath: () => '/orders' };
  return { value, navigate };
}

function usePage(formId = 'order') {
  const form = useEntityForm(orderEntity, {
    formId,
    operation: 'edit',
    defaultValues: { id: 'o1', title: 'Order' },
    viewerRole: 'admin',
    successPath: null,
  });
  const rows = useChildRows(lineEntity, parent);
  const button = useChildRows(lineEntity, parent);
  return { form, rows, button };
}

function mountPage(navigation?: FormNavigation) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    navigation ? createElement(FormNavigationProvider, { value: navigation }, children) : children;
  return renderHook(() => usePage(), { wrapper });
}

const resetStore = () =>
  useFormStore.setState({ drafts: {}, forms: {}, openRecords: [], childEdits: {} });

beforeEach(() => {
  list.items = SAVED;
  resetStore();
  localStorage.clear();
  service.bulkAcross.mockClear();
  service.invalidateCollection.mockClear();
  bulkSpy.mockClear();
});
afterEach(() => {
  cleanup();
  resetStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useChildRows join', () => {
  it('stays standalone without a form open on the parent: edits in memory only', () => {
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    expect(result.current.joined).toBe(false);
    act(() => { result.current.update('l1', { quantity: 5 }); });
    expect(result.current.items[0]).toMatchObject({ quantity: 5 });
    expect(useFormStore.getState().childEdits).toEqual({});
    expect(useFormStore.getState().drafts).toEqual({});
  });

  it('joins only a form on the parent record; the latest opened wins', () => {
    const joined = renderHook(() => useJoinedForm(lineEntity, parent));
    expect(joined.result.current).toBeNull();
    const first = renderHook(() => usePage('first'));
    const firstKey = joined.result.current?.formKey;
    expect(firstKey).toBeDefined();
    const second = renderHook(() => usePage('second'));
    expect(joined.result.current?.formKey).not.toBe(firstKey);
    second.unmount();
    expect(joined.result.current?.formKey).toBe(firstKey);
    first.unmount();
    expect(joined.result.current).toBeNull();
    // Another record's form is not a target.
    expect(renderHook(() => useJoinedForm(lineEntity, { field: 'orderId', value: 'o2' })).result.current).toBeNull();
  });

  it('shares the rows between instances and follows the form viewer rules', async () => {
    const { result } = mountPage();
    expect(result.current.rows.joined).toBe(true);
    expect(result.current.rows.access).toEqual({ create: true, update: true, delete: true });
    act(() => { result.current.button.add([{ productId: 'p3', quantity: 3 }]); });
    expect(result.current.rows.items).toHaveLength(3);
    expect(result.current.rows.edits.added[0]).toMatchObject({ orderId: 'o1', productId: 'p3', status: 'available' });
    // Hard delete (`delete`; `remove` is the logical delete, CRUD rule 3): the row leaves every instance.
    act(() => { result.current.rows.delete(['l2']); });
    expect(result.current.button.items.map((row) => row.id)).not.toContain('l2');
    expect(() => result.current.rows.update('l1', { id: 'x' })).toThrow(/not writable/);
    await expect(result.current.rows.save()).rejects.toThrow(/joined/);
  });
});

describe('useChildRows in the form draft', () => {
  it('keeps joined edits in the draft: restored on return, cleared by Discard', () => {
    const first = mountPage();
    act(() => { first.result.current.rows.update('l1', { quantity: 5 }); });
    first.unmount(); // leaving flushes the pending autosave
    expect(useFormStore.getState().childEdits).toEqual({});

    const { result } = mountPage();
    expect(result.current.rows.items[0]).toMatchObject({ id: 'l1', quantity: 5 });
    act(() => { result.current.form.resetForm(); });
    expect(result.current.rows.hasEdits).toBe(false);
  });

  it('drops restored edits of rows that no longer exist', () => {
    const first = mountPage();
    act(() => { first.result.current.rows.update('l2', { quantity: 9 }); });
    first.unmount();
    list.items = [SAVED[0]!];
    const { result } = mountPage();
    expect(result.current.rows.hasEdits).toBe(false);
  });
});

describe('useEntityForm save with joined rows', () => {
  it('blocks the Save on an invalid row before leaving', async () => {
    const { value, navigate } = router();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(FormNavigationProvider, { value }, children);
    const { result } = renderHook(() => {
      const form = useEntityForm(orderEntity, {
        formId: 'order', operation: 'edit', defaultValues: { id: 'o1', title: 'Order' }, viewerRole: 'admin',
      });
      return { form, rows: useChildRows(lineEntity, parent) };
    }, { wrapper });
    act(() => { result.current.rows.add([{ quantity: 2 }]); });
    const onValid = vi.fn();
    await act(async () => { await result.current.form.handleSubmit(onValid)(); });
    expect(onValid).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(useFormStore.getState().forms['order']?.error).toBeTruthy();
    expect(result.current.rows.hasEdits).toBe(true);
  });

  it('default writer: the record and its rows in one bulkAcross, then clears and refetches', async () => {
    const { result } = mountPage();
    act(() => {
      result.current.rows.update('l1', { quantity: 5 });
      result.current.rows.delete(['l2']);
    });
    act(() => { result.current.rows.add([{ productId: 'p3', quantity: 3 }]); });
    await act(async () => { await result.current.form.handleSubmit()(); });
    expect(service.bulkAcross).toHaveBeenCalledOnce();
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(batches[0]).toMatchObject({ collection: 'orders', updates: [{ id: 'o1', patch: { title: 'Order' } }] });
    // stored: the record the resolver validated with (the form's defaultValues)
    expect(batches[0]!.updates).toEqual([{ id: 'o1', patch: expect.not.objectContaining({ id: expect.anything() }), stored: { id: 'o1', title: 'Order' } }]);
    expect(batches[1]).toMatchObject({
      collection: 'order_lines',
      inserts: [{ orderId: 'o1', productId: 'p3', quantity: 3 }],
      updates: [{ id: 'l1', patch: { quantity: 5 } }],
      deletes: ['l2'],
    });
    // Stay-on-page success: edits cleared, rows refetched, draft cleared.
    expect(result.current.rows.hasEdits).toBe(false);
    expect(service.invalidateCollection).toHaveBeenCalledWith('order_lines');
    expect(useFormStore.getState().drafts).toEqual({});
  });

  it('fails explicitly when onValid does not read pendingWrites(); edits stay', async () => {
    const { result } = mountPage();
    act(() => { result.current.rows.update('l1', { quantity: 5 }); });
    await act(async () => {
      await expect(result.current.form.handleSubmit(async () => {})()).rejects.toThrow();
    });
    expect(result.current.rows.items[0]).toMatchObject({ quantity: 5 });
    expect(useFormStore.getState().forms['order']?.status).toBe('error');
  });

  it('app writer gets the rows writes from pendingWrites()', async () => {
    const { result } = mountPage();
    act(() => { result.current.rows.update('l1', { quantity: 5 }); });
    let writes: unknown;
    await act(async () => {
      await result.current.form.handleSubmit(async () => { writes = result.current.form.pendingWrites(); })();
    });
    expect(writes).toEqual([expect.objectContaining({ collection: 'order_lines', updates: [{ id: 'l1', patch: { quantity: 5 } }] })]);
    expect(result.current.rows.hasEdits).toBe(false);
  });

  it('returns with the edits after an optimistic leave whose write fails', async () => {
    const { value, navigate } = router();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(FormNavigationProvider, { value }, children);
    const useLeavingPage = () => {
      const form = useEntityForm(orderEntity, {
        formId: 'order', operation: 'edit', defaultValues: { id: 'o1', title: 'Order' }, viewerRole: 'admin',
      });
      return { form, rows: useChildRows(lineEntity, parent) };
    };
    const first = renderHook(useLeavingPage, { wrapper });
    act(() => { first.result.current.rows.update('l1', { quantity: 5 }); });
    await act(async () => {
      await expect(first.result.current.form.handleSubmit(async () => {
        first.result.current.form.pendingWrites();
        first.unmount(); // the page left before the server answered
        throw new Error('rejected');
      })()).rejects.toThrow('rejected');
    });
    expect(navigate.mock.calls).toEqual([['/orders'], ['/orders/o1']]);
    const back = renderHook(useLeavingPage, { wrapper });
    expect(back.result.current.rows.items[0]).toMatchObject({ id: 'l1', quantity: 5 });
  });

  it('keeps the edits when the write fails', async () => {
    service.bulkAcross.mockRejectedValueOnce(new Error('denied'));
    const { result } = mountPage();
    act(() => { result.current.rows.update('l1', { quantity: 5 }); });
    await act(async () => {
      await expect(result.current.form.handleSubmit()()).rejects.toThrow('denied');
    });
    expect(result.current.rows.items[0]).toMatchObject({ quantity: 5 });
  });

  it('leaves the form untouched when no rows joined (handleSubmit(onValid) unchanged)', async () => {
    const { result } = mountPage();
    const onValid = vi.fn(async () => 'done');
    let returned: unknown;
    await act(async () => { returned = await result.current.form.handleSubmit(onValid)(); });
    expect(returned).toBe('done');
    expect(result.current.form.pendingWrites()).toEqual([]);
  });
});

describe('useChildRows standalone save', () => {
  it('writes its own edits in one bulk; rows that fail stay unsaved', async () => {
    bulkSpy.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: ['l1'],
      deletedIds: [],
      failed: [{ op: 'insert', index: 0, error: 'denied' }],
    });
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    act(() => { result.current.update('l1', { quantity: 5 }); });
    act(() => { result.current.add([{ productId: 'p3', quantity: 3 }]); });
    await act(async () => { await result.current.save(); });
    expect(bulkSpy).toHaveBeenCalledWith({
      inserts: [expect.objectContaining({ orderId: 'o1', productId: 'p3', quantity: 3 })],
      updates: [{ id: 'l1', patch: { quantity: 5 } }],
      deletes: [],
    });
    expect(result.current.edits.added).toHaveLength(1);
    expect(result.current.edits.changes['l1']).toBeUndefined();
  });
});

describe('useChildRows reactive validation', () => {
  it('marks invalid fields on every change and clears them once fixed', () => {
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    let id = '';
    act(() => { [id] = result.current.add([{ quantity: 2 }]); });
    expect(Object.keys(result.current.errors[id] ?? {})).toEqual(['productId']);
    expect(result.current.errors[id]!['productId']).toContain('childRows.required');
    act(() => { result.current.update('l1', { quantity: 'many' }); });
    expect(Object.keys(result.current.errors['l1'] ?? {})).toEqual(['quantity']);
    act(() => {
      result.current.update(id, { productId: 'p3' });
      result.current.update('l1', { quantity: 3 });
    });
    expect(result.current.errors).toEqual({});
  });

  it('blocks the form Save with one message (row count), no toast', async () => {
    const { toast } = await import('@donotdev/components');
    vi.mocked(toast).mockClear();
    const { result } = mountPage();
    act(() => { result.current.rows.add([{ quantity: 2 }]); });
    const onValid = vi.fn();
    await act(async () => { await result.current.form.handleSubmit(onValid)(); });
    expect(onValid).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(useFormStore.getState().forms['order']?.error).toContain('childRows.invalidRows');
  });

  it('standalone save() rejects without writing while rows are invalid', async () => {
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    act(() => { result.current.add([{ quantity: 2 }]); });
    await act(async () => {
      await expect(result.current.save()).rejects.toThrow(/childRows.invalidRows/);
    });
    expect(bulkSpy).not.toHaveBeenCalled();
  });
});

describe('useChildRows standalone save reconciliation', () => {
  it('clears exactly what it sent at once; edits made during the save stay pending', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof bulkSpy>>) => void;
    bulkSpy.mockImplementationOnce(() => new Promise((yes) => { resolve = yes; }));
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    act(() => { result.current.update('l1', { quantity: 5 }); });
    let saving!: Promise<unknown>;
    act(() => { saving = result.current.save(); });
    act(() => { result.current.update('l2', { quantity: 7 }); });
    await act(async () => {
      resolve({ insertedIds: [], updatedIds: ['l1'], deletedIds: [], failed: [] });
      await saving;
    });
    // No refetch happened (the list is unchanged): l1 left anyway, l2 stays.
    expect(result.current.edits.changes).toEqual({ l2: { quantity: 7 } });
  });

  it('keeps everything when the write fails', async () => {
    bulkSpy.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useChildRows(lineEntity, parent, { viewerRole: 'admin' }));
    act(() => { result.current.update('l1', { quantity: 5 }); });
    await act(async () => { await expect(result.current.save()).rejects.toThrow('offline'); });
    expect(result.current.edits.changes).toEqual({ l1: { quantity: 5 } });
  });
});
