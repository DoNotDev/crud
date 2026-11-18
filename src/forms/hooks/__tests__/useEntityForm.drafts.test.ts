import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { useController } from 'react-hook-form';
import * as v from 'valibot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@donotdev/components';

import { UploadProvider } from '../../../contexts/UploadContext';
import { useFileUpload } from '../../../hooks/useFileUpload';
import { useFormStore } from '../../../stores';
import { useUploadStore } from '../../../stores/UploadStore';
import { useEntityForm } from '../useEntityForm';
import { draftAcknowledgementEntity as entity } from '@dndev/test-entities';

const gate = vi.hoisted(() => ({ hold: undefined as (() => Promise<void>) | undefined }));
vi.mock('@donotdev/components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/components')>(),
  toast: vi.fn(),
}));
vi.mock('@hookform/resolvers/valibot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hookform/resolvers/valibot')>();
  return {
    ...actual,
    valibotResolver: (...args: Parameters<typeof actual.valibotResolver>) => {
      const resolve = actual.valibotResolver(...args);
      return async (...inputs: Parameters<typeof resolve>) => {
        const result = await resolve(...inputs);
        await gate.hold?.();
        return result;
      };
    },
  };
});

const defaults = { title: 'Caller title', address: { street: 'Caller street', city: 'Caller city' } };
const formId = 'draft-acknowledgement';
const draftKey = 'draftacknowledgement-form-draft-draft-acknowledgement';
function mount(options: { loading?: boolean; operation?: 'create' | 'edit' } = {}) {
  return renderHook(() => useEntityForm(entity, { viewerRole: 'user',
    operation: 'create', formId,
    defaultValues: options.operation === 'edit' ? { ...defaults, id: 'record-1' } : defaults,
    ...options,
  }));
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function draft() { return useFormStore.getState().loadDraft(draftKey)?.data; }

beforeEach(() => {
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  gate.hold = undefined;
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('entity form local drafts and submitted editor baselines', () => {
  it('restores create drafts over caller/schema defaults and Discard restores the base', () => {
    useFormStore.getState().saveDraft(draftKey, { address: { street: 'Draft street' } }, entity.name);
    const { result } = mount();
    expect(result.current.getValues()).toMatchObject({
      ...defaults, note: null, address: { street: 'Draft street', city: 'Caller city' },
    });
    const restored = vi.mocked(toast).mock.calls.find(([options]) => options.toastType === 'info');
    const action = restored?.[0].action as ReactElement<{ onClick: () => void }>;
    act(() => action.props.onClick());
    expect(result.current.getValues()).toMatchObject({ ...defaults, note: null });
    expect(result.current.isDirty).toBe(false);
    expect(draft()).toBeUndefined();
  });

  it('autosaves create edits with caller defaults locally without invoking a submit callback', async () => {
    vi.useFakeTimers();
    const { result } = mount();
    act(() => result.current.setValue('title', 'Local edit', { shouldDirty: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(draft()).toMatchObject({ ...defaults, title: 'Local edit' });
    expect(useFormStore.getState().forms[formId]).toBeUndefined();
  });

  it.each([false, true])('waits for loading before initializing create defaults (saved draft: %s)', (saved) => {
    if (saved) useFormStore.getState().saveDraft(draftKey, { title: 'Restored' }, entity.name);
    const { result, rerender } = renderHook(({ loading }) => useEntityForm(entity, { viewerRole: 'user',
      operation: 'create', formId, defaultValues: defaults, loading,
    }), { initialProps: { loading: true } });
    expect(result.current.getValues('title')).toBeUndefined();
    rerender({ loading: false });
    expect(result.current.getValues()).toMatchObject({ ...defaults, title: saved ? 'Restored' : defaults.title });
  });

  it.each(['create', 'edit'] as const)('acknowledges a no-new-edit %s submission and cancels stale draft timers', async (operation) => {
    vi.useFakeTimers();
    const { result } = mount({ operation });
    act(() => result.current.setValue('title', 'Submitted', { shouldDirty: true }));
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.formState.dirtyFields).toEqual({});
    expect(result.current.getValues('title')).toBe('Submitted');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(useFormStore.getState().loadDraft(operation === 'edit' ? `${draftKey}-record-1` : draftKey)).toBeNull();
  });

  it.each(['none', 'title', 'image'] as const)('acknowledges upload normalization but retains later %s edits', async (laterEdit) => {
    const stored = { fullUrl: 'https://storage.example/image.jpg', thumbUrl: 'https://storage.example/thumb.jpg' };
    const replacement = { fullUrl: 'https://storage.example/other.jpg', thumbUrl: 'https://storage.example/other-thumb.jpg' };
    const uploadFn = vi.fn(async () => stored);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { result } = renderHook(() => {
      const form = useEntityForm(entity, { viewerRole: 'user', operation: 'create', formId, defaultValues: defaults });
      const { field } = useController({ control: form.control, name: 'image' });
      const upload = useFileUpload({ name: 'image', value: field.value, onChange: field.onChange, uploadFn });
      return { form, field, upload };
    }, {
      wrapper: ({ children }: { children: ReactNode }) => createElement(UploadProvider, { formId, children }),
    });
    act(() => useUploadStore.getState().setFieldFiles(formId, 'image', [{
      id: 'pending-image', file: new File(['image'], 'image.jpg', { type: 'image/jpeg' }),
      previewURL: 'blob:pending-image', status: 'pending', progress: null, uploaded: null, error: null,
    }]));
    expect(result.current.form.getValues('image')).toMatchObject({ fullUrl: 'blob:pending-image' });
    const request = deferred();
    const submit = vi.fn((_data: Record<string, unknown>) => request.promise);
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.form.handleSubmit(submit)(); });
    expect(uploadFn).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ image: stored });
    expect(result.current.form.getValues('image')).toEqual(stored);
    vi.useFakeTimers();
    act(() => {
      if (laterEdit === 'title') result.current.form.setValue('title', 'Later title', { shouldDirty: true });
      if (laterEdit === 'image') result.current.field.onChange(replacement);
    });
    await act(async () => { request.resolve(); await pending; });
    expect(result.current.form.formState.defaultValues).toMatchObject({ image: stored });
    expect(result.current.form.getValues('image')).toEqual(laterEdit === 'image' ? replacement : stored);
    expect(result.current.form.isDirty).toBe(laterEdit !== 'none');
    expect(result.current.form.getFieldState('image').isDirty).toBe(laterEdit === 'image');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    if (laterEdit === 'none') {
      expect(result.current.form.formState.dirtyFields).toEqual({});
      expect(draft()).toBeUndefined();
    } else {
      expect(draft()).toMatchObject(laterEdit === 'image' ? { image: replacement } : { title: 'Later title', image: stored });
    }
  });

  it('writes no draft when the editor equals its base', async () => {
    vi.useFakeTimers();
    const { result } = mount({ operation: 'edit' });
    act(() => result.current.setValue('title', defaults.title, { shouldDirty: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(useFormStore.getState().loadDraft(`${draftKey}-record-1`)).toBeNull();
  });

  it('clears a stored draft equal to its base without restoring or announcing it', async () => {
    useFormStore.getState().saveDraft(`${draftKey}-record-1`, { ...defaults, id: 'record-1' }, entity.name, 'record-1');
    const { result } = mount({ operation: 'edit' });
    await waitFor(() => expect(useFormStore.getState().loadDraft(`${draftKey}-record-1`)).toBeNull());
    expect(result.current.isDirty).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('restores a draft as dirty edits on top of the stored base', async () => {
    useFormStore.getState().saveDraft(`${draftKey}-record-1`, { title: 'Draft title' }, entity.name, 'record-1');
    const { result } = mount({ operation: 'edit' });
    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    expect(vi.mocked(toast).mock.calls[0]?.[0]).toMatchObject({ toastType: 'info' });
    expect(result.current.getValues('title')).toBe('Draft title');
    expect(result.current.formState.defaultValues).toMatchObject({ title: defaults.title });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.getFieldState('title').isDirty).toBe(true);
    expect(result.current.getFieldState('address').isDirty).toBe(false);
  });

  it('flags a draft edited from an older version of the stored row as a conflict', async () => {
    const older = { ...defaults, id: 'record-1', updatedAt: '2026-01-01T00:00:00.000Z' };
    useFormStore.getState().saveDraft(`${draftKey}-record-1`, { title: 'Draft title' }, entity.name, 'record-1', { '@record': older });
    const { result } = renderHook(() => useEntityForm(entity, { viewerRole: 'user', operation: 'edit', formId,
      defaultValues: { ...defaults, id: 'record-1', updatedAt: '2026-02-01T00:00:00.000Z' },
    }));
    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    expect(vi.mocked(toast).mock.calls[0]?.[0]).toMatchObject({ toastType: 'warning', duration: Infinity });
    // The edit keeps the version it was made from: a revision-checked save refuses it.
    expect(result.current.record).toMatchObject({ updatedAt: older.updatedAt });
  });

  it('writes a pending autosave when the page unmounts inside the debounce', () => {
    vi.useFakeTimers();
    const { result, unmount } = mount();
    act(() => result.current.setValue('title', 'Typed then left', { shouldDirty: true }));
    expect(draft()).toBeUndefined();
    unmount();
    expect(draft()).toMatchObject({ title: 'Typed then left' });
  });

  it('does not write a draft on unmount when nothing is pending', () => {
    const { unmount } = mount();
    unmount();
    expect(draft()).toBeUndefined();
  });

  it('persists the draft at submit so a failed save after unmount keeps edits made inside the debounce', async () => {
    vi.useFakeTimers();
    const { result, unmount } = mount();
    // Edit and submit at once: the 3s autosave has not fired.
    act(() => result.current.setValue('title', 'Edited just now', { shouldDirty: true }));
    const request = deferred();
    const submit = vi.fn(() => request.promise);
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.handleSubmit(submit)().then(() => undefined, (error: unknown) => error);
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(draft()).toMatchObject({ title: 'Edited just now' });
    // The page leaves before the server answers, then the save fails.
    unmount();
    await act(async () => { request.reject(new Error('server rejected')); await pending; });
    expect(draft()).toMatchObject({ title: 'Edited just now' });
  });

  it('retains later edits immediately on success before the autosave debounce fires', async () => {
    vi.useFakeTimers();
    const { result } = mount();
    const request = deferred();
    const submit = vi.fn(() => request.promise);
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    act(() => result.current.setValue('address.city', 'Later city', { shouldDirty: true }));
    await act(async () => { request.resolve(); await pending; });
    expect(result.current.isDirty).toBe(true);
    expect(draft()).toMatchObject({ address: { city: 'Later city' } });
    // Returning to the accepted snapshot is clean, not the original pre-save baseline.
    act(() => result.current.setValue('address.city', defaults.address.city, { shouldDirty: true }));
    expect(result.current.isDirty).toBe(false);
  });

  it.each(['success', 'rejection'] as const)('keeps nested edits during resolver and onValid delays on %s', async (outcome) => {
    const { result } = mount();
    act(() => {
      result.current.setValue('title', 'Submitted', { shouldDirty: true });
      result.current.setValue('address.street', 'Submitted street', { shouldDirty: true });
    });
    const validation = deferred();
    const request = deferred();
    const enteredValidation = vi.fn(() => validation.promise);
    gate.hold = enteredValidation;
    const submit = vi.fn((_data: Record<string, unknown>) => request.promise);
    let pending!: Promise<void>;
    act(() => { pending = result.current.handleSubmit(submit)(); });
    // Attach rejection handling before settling the deferred request.
    const settled = pending.then(() => undefined, (error: unknown) => error);
    await waitFor(() => expect(enteredValidation).toHaveBeenCalledOnce());
    act(() => result.current.setValue('address.street', 'During validation', { shouldDirty: true }));
    await act(async () => { validation.resolve(); });
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      title: 'Submitted', address: { street: 'Submitted street', city: 'Caller city' },
    });
    vi.useFakeTimers();
    act(() => {
      result.current.setValue('address.city', 'During request', { shouldDirty: true });
      result.current.setValue('note', 'New field', { shouldDirty: true });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(draft()).toMatchObject({ address: { street: 'During validation', city: 'During request' }, note: 'New field' });
    await act(async () => {
      if (outcome === 'success') request.resolve();
      else request.reject(new Error('Rejected'));
      const error = await settled;
      if (outcome === 'rejection') expect(error).toEqual(new Error('Rejected'));
    });
    expect(result.current.getValues()).toMatchObject({
      title: 'Submitted', address: { street: 'During validation', city: 'During request' }, note: 'New field',
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.getFieldState('address.street').isDirty).toBe(true);
    expect(draft()).toMatchObject({ note: 'New field', address: { street: 'During validation', city: 'During request' } });
    if (outcome === 'success') {
      expect(result.current.formState.defaultValues).toMatchObject({
        title: 'Submitted', address: { street: 'Submitted street', city: 'Caller city' },
      });
      expect(result.current.getFieldState('title').isDirty).toBe(false);
    } else {
      expect(result.current.formState.defaultValues).toMatchObject(defaults);
      expect(result.current.getFieldState('title').isDirty).toBe(true);
    }
  });
});
