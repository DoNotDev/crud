// packages/features/crud/src/forms/hooks/__tests__/useFormDraftState.test.ts

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@donotdev/components';

import { useFormStore } from '../../../stores';
import { useEntityForm } from '../useEntityForm';
import { useFormDraftState } from '../useFormDraftState';
import { pageDraftEntity as entity } from '@dndev/test-entities';

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/components')>(),
  toast: vi.fn(),
}));

const formId = 'page-draft';
const draftKey = 'pagedraft-form-draft-page-draft-rec-1';
const record = { id: 'rec-1', title: 'Saved' };

const isIds = (draft: unknown): string[] => {
  if (!Array.isArray(draft) || draft.some((id) => typeof id !== 'string')) throw new Error('not ids');
  return draft;
};
function mount(initialIds: string[] = ['a', 'b'], adjust: (ids: string[]) => string[] = (ids) => ids) {
  return renderHook(() => {
    const form = useEntityForm(entity, { viewerRole: 'user', formId, operation: 'edit', defaultValues: record, successPath: null });
    const [ids, setIds] = useFormDraftState(form, 'productIds', initialIds, { parse: (draft) => adjust(isIds(draft)) });
    return { form, ids, setIds };
  });
}
function draft() { return useFormStore.getState().loadDraft(draftKey); }
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.useRealTimers();
});

describe('useFormDraftState', () => {
  it('autosaves page state with the form draft', () => {
    vi.useFakeTimers();
    const { result } = mount();
    act(() => result.current.setIds(['b', 'a']));
    expect(draft()).toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(draft()?.extras).toEqual({ productIds: ['b', 'a'], '@record': record });
  });

  it('saves at submit and keeps it after unmount when the write rejects', async () => {
    const { result, unmount } = mount();
    act(() => result.current.setIds(['c']));
    const request = deferred();
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.form.handleSubmit(() => request.promise)().then(() => undefined, (error: unknown) => error);
    });
    expect(draft()?.extras).toEqual({ productIds: ['c'], '@record': record });
    unmount();
    await act(async () => { request.reject(new Error('rejected')); await pending; });
    expect(draft()?.extras).toEqual({ productIds: ['c'], '@record': record });
  });

  it('clears with the form draft when the write succeeds', async () => {
    const { result } = mount();
    act(() => result.current.setIds(['c']));
    await act(async () => { await result.current.form.handleSubmit(vi.fn())(); });
    expect(draft()).toBeNull();
  });

  it('keeps page state changed while the write is pending', async () => {
    const { result } = mount();
    act(() => result.current.setIds(['c']));
    const request = deferred();
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.form.handleSubmit(() => request.promise)(); });
    act(() => result.current.setIds(['c', 'd']));
    await act(async () => { request.resolve(); await pending; });
    // Later edits are based on the row just written: no base row (reopening takes the stored one).
    expect(draft()?.extras).toEqual({ productIds: ['c', 'd'] });
  });

  it('clears the draft when the page left on save and its slot unregistered', async () => {
    const { result } = mount();
    act(() => result.current.setIds(['c']));
    const unregister = result.current.form.draftState.register('pickedLater', {
      get: () => ['z'], restore: () => {}, reset: () => {}, edited: () => true,
    });
    const request = deferred();
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.form.handleSubmit(() => request.promise)(); });
    expect(draft()?.extras).toMatchObject({ pickedLater: ['z'] });
    // The page unmounts (optimistic leave): its slot unregisters before the write settles.
    unregister();
    await act(async () => { request.resolve(); await pending; });
    expect(draft()).toBeNull();
  });

  it('keeps initial when the stored value does not parse', () => {
    useFormStore.getState().saveDraft(draftKey, record, entity.name, 'rec-1', { productIds: 'corrupted' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = mount();
    expect(result.current.ids).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalled();
  });

  it('restores from the draft, through parse, and Discard resets it', () => {
    useFormStore.getState().saveDraft(draftKey, { ...record, title: 'Edited' }, entity.name, 'rec-1', { productIds: ['x', 'a'] });
    const { result } = mount(['a', 'b'], (ids) => ids.filter((id) => id !== 'a'));
    expect(result.current.form.getValues('title')).toBe('Edited');
    expect(result.current.ids).toEqual(['x']);
    const call = vi.mocked(toast).mock.calls.at(-1)?.[0];
    const action = typeof call === 'object' && call !== null && 'action' in call ? call.action : null;
    const discard = (action as { props: { onClick: () => void } } | null)?.props.onClick;
    expect(discard).toBeTypeOf('function');
    act(() => discard?.());
    expect(result.current.ids).toEqual(['a', 'b']);
    expect(draft()).toBeNull();
  });
});
