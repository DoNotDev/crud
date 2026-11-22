// packages/features/crud/src/forms/hooks/__tests__/useEntityForm.toastsOption.test.ts

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@donotdev/components';

import { useFormStore } from '../../../stores';
import { useEntityForm } from '../useEntityForm';
import { draftAcknowledgementEntity, leaveOnSaveEntity as entity } from '@dndev/test-entities';

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/components')>(),
  toast: vi.fn(),
}));

/** Create validates required fields: an empty create fails validation. */
async function submitInvalid(toasts?: boolean) {
  const { result } = renderHook(() =>
    useEntityForm(entity, {
      viewerRole: 'user',
      operation: 'create',
      formId: 'toasts-option',
      successPath: null,
      ...(toasts === undefined ? {} : { toasts }),
    })
  );
  const submit = vi.fn();
  await act(async () => { await result.current.handleSubmit(submit)(); });
  expect(submit).not.toHaveBeenCalled();
}

beforeEach(() => {
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
});

const draftKey = 'draftacknowledgement-form-draft-toasts-option';

/** Mounts a create form over a saved draft with an edit: it restores. */
function mountWithDraft(toasts?: boolean) {
  useFormStore.getState().saveDraft(draftKey, { title: 'Draft title' }, draftAcknowledgementEntity.name);
  return renderHook(() =>
    useEntityForm(draftAcknowledgementEntity, {
      viewerRole: 'user',
      operation: 'create',
      formId: 'toasts-option',
      ...(toasts === undefined ? {} : { toasts }),
    })
  );
}

describe('useEntityForm toasts', () => {
  it('toasts the fields to correct by default', async () => {
    await submitInvalid();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ toastType: 'error' }));
  });

  it('toasts the restored draft by default', () => {
    mountWithDraft();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ toastType: 'info' }));
  });

  it('toasts: false shows no validation toast', async () => {
    await submitInvalid(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('toasts: false restores the draft without a toast', () => {
    const { result } = mountWithDraft(false);
    expect(result.current.getValues()).toMatchObject({ title: 'Draft title' });
    expect(toast).not.toHaveBeenCalled();
  });
});
