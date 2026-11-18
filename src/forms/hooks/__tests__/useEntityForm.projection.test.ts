// packages/features/crud/src/forms/hooks/__tests__/useEntityForm.projection.test.ts

/**
 * @fileoverview Regression: form state is the projection onto the written fields (design 3.4 / 3.6).
 *
 * Root causes (2026-11-17):
 * - the whole stored record was spread into form state, so generated, technical,
 *   `editable: false` and role-denied values entered state, the local draft and the payload;
 * - the default writer dropped `editable: 'computed'` fields and `<name>I18n` companions;
 * - a concurrency token read from form state survived a restored draft only by accident:
 *   the stored row the edit started from (`form.record`) is now saved with the draft.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { editableModesEntity as entity, requiredTitleEntity as strict } from '@dndev/test-entities';

import { useFormStore } from '../../../stores';
import { useEntityForm } from '../useEntityForm';

const { service } = vi.hoisted(() => ({
  service: {
    bulkAcross: vi.fn(async () => ({ results: {} })),
    invalidateCollection: vi.fn(async () => {}),
  },
}));
vi.mock('@donotdev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/components')>()),
  toast: vi.fn(),
}));
vi.mock('../../../useCrud', () => ({
  getCrudServiceInstance: () => service,
}));

const record = {
  id: 'r1', title: 'T', titleI18n: { fr: 'T fr' }, revision: 7, code: 'C-1', total: 3,
  adminNote: 'n', status: 'available', createdAt: '2026-11-17T00:00:00Z',
};
const formId = 'projection';
const draftKey = 'projectionform-form-draft-projection-r1';

function mount(defaultValues: Record<string, unknown> = record) {
  return renderHook(() => useEntityForm(entity, {
    viewerRole: 'user', operation: 'edit', formId, defaultValues, successPath: null,
  }));
}

beforeEach(() => {
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  service.bulkAcross.mockClear();
});
afterEach(() => {
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
});

describe('useEntityForm projection', () => {
  it('keeps generated, technical, editable: false and role-denied values out of form state', () => {
    const { result } = mount();
    expect(result.current.getValues()).toEqual({
      id: 'r1', title: 'T', titleI18n: { fr: 'T fr' }, total: 3,
    });
  });

  it('exposes the stored row as form.record', () => {
    const { result } = mount();
    expect(result.current.record).toEqual(record);
  });

  it('shows computed fields read-only and written', () => {
    const { result } = mount();
    expect(result.current.fields.find((field) => field.name === 'total')).toMatchObject({
      editable: false,
      written: true,
    });
    expect(result.current.fields.find((field) => field.name === 'code')).toMatchObject({
      editable: false,
      written: false,
    });
  });

  it('default writer writes computed fields and i18n companions, never the others', async () => {
    const { result } = mount();
    act(() => { result.current.setValue('total' as never, 4 as never); });
    await act(async () => { await result.current.handleSubmit()(); });
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<{ updates: Array<{ patch: Record<string, unknown> }> }>];
    expect(batches[0]!.updates[0]!.patch).toEqual({ title: 'T', titleI18n: { fr: 'T fr' }, total: 4 });
  });

  // Regression: the resolver validated with the stored status (defaultValues.status)
  // while bulkAcross picked the schema from its caches only: a stored draft not in
  // the caches was validated with the update schema on write.
  // The writer passes the stored row (`stored`; `storedStatus` is no longer read).
  it('default writer passes the stored status the resolver validated with', async () => {
    const { result } = mount({ ...record, status: 'draft' });
    await act(async () => { await result.current.handleSubmit()(); });
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<{ updates: Array<{ stored?: Record<string, unknown> | null }> }>];
    expect(batches[0]!.updates[0]!.stored?.status).toBe('draft');
  });

  it('passes onValid the written fields only', async () => {
    const { result } = mount();
    const onValid = vi.fn();
    await act(async () => { await result.current.handleSubmit(onValid)(); });
    const values = onValid.mock.calls[0]?.[0] as Record<string, unknown>;
    for (const name of ['revision', 'code', 'adminNote', 'status', 'createdAt']) {
      expect(values).not.toHaveProperty(name);
    }
    expect(values).toMatchObject({ title: 'T', total: 3 });
  });

  it('saves the record with the draft and restores it with the draft', async () => {
    vi.useFakeTimers();
    try {
      const first = mount();
      act(() => { first.result.current.setValue('title' as never, 'Edited' as never, { shouldDirty: true }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      const saved = useFormStore.getState().loadDraft(draftKey);
      expect(saved?.data).not.toHaveProperty('revision');
      expect(saved?.data).not.toHaveProperty('code');
      expect(saved?.extras).toMatchObject({ '@record': { revision: 7 } });
      first.unmount();
      // The stored row moved on (revision 8); the restored draft keeps its base version.
      const second = mount({ ...record, revision: 8 });
      expect(second.result.current.getValues('title' as never)).toBe('Edited');
      expect(second.result.current.record).toMatchObject({ revision: 7 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops values a stored draft holds for fields the form does not write', () => {
    useFormStore.getState().saveDraft(draftKey, { title: 'Draft', code: 'tampered', revision: 99 }, entity.name, 'r1');
    const { result } = mount();
    expect(result.current.getValues()).not.toHaveProperty('code');
    expect(result.current.getValues()).not.toHaveProperty('revision');
    expect(result.current.getValues('title' as never)).toBe('Draft');
  });

  // One status rule: a status the viewer may not edit is not in form state; the
  // stored status decides the schema (a stored draft keeps the draft rules).
  it('validates an edit of a stored draft with the draft rules when status is not in form state', async () => {
    // Emptying the required title: allowed on a draft, rejected on an update (CRUD rules 2, 5).
    const submit = async (status: string) => {
      const { result } = renderHook(() => useEntityForm(strict, {
        viewerRole: 'user', operation: 'edit', defaultValues: { id: 's1', title: 'T', status }, successPath: null,
      }));
      expect(result.current.getValues()).not.toHaveProperty('status');
      act(() => { result.current.setValue('title' as never, null as never); });
      const onValid = vi.fn();
      await act(async () => { await result.current.handleSubmit(onValid)(); });
      return onValid.mock.calls.length;
    };
    expect(await submit('draft')).toBe(1);
    expect(await submit('available')).toBe(0);
  });

  // A caller's create status (`defaultValues.status: 'draft'`) is the caller's choice:
  // the default writer inserts it even when the viewer may not edit status.
  it('default writer inserts the caller create status the viewer may not edit', async () => {
    const { result } = renderHook(() => useEntityForm(entity, {
      viewerRole: 'user', operation: 'create', defaultValues: { title: 'New', status: 'draft' }, successPath: null,
    }));
    expect(result.current.getValues()).not.toHaveProperty('status');
    await act(async () => { await result.current.handleSubmit()(); });
    const [batches] = service.bulkAcross.mock.calls[0] as unknown as [Array<{ inserts: Array<Record<string, unknown>> }>];
    expect(batches[0]!.inserts[0]).toMatchObject({ title: 'New', status: 'draft' });
  });
});

