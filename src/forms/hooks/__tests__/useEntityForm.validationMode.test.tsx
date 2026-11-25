// packages/features/crud/src/forms/hooks/__tests__/useEntityForm.validationMode.test.tsx

/**
 * Validation timing of entity forms ("reward early, punish late", React Hook Form
 * `mode: 'onTouched'`, the default): no error while the user first types, the first
 * error when they leave the field, then re-validation on every change so the fix
 * clears it without leaving the field again. With `onBlur` (the old default) a
 * corrected field stayed red until the next blur.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { leaveOnSaveEntity as entity } from '@dndev/test-entities';

import { ControlledTextField } from '../../../components/controlled/input/ControlledTextField';
import { useFormStore } from '../../../stores';
import type { UseEntityFormOptions } from '../../types';
import { useEntityForm } from '../useEntityForm';

afterEach(() => {
  cleanup();
  useFormStore.setState({ drafts: {}, forms: {} });
  localStorage.clear();
});

function TitleForm({
  mode,
}: {
  mode?: UseEntityFormOptions<typeof entity>['mode'];
}) {
  const form = useEntityForm(entity, {
    viewerRole: 'user',
    operation: 'create',
    formId: 'validation-mode',
    successPath: null,
    toasts: false,
    ...(mode ? { mode } : {}),
  });
  return (
    <ControlledTextField
      control={form.control}
      fieldConfig={entity.fields.title}
      t={form.t}
    />
  );
}

const input = () => screen.getByRole('textbox');
const invalid = () => input().getAttribute('aria-invalid') === 'true';
const typeValue = async (value: string) => {
  await act(async () => {
    fireEvent.change(input(), { target: { value } });
  });
};

describe('useEntityForm validation mode', () => {
  it('default onTouched: silent while first typing, error on leave, cleared while typing the fix', async () => {
    render(<TitleForm />);
    await typeValue('a');
    await typeValue('');
    expect(invalid()).toBe(false);

    await act(async () => {
      fireEvent.blur(input());
    });
    await waitFor(() => expect(invalid()).toBe(true));
    const message = document.getElementById(
      input().getAttribute('aria-describedby')!
    );
    expect(message?.textContent).not.toBe('');

    // No blur: the change alone re-validates
    await typeValue('Fixed');
    await waitFor(() => expect(invalid()).toBe(false));
    expect(input().hasAttribute('aria-describedby')).toBe(false);
  });

  it('mode stays overridable: onBlur keeps the corrected field in error until it is left', async () => {
    render(<TitleForm mode="onBlur" />);
    await typeValue('');
    await act(async () => {
      fireEvent.blur(input());
    });
    await waitFor(() => expect(invalid()).toBe(true));
    await typeValue('Fixed');
    await act(async () => {});
    expect(invalid()).toBe(true);
  });
});
