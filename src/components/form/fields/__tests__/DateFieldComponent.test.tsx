/**
 * @fileoverview Regression: datetime-local showed UTC (toISOString().slice) instead of local time,
 * and saved the picker's naive local string as is.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import DateFieldComponent from '../DateFieldComponent';

vi.mock('@donotdev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/components')>()),
  DateTimePicker: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
  }) => (
    <input
      data-testid="dt"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
  DatePicker: () => null,
  Input: () => null,
  Stack: ({ children }: { children: unknown }) => (
    <div>{children as never}</div>
  ),
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
}));

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

describe('DateFieldComponent datetime-local', () => {
  it('shows the stored instant in local time', () => {
    const iso = '2026-11-13T09:30:00.000Z';
    render(
      <DateFieldComponent
        label="Starts"
        value={iso}
        onChange={() => {}}
        mode="datetime-local"
      />
    );
    expect((screen.getByTestId('dt') as HTMLInputElement).value).toBe(
      local(new Date(iso))
    );
  });

  it('saves the local input as an ISO instant', () => {
    const onChange = vi.fn();
    render(
      <DateFieldComponent
        label="Starts"
        value={null}
        onChange={onChange}
        mode="datetime-local"
      />
    );
    fireEvent.change(screen.getByTestId('dt'), {
      target: { value: '2026-11-13T10:30' },
    });
    expect(onChange).toHaveBeenCalledWith(
      new Date('2026-11-13T10:30').toISOString()
    );
  });
});
