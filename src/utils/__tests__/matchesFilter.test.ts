// packages/features/crud/src/utils/__tests__/matchesFilter.test.ts

/**
 * @fileoverview Tests for matchesFilter
 * @description Unit tests for pure filter matching across all field types.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { matchesFilter } from '../matchesFilter';

import type { FilterType } from '../../fieldTypeRegistry.types';

// Mock the registry - we control what getFilterType returns per test
vi.mock('../../fieldTypeRegistry.store', () => ({
  getFilterType: vi.fn(),
}));

import { getFilterType } from '../../fieldTypeRegistry.store';

const mockGetFilterType = vi.mocked(getFilterType);

/** Helper to set the filter type returned by the mock for the next calls */
function setFilterType(filterType: FilterType | undefined) {
  mockGetFilterType.mockReturnValue(filterType);
}

describe('matchesFilter', () => {
  beforeEach(() => {
    mockGetFilterType.mockReset();
  });

  // ─── Empty / falsy filter → pass everything ───────────────────────

  describe('empty filter', () => {
    it('returns true when filterValue is empty string', () => {
      expect(matchesFilter('anything', '' as any, 'text')).toBe(true);
    });

    it('returns true when filterValue is null', () => {
      expect(matchesFilter('anything', null as any, 'text')).toBe(true);
    });

    it('returns true when filterValue is undefined', () => {
      expect(matchesFilter('anything', undefined as any, 'text')).toBe(true);
    });
  });

  // ─── Text filters (default string contains) ──────────────────────

  describe('text filter (string contains)', () => {
    beforeEach(() => setFilterType('text'));

    it('matches when itemValue contains filterValue (case-insensitive)', () => {
      expect(matchesFilter('Hello World', 'hello', 'text')).toBe(true);
    });

    it('matches partial substring', () => {
      expect(matchesFilter('abcdef', 'cde', 'text')).toBe(true);
    });

    it('does not match when substring absent', () => {
      expect(matchesFilter('Hello', 'xyz', 'text')).toBe(false);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, 'hello', 'text')).toBe(false);
    });

    it('returns false for undefined itemValue', () => {
      expect(matchesFilter(undefined, 'hello', 'text')).toBe(false);
    });

    it('coerces non-string itemValue to string', () => {
      expect(matchesFilter(12345, '234', 'text')).toBe(true);
    });
  });

  // ─── Select filter (falls through to string contains) ────────────

  describe('select filter', () => {
    beforeEach(() => setFilterType('select'));

    it('matches exact value via string contains', () => {
      expect(matchesFilter('active', 'active', 'select')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matchesFilter('Active', 'active', 'select')).toBe(true);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, 'active', 'select')).toBe(false);
    });
  });

  // ─── Number range filters ────────────────────────────────────────

  describe('number range filter', () => {
    beforeEach(() => setFilterType('range'));

    it('matches value within min-max range', () => {
      expect(matchesFilter(42, { min: '10', max: '50' }, 'number')).toBe(true);
    });

    it('matches value equal to min', () => {
      expect(matchesFilter(10, { min: '10', max: '50' }, 'number')).toBe(true);
    });

    it('matches value equal to max', () => {
      expect(matchesFilter(50, { min: '10', max: '50' }, 'number')).toBe(true);
    });

    it('rejects value below min', () => {
      expect(matchesFilter(5, { min: '10', max: '50' }, 'number')).toBe(false);
    });

    it('rejects value above max', () => {
      expect(matchesFilter(55, { min: '10', max: '50' }, 'number')).toBe(false);
    });

    // Min only
    it('min only: includes values >= min', () => {
      expect(matchesFilter(100, { min: '10' }, 'number')).toBe(true);
    });

    it('min only: excludes null', () => {
      expect(matchesFilter(null, { min: '10' }, 'number')).toBe(false);
    });

    it('min only: excludes undefined', () => {
      expect(matchesFilter(undefined, { min: '10' }, 'number')).toBe(false);
    });

    // Max only (min key must exist but be empty for range branch to activate)
    it('max only: includes values <= max', () => {
      expect(matchesFilter(5, { min: '', max: '50' }, 'number')).toBe(true);
    });

    it('max only: includes null (null passes max-only)', () => {
      expect(matchesFilter(null, { min: '', max: '50' }, 'number')).toBe(true);
    });

    it('max only: includes undefined', () => {
      expect(matchesFilter(undefined, { min: '', max: '50' }, 'number')).toBe(
        true
      );
    });

    it('max only: excludes values above max', () => {
      expect(matchesFilter(100, { min: '', max: '50' }, 'number')).toBe(false);
    });

    // Both set: excludes null
    it('min+max: excludes null', () => {
      expect(matchesFilter(null, { min: '10', max: '50' }, 'number')).toBe(
        false
      );
    });

    // Neither set: passes through
    it('empty range object: returns true (no filter)', () => {
      expect(matchesFilter(42, { min: '', max: '' }, 'number')).toBe(true);
    });

    it('empty object without min key falls through to string filter', () => {
      // {} has no 'min' key, so it never enters the range branch
      // Falls to string comparison: String(42).includes(String({})) = '42'.includes('[object Object]') = false
      expect(matchesFilter(42, {} as any, 'number')).toBe(false);
    });

    // String coercion
    it('coerces string itemValue to number', () => {
      expect(matchesFilter('25', { min: '10', max: '50' }, 'number')).toBe(
        true
      );
    });

    it('rejects NaN itemValue', () => {
      expect(matchesFilter('abc', { min: '10', max: '50' }, 'number')).toBe(
        false
      );
    });
  });

  // ─── Price range filters ─────────────────────────────────────────

  describe('price range filter', () => {
    beforeEach(() => setFilterType('range'));

    it('matches price object by amount within range', () => {
      expect(
        matchesFilter(
          { amount: 25, currency: 'EUR' },
          { min: '10', max: '50' },
          'price'
        )
      ).toBe(true);
    });

    it('rejects price object with amount above max', () => {
      expect(
        matchesFilter(
          { amount: 100, currency: 'EUR' },
          { min: '10', max: '50' },
          'price'
        )
      ).toBe(false);
    });

    it('min only: excludes null price', () => {
      expect(matchesFilter(null, { min: '10' }, 'price')).toBe(false);
    });

    it('max only: includes null price', () => {
      expect(matchesFilter(null, { min: '', max: '50' }, 'price')).toBe(true);
    });
  });

  // ─── Date range filters (string format) ──────────────────────────

  describe('date range filter (string min/max)', () => {
    beforeEach(() => setFilterType('range'));

    it('matches date within range', () => {
      expect(
        matchesFilter(
          '2024-06-15',
          { min: '2024-01-01', max: '2024-12-31' },
          'date'
        )
      ).toBe(true);
    });

    it('rejects date before min', () => {
      expect(
        matchesFilter(
          '2023-06-15',
          { min: '2024-01-01', max: '2024-12-31' },
          'date'
        )
      ).toBe(false);
    });

    it('rejects date after max', () => {
      expect(
        matchesFilter(
          '2025-06-15',
          { min: '2024-01-01', max: '2024-12-31' },
          'date'
        )
      ).toBe(false);
    });

    it('min only: excludes null', () => {
      expect(matchesFilter(null, { min: '2024-01-01' }, 'date')).toBe(false);
    });

    it('max only: includes null', () => {
      expect(matchesFilter(null, { min: '', max: '2024-12-31' }, 'date')).toBe(
        true
      );
    });

    it('min+max: excludes null', () => {
      expect(
        matchesFilter(null, { min: '2024-01-01', max: '2024-12-31' }, 'date')
      ).toBe(false);
    });

    it('accepts Date instance', () => {
      expect(
        matchesFilter(
          new Date('2024-06-15'),
          { min: '2024-01-01', max: '2024-12-31' },
          'date'
        )
      ).toBe(true);
    });

    it('rejects invalid date string', () => {
      expect(
        matchesFilter(
          'not-a-date',
          { min: '2024-01-01', max: '2024-12-31' },
          'date'
        )
      ).toBe(false);
    });

    it('empty range returns true', () => {
      expect(matchesFilter('2024-06-15', { min: '', max: '' }, 'date')).toBe(
        true
      );
    });
  });

  // ─── Datetime range filters (object with date+time) ──────────────

  describe('datetime range filter (object min/max with time)', () => {
    beforeEach(() => setFilterType('range'));

    it('matches datetime within range (date only)', () => {
      expect(
        matchesFilter(
          '2024-06-15T10:00:00Z',
          {
            min: { date: '2024-01-01' },
            max: { date: '2024-12-31' },
          },
          'datetime-local'
        )
      ).toBe(true);
    });

    it('matches datetime with time precision', () => {
      expect(
        matchesFilter(
          '2024-06-15T14:30:00Z',
          {
            min: { date: '2024-06-15', time: '10:00' },
            max: { date: '2024-06-15', time: '18:00' },
          },
          'datetime-local'
        )
      ).toBe(true);
    });

    it('min only with datetime: excludes null', () => {
      expect(
        matchesFilter(null, { min: { date: '2024-01-01' } }, 'datetime-local')
      ).toBe(false);
    });

    it('max only with datetime: includes null', () => {
      expect(
        matchesFilter(
          null,
          { min: { date: '' }, max: { date: '2024-12-31' } },
          'datetime-local'
        )
      ).toBe(true);
    });

    it('works with timestamp fieldType', () => {
      expect(
        matchesFilter(
          '2024-06-15T10:00:00Z',
          {
            min: { date: '2024-01-01' },
            max: { date: '2024-12-31' },
          },
          'timestamp'
        )
      ).toBe(true);
    });

    it('empty datetime range returns true', () => {
      expect(
        matchesFilter(
          '2024-06-15',
          { min: { date: '' }, max: { date: '' } },
          'datetime-local'
        )
      ).toBe(true);
    });
  });

  // ─── Single date filter (exact match) ─────────────────────────────

  describe('single date filter (exact date object)', () => {
    beforeEach(() => setFilterType('range'));

    it('matches exact date', () => {
      expect(matchesFilter('2024-06-15', { date: '2024-06-15' }, 'date')).toBe(
        true
      );
    });

    it('does not match different date', () => {
      expect(matchesFilter('2024-06-16', { date: '2024-06-15' }, 'date')).toBe(
        false
      );
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, { date: '2024-06-15' }, 'date')).toBe(false);
    });

    it('returns true when filter date is empty', () => {
      expect(matchesFilter('2024-06-15', { date: '' }, 'date')).toBe(true);
    });

    it('works with Date instance as itemValue', () => {
      const d = new Date('2024-06-15T00:00:00Z');
      expect(matchesFilter(d, { date: '2024-06-15' }, 'date')).toBe(true);
    });

    it('matches datetime-local with time', () => {
      expect(
        matchesFilter(
          '2024-06-15T14:30:00Z',
          { date: '2024-06-15', time: '14:30' },
          'datetime-local'
        )
      ).toBe(true);
    });

    it('does not match datetime-local with wrong time', () => {
      expect(
        matchesFilter(
          '2024-06-15T14:30:00Z',
          { date: '2024-06-15', time: '10:00' },
          'datetime-local'
        )
      ).toBe(false);
    });

    it('returns false for non-date fieldType', () => {
      setFilterType('text');
      expect(matchesFilter('2024-06-15', { date: '2024-06-15' }, 'text')).toBe(
        false
      );
    });
  });

  // ─── Date array filter ────────────────────────────────────────────

  describe('date array filter', () => {
    beforeEach(() => setFilterType('range'));

    it('matches when itemValue date is in array', () => {
      expect(
        matchesFilter(
          '2024-06-15',
          [{ date: '2024-06-15' }, { date: '2024-07-01' }],
          'date'
        )
      ).toBe(true);
    });

    it('does not match when itemValue date not in array', () => {
      expect(
        matchesFilter(
          '2024-08-01',
          [{ date: '2024-06-15' }, { date: '2024-07-01' }],
          'date'
        )
      ).toBe(false);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, [{ date: '2024-06-15' }], 'date')).toBe(false);
    });

    it('returns true for empty array', () => {
      expect(matchesFilter('2024-06-15', [], 'date')).toBe(true);
    });

    it('handles string date array entries', () => {
      expect(
        matchesFilter(
          '2024-06-15',
          ['2024-06-15' as any, '2024-07-01' as any],
          'date'
        )
      ).toBe(true);
    });

    it('returns false for invalid date itemValue', () => {
      expect(
        matchesFilter('not-a-date', [{ date: '2024-06-15' }], 'date')
      ).toBe(false);
    });
  });

  // ─── Non-date array filter (select multiple) ─────────────────────

  describe('non-date array filter', () => {
    beforeEach(() => setFilterType('select'));

    it('matches when itemValue is one of the filter values', () => {
      expect(
        matchesFilter('active', ['active', 'pending'] as any, 'select')
      ).toBe(true);
    });

    it('does not match when itemValue not in array', () => {
      expect(
        matchesFilter('archived', ['active', 'pending'] as any, 'select')
      ).toBe(false);
    });

    it('returns true for empty array', () => {
      expect(matchesFilter('active', [], 'select')).toBe(true);
    });

    it('returns false for null itemValue', () => {
      // date-like object entries with null itemValue
      expect(
        matchesFilter(null, [{ date: '2024-06-15' }] as any, 'select')
      ).toBe(false);
    });
  });

  // ─── Rating filter ────────────────────────────────────────────────

  describe('rating filter', () => {
    beforeEach(() => setFilterType('rating'));

    it('matches value >= min rating', () => {
      expect(matchesFilter(4, '3', 'rating')).toBe(true);
    });

    it('matches value equal to min rating', () => {
      expect(matchesFilter(3, '3', 'rating')).toBe(true);
    });

    it('rejects value below min rating', () => {
      expect(matchesFilter(2, '3', 'rating')).toBe(false);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, '3', 'rating')).toBe(false);
    });

    it('returns false for undefined itemValue', () => {
      expect(matchesFilter(undefined, '3', 'rating')).toBe(false);
    });

    it('returns false for NaN filterValue', () => {
      expect(matchesFilter(4, 'abc', 'rating')).toBe(false);
    });

    it('coerces string itemValue to number', () => {
      expect(matchesFilter('5', '3', 'rating')).toBe(true);
    });
  });

  // ─── Address filter ───────────────────────────────────────────────

  describe('address filter', () => {
    beforeEach(() => setFilterType('address'));

    it('matches formatted_address containing filter string', () => {
      expect(
        matchesFilter(
          { formatted_address: '123 Main St, Paris' },
          'paris',
          'address'
        )
      ).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(
        matchesFilter({ formatted_address: 'PARIS' }, 'paris', 'address')
      ).toBe(true);
    });

    it('returns false for non-matching address', () => {
      expect(
        matchesFilter(
          { formatted_address: '123 Main St, Lyon' },
          'paris',
          'address'
        )
      ).toBe(false);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, 'paris', 'address')).toBe(false);
    });

    it('returns false for object without formatted_address', () => {
      expect(matchesFilter({ city: 'Paris' }, 'paris', 'address')).toBe(false);
    });
  });

  // ─── Multiselect filter ───────────────────────────────────────────

  describe('multiselect filter', () => {
    beforeEach(() => setFilterType('multiselect'));

    it('matches when any array item contains filter string', () => {
      expect(
        matchesFilter(['red', 'blue', 'green'], 'blue', 'multiselect')
      ).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matchesFilter(['Red', 'Blue'], 'blue', 'multiselect')).toBe(true);
    });

    it('matches partial substring within item', () => {
      expect(
        matchesFilter(['blueberry', 'cherry'], 'blue', 'multiselect')
      ).toBe(true);
    });

    it('returns false when no item matches', () => {
      expect(matchesFilter(['red', 'green'], 'blue', 'multiselect')).toBe(
        false
      );
    });

    it('returns false for empty array itemValue', () => {
      expect(matchesFilter([], 'blue', 'multiselect')).toBe(false);
    });

    it('returns false for non-array itemValue', () => {
      expect(matchesFilter('blue', 'blue', 'multiselect')).toBe(false);
    });

    it('returns false for null itemValue', () => {
      expect(matchesFilter(null, 'blue', 'multiselect')).toBe(false);
    });
  });

  // ─── Unknown field type ───────────────────────────────────────────

  describe('unknown field type (unregistered)', () => {
    beforeEach(() => setFilterType(undefined));

    it('returns true (passes through) for string filter', () => {
      expect(matchesFilter('anything', 'test', 'unknown-type')).toBe(true);
    });

    it('returns true for range filter on unregistered type', () => {
      expect(matchesFilter(42, { min: '10', max: '50' }, 'unknown-type')).toBe(
        true
      );
    });
  });

  // ─── Boolean field (falls to string contains) ────────────────────

  describe('boolean field (string contains fallback)', () => {
    beforeEach(() => setFilterType('text'));

    it('matches boolean true coerced to string', () => {
      expect(matchesFilter(true, 'true', 'checkbox')).toBe(true);
    });

    it('matches boolean false coerced to string', () => {
      expect(matchesFilter(false, 'false', 'checkbox')).toBe(true);
    });
  });
});
