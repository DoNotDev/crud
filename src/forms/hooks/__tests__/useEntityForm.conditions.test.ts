import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSchemas } from '@donotdev/core';
import { conditionalAccountEntity as entity } from '@dndev/test-entities';

import { useFormStore } from '../../../stores';
import { useEntityForm } from '../useEntityForm';

const validationGate = vi.hoisted(() => ({
  hold: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('@hookform/resolvers/valibot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hookform/resolvers/valibot')>();
  return {
    ...actual,
    valibotResolver: (...args: Parameters<typeof actual.valibotResolver>) => {
      const resolve = actual.valibotResolver(...args);
      return async (...inputs: Parameters<typeof resolve>) => {
        const result = await resolve(...inputs);
        await validationGate.hold?.();
        return result;
      };
    },
  };
});

const valid = {
  companyName: 'Company', billingCountry: 'FR', siret: '12345678901234', companyId: 'x',
  shippingSameAsBilling: true, shippingCity: 'too long', cgvAcceptedVersion: 'v1', optionalOverride: null,
};
const draftKey = 'conditionalproaccount-form-draft-conditions';
afterEach(() => {
  validationGate.hold = undefined;
  cleanup();
  useFormStore.getState().clearDraft(draftKey);
  vi.restoreAllMocks();
});

function mount() {
  return renderHook(() => useEntityForm(entity, { viewerRole: 'user', operation: 'create', formId: 'conditions', defaultValues: valid }));
}

describe('condition-aware entity forms', () => {
  it('skips inactive parsing, preserves hidden defaults/drafts, and leaves write validation strict', async () => {
    const { result } = mount();
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0]).toMatchObject(valid);
    expect(result.current.getValues('companyId')).toBe('x');
    expect(v.safeParse(createSchemas(entity).create, valid).success).toBe(false);
  });

  it.each(['create', 'edit'] as const)('omits raw unknown, static-hidden, generated and backend values on %s', async (operation) => {
    const raw = {
      ...valid, id: 'record-1', injected: 'unknown', privateNote: 'secret', generatedCode: 'generated',
      staticSecret: 'secret', staticGenerated: 'generated',
      createdAt: 'backend', translatedNote: 'retained', translatedNoteI18n: { de: 'Behalten' },
      companyNameI18n: { de: 'undeclared' },
    };
    const { result } = renderHook(() => useEntityForm(entity, { viewerRole: 'user', operation, defaultValues: raw }));
    // id makes the CGV field visible; keep it valid while other conditions stay inactive.
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit).toHaveBeenCalledOnce();
    const payload: Record<string, unknown> = submit.mock.calls[0]?.[0];
    for (const name of ['injected', 'privateNote', 'generatedCode', 'staticSecret', 'staticGenerated', 'createdAt', 'companyNameI18n']) {
      expect(payload).not.toHaveProperty(name);
    }
    expect(payload).toMatchObject({ companyId: 'x', translatedNote: 'retained', translatedNoteI18n: { de: 'Behalten' } });
  });

  it.each(['FR', 'DE'])('leaves retained identities available for domain normalization (%s)', async (billingCountry) => {
    const { result } = renderHook(() => useEntityForm(entity, { viewerRole: 'user',
      operation: 'create', defaultValues: { ...valid, billingCountry, companyId: 'DE123', optionalOverride: 'yes' },
    }));
    const persist = vi.fn();
    await act(async () => {
      await result.current.handleSubmit((data) => {
        persist({
          ...data,
          siret: billingCountry === 'FR' ? data.siret : null,
          companyId: billingCountry === 'FR' ? null : data.companyId,
        });
      })();
    });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      siret: billingCountry === 'FR' ? valid.siret : null,
      companyId: billingCountry === 'FR' ? null : 'DE123',
      cgvAcceptedVersion: 'v1',
    }));
  });

  it('restores inactive invalid values from a saved draft without blocking submission', async () => {
    useFormStore.getState().saveDraft(draftKey, { ...valid, status: 'available' }, entity.name);
    const { result } = renderHook(() => useEntityForm(entity, { viewerRole: 'user',
      operation: 'create', formId: 'conditions',
    }));
    expect(result.current.getValues('companyId')).toBe('x');
    expect(result.current.getValues('shippingCity')).toBe('too long');
    const submit = vi.fn();
    await act(async () => { await result.current.handleSubmit(submit)(); });
    expect(submit.mock.calls[0]?.[0]).toMatchObject(valid);
  });

  it('rejects the active identifier, clears stale hidden errors on a country change and restores retained values', async () => {
    const { result } = mount();
    const submit = vi.fn();
    await act(async () => {
      result.current.setValue('siret', '123');
      await result.current.handleSubmit(submit)();
    });
    expect(submit).not.toHaveBeenCalled();
    expect(result.current.getFieldState('siret').error).toBeDefined();
    await act(async () => { result.current.setValue('billingCountry', 'DE'); });
    await waitFor(() => expect(result.current.getFieldState('companyId').error).toBeDefined());
    expect(result.current.getFieldState('siret').error).toBeUndefined();
    expect(result.current.getValues('siret')).toBe('123');
    await act(async () => {
      result.current.setValue('companyId', 'DE123');
      result.current.setValue('optionalOverride', 'yes');
      await result.current.handleSubmit(submit)();
    });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('conditional required overrides static required in both directions', async () => {
    const { result } = mount();
    await act(async () => { await result.current.trigger('optionalOverride'); });
    expect(result.current.getFieldState('optionalOverride').error).toBeUndefined();
    await act(async () => { result.current.setValue('billingCountry', 'DE'); });
    await waitFor(() => expect(result.current.getFieldState('optionalOverride').error).toBeDefined());
    await act(async () => { result.current.setValue('billingCountry', 'FR'); });
    await waitFor(() => expect(result.current.getFieldState('optionalOverride').error).toBeUndefined());
    await act(async () => {
      result.current.setValue('siret', null);
      await result.current.trigger('siret');
    });
    expect(result.current.getFieldState('siret').error).toBeDefined();
  });

  it('coalesces rapid country changes and clears stale errors after pending validation', async () => {
    const { result } = mount();
    let release: () => void = () => { throw new Error('Validation has not started'); };
    let started = false;
    let calls = 0;
    await act(async () => {
      result.current.setValue('siret', 'bad');
      result.current.setValue('billingCountry', 'DE');
    });
    await waitFor(() => expect(result.current.getFieldState('companyId').error).toBeDefined());
    validationGate.hold = () => {
      calls++;
      if (calls !== 1) return Promise.resolve();
      started = true;
      return new Promise<void>((resolve) => { release = resolve; });
    };
    await act(async () => { result.current.setValue('billingCountry', 'FR'); });
    await waitFor(() => expect(started).toBe(true));
    await act(async () => {
      result.current.setValue('billingCountry', 'DE');
      result.current.setValue('billingCountry', 'FR');
      result.current.setValue('billingCountry', 'DE');
    });
    expect(calls).toBe(1);
    await act(async () => { release(); });
    await waitFor(() => expect(calls).toBe(2));
    expect(result.current.getFieldState('siret').error).toBeUndefined();
    expect(result.current.getFieldState('companyId').error).toBeDefined();
    expect(result.current.getFieldState('optionalOverride').error).toBeDefined();
  });

  it('stops queued revalidations after unmount', async () => {
    const { result, unmount } = mount();
    let release: () => void = () => { throw new Error('Validation has not started'); };
    let started = false;
    const hold = vi.fn(() => new Promise<void>((resolve) => { started = true; release = resolve; }));
    validationGate.hold = hold;
    await act(async () => { result.current.setValue('billingCountry', 'DE'); });
    await waitFor(() => expect(started).toBe(true));
    await act(async () => { result.current.setValue('billingCountry', 'FR'); });
    unmount();
    await act(async () => { release(); });
    expect(hold).toHaveBeenCalledOnce();
  });

  it('does not revalidate on ordinary typing when validation conditions are unchanged', async () => {
    const { result } = mount();
    const validation = vi.fn(() => Promise.resolve());
    validationGate.hold = validation;
    await act(async () => {
      result.current.setValue('companyName', 'Typed');
      result.current.setValue('siret', '123');
    });
    expect(validation).not.toHaveBeenCalled();
  });

  it('validates drafts (created or edited) with the draft rules, other edits as updates', async () => {
    const submit = async (
      operation: 'create' | 'edit',
      defaultValues: Record<string, unknown>,
      edits: Record<string, unknown> = {}
    ) => {
      const form = renderHook(() => useEntityForm(entity, { viewerRole: 'user', operation, defaultValues }));
      await act(async () => {
        for (const [name, value] of Object.entries(edits)) form.result.current.setValue(name as never, value as never);
      });
      const onValid = vi.fn();
      await act(async () => { await form.result.current.handleSubmit(onValid)(); });
      return { called: onValid.mock.calls.length === 1, errors: form.result.current.formState.errors };
    };
    const emptied = { ...valid, siret: null, companyName: null };
    expect((await submit('create', { ...emptied, status: 'draft' })).called).toBe(true);
    expect((await submit('edit', { ...emptied, id: 'record-1', status: 'draft' })).called).toBe(true);
    // Edit = update (CRUD rule 2): what changes is validated, so emptying a required
    // field is rejected; required fields already empty in the stored row and left
    // untouched are not (conditionAwareResolver: a plain edit checks the changed fields).
    const edit = await submit('edit', { ...valid, id: 'record-1', status: 'available' }, { siret: null, companyName: null });
    expect(edit.called).toBe(false);
    expect(Object.keys(edit.errors).sort()).toEqual(['companyName', 'siret']);
    expect((await submit('edit', { ...emptied, id: 'record-1', status: 'available' })).called).toBe(true);
    expect((await submit('edit', { ...valid, id: 'record-1', status: 'available' })).called).toBe(true);
  });

  it('focuses the first mounted focusable invalid control only inside the submitting form', async () => {
    const { result } = mount();
    const other = document.createElement('input');
    other.name = 'siret';
    document.body.append(other);
    const form = document.createElement('form');
    const hidden = document.createElement('input');
    hidden.name = 'siret';
    hidden.type = 'hidden';
    const visible = document.createElement('input');
    visible.name = 'companyName';
    form.append(hidden, visible);
    document.body.append(form);
    vi.spyOn(visible, 'getClientRects').mockReturnValue({ length: 1, item: () => null, [Symbol.iterator]: function* () {} });
    const scroll = vi.spyOn(visible, 'scrollIntoView').mockImplementation(() => {});
    try {
      await act(async () => {
        result.current.setValue('siret', 'bad');
        result.current.setValue('companyName', null);
        await result.current.handleSubmit(vi.fn())({
          currentTarget: form, preventDefault() {}, persist() {},
        });
      });
      expect(document.activeElement).toBe(visible);
      expect(scroll).toHaveBeenCalledOnce();
    } finally {
      other.remove();
      form.remove();
    }
  });

  it('records rejected callbacks without success, draft clearing or dirty reset; retry succeeds', async () => {
    const { result } = mount();
    useFormStore.getState().saveDraft(draftKey, valid, entity.name);
    await act(async () => { result.current.setValue('companyName', 'Changed', { shouldDirty: true }); });
    const clear = vi.spyOn(useFormStore.getState(), 'clearDraft');
    const success = vi.spyOn(useFormStore.getState(), 'setSuccess');
    const failure = vi.spyOn(useFormStore.getState(), 'setError');
    await act(async () => {
      await expect(result.current.handleSubmit(async () => { throw new Error('Rejected'); })()).rejects.toThrow('Rejected');
    });
    expect(clear).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
    // Submit persists the editor, so the kept draft holds the rejected edit.
    expect(useFormStore.getState().loadDraft(draftKey)?.data).toMatchObject({ ...valid, companyName: 'Changed' });
    expect(failure).toHaveBeenCalledWith('conditions', 'Rejected', expect.objectContaining({ message: 'Rejected' }));
    expect(useFormStore.getState().forms.conditions).toMatchObject({ status: 'error', error: 'Rejected' });
    await act(async () => { await result.current.handleSubmit(vi.fn())(); });
    expect(success).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledWith(draftKey);
  });
});
