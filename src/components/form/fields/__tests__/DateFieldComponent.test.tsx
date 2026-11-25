/**
 * @fileoverview Regression: datetime-local showed UTC (toISOString().slice) instead of local time,
 * and saved the picker's naive local string as is. Since T1 (2026-11-25) the wall time is
 * the app's zone (ComponentLocale timeZone), whatever the machine's zone.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';

import { ComponentLocaleProvider } from '@donotdev/components';

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
  Input: ({
    type,
    value,
    onChange,
  }: {
    type: string;
    value: string;
    onChange: (e: unknown) => void;
  }) => (
    <input data-testid="native" data-type={type} value={value} onChange={onChange} />
  ),
  Stack: ({ children }: { children: unknown }) => (
    <div>{children as never}</div>
  ),
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
}));

/** The app's time zone (i18n.timeZone), as @donotdev/ui providers pass it to components. */
const inParis = (ui: ReactElement) => (
  <ComponentLocaleProvider
    value={{ language: 'fr', timeZone: 'Europe/Paris', translate: (key) => key }}
  >
    {ui}
  </ComponentLocaleProvider>
);

/** Runs `fn` with the process (the "browser") in `tz`. */
function inProcessZone(tz: string, fn: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

// Owner decision 2026-11-25 T1: wall times in the app's zone, not the machine's
describe('DateFieldComponent datetime-local', () => {
  it.each(['UTC', 'America/New_York', 'Asia/Tokyo'])(
    'shows the stored instant as its wall time in the app zone (machine in %s)',
    (tz) => {
      inProcessZone(tz, () => {
        const { unmount } = render(
          inParis(
            <DateFieldComponent
              label="Starts"
              value="2026-11-24T23:30:00.000Z"
              onChange={() => {}}
              mode="datetime-local"
            />
          )
        );
        expect((screen.getByTestId('dt') as HTMLInputElement).value).toBe(
          '2026-11-25T00:30'
        );
        unmount();
      });
    }
  );

  it.each(['UTC', 'America/New_York', 'Asia/Tokyo'])(
    'saves the picked wall time as the UTC instant of that time in the app zone (machine in %s)',
    (tz) => {
      inProcessZone(tz, () => {
        const onChange = vi.fn();
        const { unmount } = render(
          inParis(
            <DateFieldComponent
              label="Starts"
              value={null}
              onChange={onChange}
              mode="datetime-local"
            />
          )
        );
        fireEvent.change(screen.getByTestId('dt'), {
          target: { value: '2026-11-25T00:30' },
        });
        expect(onChange).toHaveBeenCalledWith('2026-11-24T23:30:00.000Z');
        unmount();
      });
    }
  );
});

// Owner decision 2026-11-25 T1: a calendar / wall-clock value is shown and stored as
// written; an instant goes through the app zone (as the date and datetime modes)
describe('DateFieldComponent month, time, week', () => {
  const nativeValue = () => (screen.getByTestId('native') as HTMLInputElement).value;

  it.each([
    ['time', '14:30'],
    ['time', '09:15:42'],
    ['month', '2026-11'],
    ['week', '2026-W48'],
  ] as const)('shows a stored %s value %s as written, whatever the machine zone', (mode, stored) => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      inProcessZone(tz, () => {
        const { unmount } = render(
          inParis(
            <DateFieldComponent label="F" value={stored} onChange={() => {}} mode={mode} />
          )
        );
        expect(nativeValue()).toBe(stored);
        unmount();
      });
    }
  });

  it.each([
    ['time', '14:30'],
    ['month', '2026-11'],
    ['week', '2026-W48'],
  ] as const)('stores the %s input value %s as written (no instant)', (mode, typed) => {
    const onChange = vi.fn();
    render(inParis(<DateFieldComponent label="F" value={null} onChange={onChange} mode={mode} />));
    fireEvent.change(screen.getByTestId('native'), { target: { value: typed } });
    expect(onChange).toHaveBeenCalledWith(typed);
  });

  it('stores null when the input is cleared', () => {
    const onChange = vi.fn();
    render(inParis(<DateFieldComponent label="F" value="14:30" onChange={onChange} mode="time" />));
    fireEvent.change(screen.getByTestId('native'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // 2026-11-30T23:30Z is Tuesday 1 December 00:30 in Paris (ISO week 49)
  it.each([
    ['time', '00:30'],
    ['month', '2026-12'],
    ['week', '2026-W49'],
  ] as const)('shows a stored instant as its %s in the app zone (%s)', (mode, shown) => {
    inProcessZone('America/New_York', () => {
      const { unmount } = render(
        inParis(
          <DateFieldComponent
            label="F"
            value="2026-11-30T23:30:00.000Z"
            onChange={() => {}}
            mode={mode}
          />
        )
      );
      expect(nativeValue()).toBe(shown);
      unmount();
    });
  });

  it('shows the ISO week of a calendar date across a year boundary', () => {
    // Friday 1 January 2027 belongs to week 53 of 2026
    render(inParis(<DateFieldComponent label="F" value="2027-01-01" onChange={() => {}} mode="week" />));
    expect(nativeValue()).toBe('2026-W53');
  });
});
