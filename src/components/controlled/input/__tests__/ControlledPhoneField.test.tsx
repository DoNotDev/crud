import { createRef } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PhoneNumberComponent, {
  toPhoneValue,
} from '../../../form/fields/PhoneNumberComponent';
import { ControlledPhoneField } from '../ControlledPhoneField';

// Keep the actual phone component and Input: mocking Input would hide lost DOM events.
vi.mock('../../../form/fields', async () => ({
  PhoneNumberComponent: (
    await import('../../../form/fields/PhoneNumberComponent')
  ).default,
}));

vi.mock('@donotdev/core', () => ({
  Flag: () => null,
  COUNTRIES: [{ code: 'FR', dialCode: '+33', flagCode: 'FR', name: 'France' }],
}));

// Avoid loading unrelated form utilities through the barrel.
vi.mock(
  '../../../../forms/utils',
  async () => import('../../../../forms/utils/emptyValue')
);

afterEach(cleanup);

function Form() {
  const { control, setFocus, watch, formState } = useForm({
    mode: 'onBlur',
    defaultValues: { phone: '+33 6 12 34 56 78' },
  });

  return (
    <>
      <ControlledPhoneField
        control={control}
        fieldConfig={{
          name: 'phone',
          label: 'fields.phone',
          type: 'phone',
          visibility: 'guest',
          editable: 'admin',
          validation: { pattern: '^\\+33 6' },
        }}
        t={(key) => key}
      />
      <button type="button" onClick={() => setFocus('phone')}>
        Focus phone
      </button>
      <output data-testid="value">{watch('phone')}</output>
      <output data-testid="touched">
        {String(!!formState.touchedFields.phone)}
      </output>
    </>
  );
}

describe('phone controller plumbing', () => {
  it('forwards optional name, blur callback and native ref to the actual tel input', () => {
    const ref = createRef<HTMLInputElement>();
    const onBlur = vi.fn();
    render(
      <PhoneNumberComponent
        label="Phone"
        name="contact.phone"
        ref={ref}
        onBlur={onBlur}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('type')).toBe('tel');
    expect(input.getAttribute('name')).toBe('contact.phone');
    expect(ref.current).toBe(input);
    ref.current?.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur.mock.calls[0]?.[0].target).toBe(input);
  });

  it('preserves callers without the new optional props', () => {
    render(<PhoneNumberComponent label="Phone" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox').getAttribute('name')).toBeNull();
  });

  it('preserves error rendering and clearing', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PhoneNumberComponent
        label="Phone"
        onChange={onChange}
        error="Invalid phone"
      />
    );
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(
      input.getAttribute('aria-describedby')!
    );
    expect(message?.textContent).toContain('Invalid phone');
    rerender(<PhoneNumberComponent label="Phone" onChange={onChange} />);
    expect(screen.queryByText('Invalid phone')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps controlled values and supports RHF focus on the telephone input', async () => {
    render(<Form />);
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('name')).toBe('phone');
    expect(input).toHaveProperty('value', '6 12 34 56 78');
    fireEvent.click(screen.getByRole('button', { name: 'Focus phone' }));
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: '6 98 76 54 32' } });
    expect(input).toHaveProperty('value', '698765432');
    expect(screen.getByTestId('value').textContent).toBe('+33 698765432');
  });

  it('validates on blur, marks touched and clears errors after correction', async () => {
    render(<Form />);
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('name')).toBe('phone');
    expect(input).toHaveProperty('value', '6 12 34 56 78');
    fireEvent.click(screen.getByRole('button', { name: 'Focus phone' }));
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: '1 23' } });
    expect(screen.getByTestId('value').textContent).toBe('+33 123');
    expect(screen.queryByText('Invalid format')).toBeNull();
    fireEvent.blur(input);
    await waitFor(() =>
      expect(screen.getByTestId('touched').textContent).toBe('true')
    );
    expect(
      document.getElementById(input.getAttribute('aria-describedby')!)
        ?.textContent
    ).toContain('Invalid format');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '6 98 76 54 32' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(screen.queryByText('Invalid format')).toBeNull()
    );
    expect(screen.getByTestId('value').textContent).toBe('+33 698765432');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('toPhoneValue (stored value of a typed number)', () => {
  it.each([
    ['06 12 34 56 78'],
    ['0612345678'],
    ['06.12.34.56.78'],
    ['06-12-34-56-78'],
    ['6 12 34 56 78'],
    ['+33 6 12 34 56 78'],
    ['+33612345678'],
    ['0033612345678'],
    ['+33 06 12 34 56 78'],
  ])('%s with +33 stores one dial code, no trunk 0, no separators', (typed) => {
    expect(toPhoneValue(typed, '+33')).toBe('+33 612345678');
  });

  it.each([[''], ['+33'], ['+33 '], ['0033'], ['0'], ['  ']])(
    '%j (no number after the dial code) stores nothing',
    (typed) => {
      expect(toPhoneValue(typed, '+33')).toBe('');
    }
  );

  it('keeps a number typed with another dial code as typed, never prefixed', () => {
    expect(toPhoneValue('+44 7911 123456', '+33')).toBe('+447911123456');
    expect(toPhoneValue('0044 7911 123456', '+33')).toBe('+447911123456');
  });
});

describe('phone field stored value', () => {
  function Optional() {
    const { control, watch } = useForm<{ phone: string | null }>({
      defaultValues: { phone: null },
    });
    return (
      <>
        <ControlledPhoneField
          control={control}
          fieldConfig={{
            name: 'phone',
            label: 'fields.phone',
            type: 'tel',
            visibility: 'guest',
            editable: 'admin',
          }}
          t={(key) => key}
        />
        <output data-testid="value">{String(watch('phone'))}</output>
      </>
    );
  }

  it.each([
    ['+33 6 12 34 56 78', '+33 612345678'],
    ['+33612345678', '+33 612345678'],
    ['0033612345678', '+33 612345678'],
    ['06.12.34.56.78', '+33 612345678'],
    ['+33', 'null'],
    ['', 'null'],
  ])('typed %j stores %s', (typed, stored) => {
    render(<Optional />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '612' } });
    fireEvent.change(input, { target: { value: typed } });
    expect(screen.getByTestId('value').textContent).toBe(stored);
  });
});
