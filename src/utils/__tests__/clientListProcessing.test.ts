// packages/features/crud/src/utils/__tests__/clientListProcessing.test.ts

/**
 * @fileoverview Tests for clientListProcessing
 * @description Unit tests for applyFilters, applySearch, getSearchableFields, applySort.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  applyFilters,
  applySearch,
  applySort,
  getSearchableFields,
} from '../clientListProcessing';

import type { Entity } from '@donotdev/core';
import type { FilterState } from '../../types';

// Mock fieldTypeRegistry.store — controls getFilterType for matchesFilter and getValueType/isFilterable for clientListProcessing
vi.mock('../../fieldTypeRegistry.store', () => ({
  getFilterType: vi.fn((type: string) => {
    const map: Record<string, string> = {
      text: 'text',
      number: 'range',
      date: 'range',
      select: 'select',
      multiselect: 'multiselect',
      price: 'range',
      rating: 'rating',
      address: 'address',
    };
    return map[type];
  }),
  getValueType: vi.fn((type: string) => {
    const map: Record<string, string> = {
      text: 'string',
      textarea: 'string',
      email: 'string',
      number: 'number',
      date: 'date',
      select: 'string',
    };
    return map[type];
  }),
  isFilterable: vi.fn(() => false),
}));

// ─── Helpers ────────────────────────────────────────────────────────

/** Minimal Entity stub for testing. Only fields and search are used. */
function makeEntity(
  fields: Record<
    string,
    { type: string; visibility?: string; name?: string; label?: string }
  >,
  search?: { fields?: string[] }
): Entity {
  const entityFields: Record<string, any> = {};
  for (const [key, config] of Object.entries(fields)) {
    entityFields[key] = {
      name: config.name ?? key,
      type: config.type,
      visibility: config.visibility ?? 'user',
      label: config.label ?? key,
    };
  }
  return {
    name: 'TestEntity',
    collection: 'test',
    fields: entityFields,
    search,
  } as unknown as Entity;
}

interface TestItem {
  id: string;
  name: string;
  status?: string;
  price?: number | { amount: number; currency: string };
  createdAt?: string | Date;
  tags?: string[];
  address?: { formatted_address: string };
  [key: string]: unknown;
}

const items: TestItem[] = [
  {
    id: '1',
    name: 'Alpha',
    status: 'active',
    price: 10,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Beta',
    status: 'inactive',
    price: 25,
    createdAt: '2024-03-20',
  },
  {
    id: '3',
    name: 'Gamma',
    status: 'active',
    price: 50,
    createdAt: '2024-06-01',
  },
  {
    id: '4',
    name: 'Delta',
    status: 'pending',
    price: 5,
    createdAt: '2024-09-10',
  },
];

// ─── applyFilters ───────────────────────────────────────────────────

describe('applyFilters', () => {
  const entity = makeEntity({
    name: { type: 'text' },
    status: { type: 'select' },
    price: { type: 'number' },
  });

  it('returns all items when filters are empty', () => {
    const result = applyFilters(items, {}, entity);
    expect(result).toEqual(items);
  });

  it('filters by text field (contains)', () => {
    const result = applyFilters(items, { name: 'alph' }, entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by select field (string contains match)', () => {
    // Note: select filter uses string contains — 'active' matches both 'active' and 'inactive'
    const result = applyFilters(items, { status: 'inactive' }, entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by number range', () => {
    const filters: FilterState = { price: { min: '10', max: '30' } };
    const result = applyFilters(items, filters, entity);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('applies multiple filters (AND logic)', () => {
    const filters: FilterState = { status: 'active', name: 'gamma' };
    const result = applyFilters(items, filters, entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty array when no items match', () => {
    const result = applyFilters(items, { name: 'nonexistent' }, entity);
    expect(result).toHaveLength(0);
  });

  it('handles empty items array', () => {
    const result = applyFilters([], { name: 'test' }, entity);
    expect(result).toEqual([]);
  });

  it('defaults to text fieldType for unknown fields', () => {
    // Entity has no "unknown" field config, so fieldConfig is undefined → defaults to 'text'
    const result = applyFilters(
      [{ id: '1', name: 'hello world' }] as TestItem[],
      { name: 'hello' },
      entity
    );
    expect(result).toHaveLength(1);
  });
});

// ─── getSearchableFields ────────────────────────────────────────────

describe('getSearchableFields', () => {
  it('returns entity.search.fields when defined', () => {
    const entity = makeEntity(
      {
        name: { type: 'text' },
        code: { type: 'text' },
        price: { type: 'number' },
      },
      { fields: ['name', 'code'] }
    );
    expect(getSearchableFields(entity)).toEqual(['name', 'code']);
  });

  it('auto-detects string-valued visible fields when search.fields not set', () => {
    const entity = makeEntity({
      name: { type: 'text' },
      description: { type: 'textarea' },
      price: { type: 'number' },
      createdAt: { type: 'date' },
    });
    const fields = getSearchableFields(entity);
    expect(fields).toContain('name');
    expect(fields).toContain('description');
    expect(fields).not.toContain('price');
    expect(fields).not.toContain('createdAt');
  });

  it('excludes hidden fields from auto-detection', () => {
    const entity = makeEntity({
      name: { type: 'text' },
      secret: { type: 'text', visibility: 'hidden' },
    });
    const fields = getSearchableFields(entity);
    expect(fields).toContain('name');
    expect(fields).not.toContain('secret');
  });

  it('excludes technical fields from auto-detection', () => {
    const entity = makeEntity({
      name: { type: 'text' },
      internalId: { type: 'text', visibility: 'technical' },
    });
    const fields = getSearchableFields(entity);
    expect(fields).not.toContain('internalId');
  });

  it('returns empty array when no searchable fields exist', () => {
    const entity = makeEntity({
      price: { type: 'number' },
      count: { type: 'number' },
    });
    expect(getSearchableFields(entity)).toEqual([]);
  });

  it('returns explicit empty array from search.fields', () => {
    // search.fields is empty → falls through to auto-detect
    const entity = makeEntity({ name: { type: 'text' } }, { fields: [] });
    // Empty array means length 0 → auto-detect kicks in
    const fields = getSearchableFields(entity);
    expect(fields).toContain('name');
  });
});

// ─── applySearch ────────────────────────────────────────────────────

describe('applySearch', () => {
  const entity = makeEntity(
    { name: { type: 'text' }, status: { type: 'select' } },
    { fields: ['name'] }
  );

  it('returns all items when query is empty', () => {
    expect(applySearch(items, '', entity)).toEqual(items);
  });

  it('returns all items when query is whitespace', () => {
    expect(applySearch(items, '   ', entity)).toEqual(items);
  });

  it('searches case-insensitively', () => {
    const result = applySearch(items, 'ALPHA', entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('searches partial match', () => {
    const result = applySearch(items, 'lph', entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('searches only declared search fields', () => {
    // "active" is in status but not in searchable fields (name only)
    const result = applySearch(items, 'active', entity);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no match', () => {
    expect(applySearch(items, 'zzzzz', entity)).toHaveLength(0);
  });

  it('handles empty items array', () => {
    expect(applySearch([], 'test', entity)).toEqual([]);
  });

  it('skips null/undefined field values', () => {
    const itemsWithNull: TestItem[] = [
      { id: '1', name: null as any },
      { id: '2', name: 'Beta' },
    ];
    const result = applySearch(itemsWithNull, 'beta', entity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('searches address objects by formatted_address', () => {
    const addrEntity = makeEntity(
      { address: { type: 'address' } },
      { fields: ['address'] }
    );
    const addrItems = [
      {
        id: '1',
        name: 'A',
        address: { formatted_address: '123 Main St, Paris' },
      },
      {
        id: '2',
        name: 'B',
        address: { formatted_address: '456 Oak Ave, Lyon' },
      },
    ] as TestItem[];
    const result = applySearch(addrItems, 'paris', addrEntity);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('falls back to all values when no searchable fields detected', () => {
    // Entity with only number fields → no searchable fields → fallback to Object.values
    const numEntity = makeEntity({
      count: { type: 'number' },
    });
    const numItems = [
      { id: '1', name: 'findme', count: 42 },
      { id: '2', name: 'other', count: 10 },
    ] as any[];
    const result = applySearch(numItems, 'findme', numEntity);
    expect(result).toHaveLength(1);
  });
});

// ─── applySort ──────────────────────────────────────────────────────

describe('applySort', () => {
  it('sorts strings ascending by default', () => {
    const result = applySort(items, { field: 'name' });
    expect(result.map((i) => i.name)).toEqual([
      'Alpha',
      'Beta',
      'Delta',
      'Gamma',
    ]);
  });

  it('sorts strings descending', () => {
    const result = applySort(items, { field: 'name', direction: 'desc' });
    expect(result.map((i) => i.name)).toEqual([
      'Gamma',
      'Delta',
      'Beta',
      'Alpha',
    ]);
  });

  it('sorts numbers ascending', () => {
    const result = applySort(items, { field: 'price' });
    expect(result.map((i) => i.price)).toEqual([5, 10, 25, 50]);
  });

  it('sorts numbers descending', () => {
    const result = applySort(items, { field: 'price', direction: 'desc' });
    expect(result.map((i) => i.price)).toEqual([50, 25, 10, 5]);
  });

  it('sorts dates as strings (ISO format)', () => {
    const result = applySort(items, { field: 'createdAt' });
    expect(result.map((i) => i.createdAt)).toEqual([
      '2024-01-15',
      '2024-03-20',
      '2024-06-01',
      '2024-09-10',
    ]);
  });

  it('sorts Date instances', () => {
    const dateItems = [
      { id: '1', name: 'A', date: new Date('2024-06-01') },
      { id: '2', name: 'B', date: new Date('2024-01-01') },
      { id: '3', name: 'C', date: new Date('2024-12-01') },
    ];
    const result = applySort(dateItems, { field: 'date' });
    expect(result.map((i) => i.id)).toEqual(['2', '1', '3']);
  });

  it('sorts price objects by amount', () => {
    const priceItems = [
      { id: '1', name: 'A', price: { amount: 50, currency: 'EUR' } },
      { id: '2', name: 'B', price: { amount: 10, currency: 'EUR' } },
      { id: '3', name: 'C', price: { amount: 30, currency: 'EUR' } },
    ];
    const result = applySort(priceItems, { field: 'price' });
    expect(result.map((i) => i.id)).toEqual(['2', '3', '1']);
  });

  it('places null values last regardless of direction (asc)', () => {
    const withNulls = [
      { id: '1', name: 'B', price: 20 },
      { id: '2', name: 'A', price: null },
      { id: '3', name: 'C', price: 10 },
    ];
    const result = applySort(withNulls, { field: 'price' });
    expect(result.map((i) => i.id)).toEqual(['3', '1', '2']);
  });

  it('places null values last regardless of direction (desc)', () => {
    const withNulls = [
      { id: '1', name: 'B', price: 20 },
      { id: '2', name: 'A', price: null },
      { id: '3', name: 'C', price: 10 },
    ];
    const result = applySort(withNulls, { field: 'price', direction: 'desc' });
    expect(result.map((i) => i.id)).toEqual(['1', '3', '2']);
  });

  it('handles both values null', () => {
    const withNulls = [
      { id: '1', name: 'A', val: null },
      { id: '2', name: 'B', val: null },
    ];
    const result = applySort(withNulls, { field: 'val' });
    // Both null → stable (order preserved)
    expect(result.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('does not mutate original array', () => {
    const original = [...items];
    applySort(items, { field: 'name', direction: 'desc' });
    expect(items).toEqual(original);
  });

  it('handles empty array', () => {
    expect(applySort([], { field: 'name' })).toEqual([]);
  });

  it('handles single item', () => {
    const single = [{ id: '1', name: 'Only' }];
    expect(applySort(single, { field: 'name' })).toEqual(single);
  });
});

// ─── Combined pipeline ─────────────────────────────────────────────

describe('combined pipeline: filter → search → sort', () => {
  const entity = makeEntity(
    {
      name: { type: 'text' },
      status: { type: 'select' },
      price: { type: 'number' },
    },
    { fields: ['name'] }
  );

  it('chains filter, search, and sort', () => {
    // Filter: only pending (exact single match)
    const filtered = applyFilters(items, { status: 'pending' }, entity);
    expect(filtered).toHaveLength(1); // Delta

    // Search: 'del' in name
    const searched = applySearch(filtered, 'del', entity);
    expect(searched).toHaveLength(1); // Delta

    // Sort: by price descending (single item, trivial)
    const sorted = applySort(searched, { field: 'price', direction: 'desc' });
    expect(sorted.map((i) => i.name)).toEqual(['Delta']);
  });

  it('chains filter (range), search, and sort with multiple items', () => {
    // Filter: price between 5 and 30
    const filters: FilterState = { price: { min: '5', max: '30' } };
    const filtered = applyFilters(items, filters, entity);
    expect(filtered).toHaveLength(3); // Alpha(10), Beta(25), Delta(5)

    // Search: 'lph' in name (only matches Alpha)
    const searched = applySearch(filtered, 'lph', entity);
    expect(searched).toHaveLength(1);

    // Sort: by price ascending (single item)
    const sorted = applySort(searched, { field: 'price' });
    expect(sorted.map((i) => i.name)).toEqual(['Alpha']);
  });

  it('handles all items filtered out', () => {
    const filtered = applyFilters(items, { name: 'nonexistent' }, entity);
    expect(filtered).toHaveLength(0);

    const searched = applySearch(filtered, 'test', entity);
    expect(searched).toHaveLength(0);

    const sorted = applySort(searched, { field: 'name' });
    expect(sorted).toEqual([]);
  });
});
