import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { syncQueryCacheIdentity } from '@donotdev/core';

import { useFormStore } from '../FormStore';
import type { FormStoreActions, FormStoreState } from '../FormStore';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  const store = useFormStore.getState();
  for (const id of Object.keys(store.forms)) store.cleanup(id);
  for (const key of Object.keys(store.drafts)) store.clearDraft(key);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('real FormStore domain lifecycle', () => {
  it('retains domain types and callable loading getter without factory lifecycle', () => {
    const store = useFormStore.getState();
    expectTypeOf(store).toEqualTypeOf<FormStoreState & FormStoreActions>();
    expectTypeOf(store.isLoading).toEqualTypeOf<(formId: string) => boolean>();
    expectTypeOf(store.setError).toEqualTypeOf<(formId: string, error: string) => void>();
    expectTypeOf(store.cleanup).toEqualTypeOf<(formId: string) => void>();
    expect(store).not.toHaveProperty('setLoading');
    expect(store).not.toHaveProperty('initialize');
    expect(store.isLoading('a')).toBe(false);
    store.startSubmit('a');
    expect(store.isLoading('a')).toBe(true);
    store.setValidating('a');
    expect(store.isLoading('a')).toBe(true);
    store.setSubmitting('a');
    expect(store.isLoading('a')).toBe(true);
    store.setError('a', 'Rejected');
    expect(store.isLoading('a')).toBe(false);
  });

  it('stores the message and error status only on the target and never auto-dismisses', () => {
    const store = useFormStore.getState();
    store.startSubmit('other');
    store.setError('target', 'Accept the terms');
    expect(store.getStatus('target')).toBe('error');
    expect(store.getError('target')).toBe('Accept the terms');
    expect(store.getStatus('other')).toBe('uploading');
    expect(store.getError('other')).toBeNull();
    vi.advanceTimersByTime(6_000);
    expect(store.getStatus('target')).toBe('error');
    expect(store.getError('target')).toBe('Accept the terms');
    store.cleanup('other');
    vi.advanceTimersByTime(60_000);
    expect(store.getError('target')).toBe('Accept the terms');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['retry', 'dismiss', 'reset', 'success', 'cleanup'] as const)(
    '%s clears only the target error', (action) => {
      const store = useFormStore.getState();
      store.setError('a', 'First failure');
      store.setError('b', 'Second failure');
      switch (action) {
        case 'retry': store.startSubmit('a'); break;
        case 'dismiss': store.dismissError('a'); break;
        case 'reset': store.reset('a'); break;
        case 'success': store.setSuccess('a'); break;
        case 'cleanup': store.cleanup('a'); break;
      }
      expect(store.getError('a')).toBeNull();
      expect(store.getStatus('a')).toBe(
        action === 'retry' ? 'uploading' : action === 'success' ? 'success' : 'idle'
      );
      expect(store.getStatus('b')).toBe('error');
      expect(store.getError('b')).toBe('Second failure');
      if (action === 'cleanup') expect(useFormStore.getState().forms).not.toHaveProperty('a');
    }
  );

  it('cleanup cancels success and watchdog timers without affecting other forms', () => {
    const store = useFormStore.getState();
    store.startSubmit('watchdog');
    store.setSuccess('success');
    store.startSubmit('remaining');
    expect(vi.getTimerCount()).toBe(3);
    store.cleanup('watchdog');
    store.cleanup('success');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(45_000);
    expect(useFormStore.getState().forms).not.toHaveProperty('watchdog');
    expect(useFormStore.getState().forms).not.toHaveProperty('success');
    expect(store.getStatus('remaining')).toBe('error');
    expect(store.getError('remaining')).toBe('Operation timed out. Please try again.');
    vi.advanceTimersByTime(6_000);
    expect(store.getStatus('remaining')).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains success auto-reset and cancels it on retry or error', () => {
    const store = useFormStore.getState();
    store.setSuccess('a');
    vi.advanceTimersByTime(1_500);
    expect(store.getStatus('a')).toBe('idle');
    store.setSuccess('a');
    store.startSubmit('a');
    expect(vi.getTimerCount()).toBe(1);
    store.setError('a', 'Retry failed');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(6_000);
    expect(store.getError('a')).toBe('Retry failed');
    store.setSuccess('a');
    store.setError('a', 'Late rejection');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(6_000);
    expect(store.getError('a')).toBe('Late rejection');
  });

  it('persists drafts only, not transient forms or lifecycle fields', () => {
    const store = useFormStore.getState();
    store.saveDraft('draft', { title: 'Draft title' }, 'article');
    store.setError('a', 'Not saved');
    const saved = JSON.parse(localStorage.getItem('dndev-form-drafts')!);
    expect(saved.state).toEqual({ drafts: useFormStore.getState().drafts });
    expect(store.loadDraft('draft')?.data).toEqual({ title: 'Draft title' });
  });
});

describe('drafts follow the sign-out', () => {
  it('clears every draft and bumps the epoch on sign-out, keeps them on sign-in', () => {
    const store = useFormStore.getState();
    syncQueryCacheIdentity('u1'); // first identity: adopted, no change event
    store.saveDraft('a', { title: 'A' }, 'Entity');
    store.saveDraft('b', { title: 'B' }, 'Entity');
    const epoch = useFormStore.getState().draftsEpoch;
    syncQueryCacheIdentity(null); // sign-out
    expect(useFormStore.getState().drafts).toEqual({});
    expect(useFormStore.getState().draftsEpoch).toBe(epoch + 1);
    expect(JSON.parse(localStorage.getItem('dndev-form-drafts')!).state).toEqual({ drafts: {} });
    store.saveDraft('guest', { title: 'Guest' }, 'Entity');
    syncQueryCacheIdentity('u2'); // sign-in
    expect(store.loadDraft('guest')?.data).toEqual({ title: 'Guest' });
    expect(useFormStore.getState().draftsEpoch).toBe(epoch + 1);
  });
});
