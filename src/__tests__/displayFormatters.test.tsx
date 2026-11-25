// packages/features/crud/src/__tests__/displayFormatters.test.tsx

/**
 * @fileoverview Admin value display (audit 2026-11-25 #5, #11): compact price = amount
 * (+ discount badge), boolean check icon / translated Yes-No, select badges, images
 * in the documented Picture shape, empty image tile.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EntityField } from '@donotdev/core';

import { formatValue } from '../components/DisplayFieldRenderer';

afterEach(cleanup);

const CRUD_EN: Record<string, string> = {
  'crud:boolean.yes': 'Yes',
  'crud:boolean.no': 'No',
  'crud:price.vatIncluded': 'VAT incl.',
  'crud:price.discountPercent': '-{{percent}}%',
};
const t = (key: string, options?: Record<string, unknown>) =>
  (CRUD_EN[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(options?.[name] ?? '')
  );

const field = (type: string, extra: Partial<EntityField> = {}) =>
  ({ name: 'f', label: 'f', type, visibility: 'guest', ...extra }) as EntityField;

/** Renders a formatter result (string or element) and returns its container. */
const show = (result: string | ReactElement) =>
  render(<div data-testid="cell">{result}</div>).getByTestId('cell');

describe('price display', () => {
  // VAT-inclusive prices, declared by the field (owner decision 2026-11-25 V2)
  const price = field('price', {
    options: { fieldSpecific: { vatIncluded: true } },
  } as Partial<EntityField>);

  it('leaves the VAT note out for a field without VAT-inclusive prices', () => {
    expect(
      formatValue({ amount: 15.5, currency: 'EUR' }, field('price'), t, {})
    ).toBe('€15.50');
    const cell = show(
      formatValue(
        { amount: 20, currency: 'EUR', discountPercent: 15 },
        field('price'),
        t,
        {}
      )
    );
    expect(cell.textContent).not.toContain('VAT incl.');
  });

  it('shows the amount only in a list cell (VAT note in the column title)', () => {
    const result = formatValue({ amount: 15.5, currency: 'EUR' }, price, t, {
      compact: true,
      locale: 'en',
    });
    expect(result).toBe('€15.50');
  });

  it('shows a discount as the effective amount and a -15% badge, on one line', () => {
    const cell = show(
      formatValue({ amount: 20, currency: 'EUR', discountPercent: 15 }, price, t, {
        compact: true,
        locale: 'en',
      })
    );
    expect(cell.textContent).toBe('€17.00-15%');
    expect(cell.querySelector('s')).toBeNull();
  });

  it('strikes the former price through on the detail view, with the VAT note', () => {
    const cell = show(
      formatValue({ amount: 20, currency: 'EUR', discountPercent: 15 }, price, t, {
        locale: 'fr',
      })
    );
    expect(cell.querySelector('s')?.textContent?.replace(/\s/g, ' ')).toBe('20,00 €');
    expect(cell.textContent).toContain('VAT incl.');
  });

  it('keeps the VAT note in the detail text without a discount', () => {
    expect(
      formatValue({ amount: 15.5, currency: 'EUR' }, price, t, { locale: 'en' })
    ).toBe('€15.50 VAT incl.');
  });
});

describe('boolean display', () => {
  it('shows a check icon for true in a list cell', () => {
    const cell = show(formatValue(true, field('boolean'), t, { compact: true }));
    expect(screen.getByRole('img', { name: 'Yes' })).toBeTruthy();
    expect(cell.textContent).toBe('');
  });

  it('shows nothing visible for false in a list cell (screen readers read No)', () => {
    const cell = show(formatValue(false, field('checkbox'), t, { compact: true }));
    expect(cell.querySelector('svg')).toBeNull();
    expect(cell.textContent).toBe('No');
  });

  it('shows the translated Yes / No on the detail view and as text', () => {
    expect(formatValue(true, field('boolean'), t, {})).toBe('Yes');
    expect(formatValue(false, field('switch'), t, {})).toBe('No');
    expect(formatValue(true, field('boolean'), t, { compact: true, asString: true })).toBe(
      'Yes'
    );
  });
});

describe('select display', () => {
  const status = field('select', {
    validation: {
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'deleted', label: 'Deleted' },
        { value: 'shipped', label: 'Shipped', variant: 'warning' },
        { value: 'reserved', label: 'Reserved' },
      ],
    },
  } as Partial<EntityField>);

  const badgeOf = (value: string) => {
    const cell = show(formatValue(value, status, t, { compact: true }));
    return cell.querySelector('[data-variant]');
  };

  it('renders built-in statuses as coloured badges', () => {
    expect(badgeOf('draft')?.getAttribute('data-variant')).toBe('muted');
    cleanup();
    expect(badgeOf('published')?.getAttribute('data-variant')).toBe('success');
    cleanup();
    expect(badgeOf('deleted')?.getAttribute('data-variant')).toBe('destructive');
  });

  it('uses the option\'s own variant', () => {
    const badge = badgeOf('shipped');
    expect(badge?.getAttribute('data-variant')).toBe('warning');
    expect(badge?.textContent).toBe('Shipped');
  });

  it('keeps unknown values as plain text, and text when asked for a string', () => {
    expect(formatValue('reserved', status, t, { compact: true })).toBe('Reserved');
    expect(formatValue('draft', status, t, { asString: true })).toBe('Draft');
  });
});

describe('image display', () => {
  const image = field('image', { label: 'Photo' });
  const picture = { fullUrl: 'https://cdn.test/full.webp', thumbUrl: 'https://cdn.test/thumb.webp' };

  it('shows the thumbnail of a Picture in a list cell', () => {
    const cell = show(formatValue(picture, image, t, { compact: true }));
    const img = cell.querySelector('img');
    expect(img?.getAttribute('src')).toBe(picture.thumbUrl);
    expect(img?.getAttribute('alt')).toBe('Photo');
  });

  it('shows the full image pair of a Picture on the detail view', () => {
    const cell = show(formatValue(picture, image, t, {}));
    expect(cell.querySelector('img')?.getAttribute('src')).toBe(picture.fullUrl);
    expect(cell.querySelector('source')?.getAttribute('srcset')).toBe(picture.thumbUrl);
  });

  it('still accepts a URL string', () => {
    const cell = show(formatValue('https://cdn.test/a.webp', image, t, { compact: true }));
    expect(cell.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/a.webp');
  });

  it('shows a neutral tile for an empty image in a list cell, a dash on detail', () => {
    const tile = show(formatValue(null, image, t, { compact: true }));
    expect(tile.querySelector('[data-image-placeholder]')).toBeTruthy();
    expect(tile.textContent).toBe('');
    cleanup();
    const pictureless = show(formatValue({}, image, t, { compact: true }));
    expect(pictureless.querySelector('[data-image-placeholder]')).toBeTruthy();
    cleanup();
    expect(show(formatValue(null, image, t, {})).textContent).toBe('—');
  });
});
