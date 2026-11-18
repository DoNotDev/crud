// packages/features/crud/src/forms/hooks/__tests__/useEntityForm.navigation.test.ts

import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


import { useFormStore } from '../../../stores';
import { FormNavigationProvider, type FormNavigation } from '../../FormNavigation';
import { useEntityForm } from '../useEntityForm';
import { leaveOnSaveEntity as entity } from '@dndev/test-entities';

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/components')>(),
  toast: vi.fn(),
}));


function router(path = '/routines/abc') {
  let current = path;
  const navigate = vi.fn((to: string) => { current = to; });
  const value: FormNavigation = {
    navigate,
    currentPath: () => current,
    parentPath: () => '/routines',
  };
  return { value, navigate };
}

function mount(successPath: string | null | undefined, navigation: FormNavigation | null, operation: 'create' | 'edit' = 'edit') {
  const wrapper = ({ children }: { children: ReactNode }) =>
    navigation ? createElement(FormNavigationProvider, { value: navigation }, children) : children;
  return renderHook(() => useEntityForm(entity, { viewerRole: 'user',
    operation, formId: 'leave-on-save',
    defaultValues: operation === 'edit' ? { id: 'abc', title: 'Saved' } : {},
    ...(successPath !== undefined ? { successPath } : {}),
  }), { wrapper });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useEntityForm leave on save', () => {
  it('leaves for the previous breadcrumb before the write settles', async () => {
    const { value, navigate } = router();
    const { result } = mount(undefined, value);
    const request = deferred();
    const submit = vi.fn(() => request.promise);
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/routines');
    await act(async () => { request.resolve(); await pending; });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('returns to the page it left when the write rejects', async () => {
    const { value, navigate } = router();
    const { result } = mount(undefined, value);
    const thrown = Object.assign(new Error('rejected'), { code: '23503', details: ['routine-1'] });
    await act(async () => {
      await expect(result.current.handleSubmit(async () => { throw thrown; })()).rejects.toThrow('rejected');
    });
    expect(navigate.mock.calls).toEqual([['/routines'], ['/routines/abc']]);
    // The page it returns to can show the detailed error, not only the message.
    expect(useFormStore.getState().forms['leave-on-save']).toMatchObject({ error: 'rejected', errorCause: thrown });
  });

  it('uses an explicit successPath', async () => {
    const { value, navigate } = router();
    const { result } = mount('/elsewhere', value);
    await act(async () => { await result.current.handleSubmit(vi.fn())(); });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/elsewhere');
  });

  it('stays with successPath null', async () => {
    const { value, navigate } = router();
    const { result } = mount(null, value);
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets one submit override the hook option, both ways', async () => {
    const { value, navigate } = router();
    const { result } = mount(null, value);
    await act(async () => { await result.current.handleSubmit(vi.fn(), undefined, { successPath: undefined })(); });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/routines');
    navigate.mockClear();
    await act(async () => { await result.current.handleSubmit(vi.fn(), undefined, {})(); });
    expect(navigate).not.toHaveBeenCalled();
    const { result: leaving } = mount(undefined, value);
    await act(async () => { await leaving.current.handleSubmit(vi.fn(), undefined, { successPath: null })(); });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays when the target is the current page', async () => {
    const { value, navigate } = router('/routines');
    const { result } = mount('/routines', value);
    await act(async () => { await result.current.handleSubmit(vi.fn())(); });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays without router access', async () => {
    const { result } = mount(undefined, null);
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('does not navigate when validation fails', async () => {
    const { value, navigate } = router();
    // Create validates required fields (edit validates a partial update).
    const { result } = mount(undefined, value, 'create');
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
