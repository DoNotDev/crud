// packages/features/crud/src/utils/clientListProcessing.ts

/**
 * @fileoverview Client-side list processing utilities
 * @description Pure functions for filtering, searching, and sorting entity items.
 * Used by useCrudList/useCrudCardList hooks and UI components.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { AnyEntity } from '@donotdev/core';

import { matchesFilter } from './matchesFilter';
import { getValueType, isFilterable } from '../fieldTypeRegistry.store';

import type { FilterState } from '../types';

/**
 * Sort configuration for client-side sorting.
 *
 * @example
 * ```typescript
 * const sort: ClientSortConfig = { field: 'price', direction: 'desc' };
 * ```
 */
export interface ClientSortConfig {
  field: string;
  direction?: 'asc' | 'desc';
}

/**
 * Client-side sort: field-based config or custom comparator function.
 *
 * @example
 * ```typescript
 * // Field-based
 * const sort: ClientSort = { field: 'price', direction: 'desc' };
 *
 * // Custom comparator (multi-key, status priority, etc.)
 * const sort: ClientSort<Apartment> = (a, b) =>
 *   STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
 *   || a.date.localeCompare(b.date);
 * ```
 */
export type ClientSort<T = Record<string, unknown>> =
  | ClientSortConfig
  | ((a: T, b: T) => number);

/**
 * Apply filter state to items using entity field type metadata.
 * Typically called automatically by `useCrudList`/`useCrudCardList` via `processed`.
 * Export available for advanced use cases (e.g. filtering outside React).
 *
 * @param items - Raw items array
 * @param filters - Current filter state from CrudStore
 * @param entity - Entity definition (for field type lookup)
 * @returns Filtered items
 *
 * @example
 * ```typescript
 * import { applyFilters } from '@donotdev/crud';
 * const filtered = applyFilters(items, { status: 'active' }, productEntity);
 * ```
 */
export function applyFilters<T extends Record<string, any>>(
  items: T[],
  filters: FilterState,
  entity: AnyEntity
): T[] {
  const filterEntries = Object.entries(filters);
  if (filterEntries.length === 0) return items;

  return items.filter((item) =>
    filterEntries.every(([fieldName, filterValue]) => {
      const fieldConfig = entity.fields[fieldName];
      const fieldType = fieldConfig?.type || 'text';
      return matchesFilter(item[fieldName], filterValue, fieldType);
    })
  );
}

/**
 * Returns the list of searchable field names for an entity.
 * Uses entity.search.fields if defined, otherwise auto-detects text-like visible fields.
 *
 * @param entity - Entity definition
 * @returns Array of field names to search
 */
export function getSearchableFields(entity: AnyEntity): string[] {
  // Explicit config takes priority
  if (entity.search?.fields && entity.search.fields.length > 0) {
    return entity.search.fields;
  }

  // Auto-detect: all visible text-like fields
  const textLikeValueTypes = new Set(['string']);
  const result: string[] = [];

  for (const [fieldName, fieldConfig] of Object.entries(entity.fields)) {
    // Skip hidden/technical fields
    if (
      fieldConfig.visibility === 'hidden' ||
      fieldConfig.visibility === 'technical'
    ) {
      continue;
    }
    const valueType = getValueType(fieldConfig.type);
    if (valueType && textLikeValueTypes.has(valueType)) {
      result.push(fieldName);
    }
  }

  return result;
}

/**
 * Apply search query to items.
 * Searches fields defined by `entity.search.fields` or auto-detected text-like visible fields.
 * Typically called automatically by `useCrudList`/`useCrudCardList` when `searchQuery` option is set.
 *
 * @param items - Items to search
 * @param query - Search query string (case-insensitive contains)
 * @param entity - Entity definition (for field config and search.fields lookup)
 * @returns Filtered items matching search
 *
 * @example
 * ```typescript
 * import { applySearch } from '@donotdev/crud';
 * const results = applySearch(items, 'bmw', carEntity);
 * ```
 */
export function applySearch<T extends Record<string, any>>(
  items: T[],
  query: string,
  entity: AnyEntity
): T[] {
  if (!query || query.trim() === '') return items;

  const searchLower = query.toLowerCase();
  const searchFields = getSearchableFields(entity);

  // Fallback: if no searchable fields found, search all values (original behavior)
  if (searchFields.length === 0) {
    return items.filter((item) =>
      Object.values(item).some((value) => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      })
    );
  }

  return items.filter((item) =>
    searchFields.some((fieldName) => {
      const value = item[fieldName];
      if (value === null || value === undefined) return false;

      // Handle address objects
      if (typeof value === 'object' && 'formatted_address' in value) {
        return String(value.formatted_address)
          .toLowerCase()
          .includes(searchLower);
      }

      return String(value).toLowerCase().includes(searchLower);
    })
  );
}

/**
 * Apply client-side sorting to items.
 * Accepts a field-based config or a custom comparator function.
 * Handles null/undefined values by sorting them last.
 * Supports number, string, Date, and price ({ amount }) comparisons.
 *
 * @param items - Items to sort
 * @param sort - Sort configuration (field + direction) or comparator function
 * @returns Sorted items (new array, original unchanged)
 *
 * @example
 * ```typescript
 * import { applySort } from '@donotdev/crud';
 * // Field-based
 * const sorted = applySort(items, { field: 'createdAt', direction: 'desc' });
 * // Custom comparator
 * const sorted = applySort(items, (a, b) => a.priority - b.priority);
 * ```
 */
export function applySort<T extends Record<string, any>>(
  items: T[],
  sort: ClientSort<T>
): T[] {
  if (typeof sort === 'function') {
    return [...items].sort(sort);
  }

  const { field, direction = 'asc' } = sort;
  const multiplier = direction === 'desc' ? -1 : 1;

  return [...items].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    // Nulls last regardless of direction
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    // Numeric comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }

    // Price comparison (by amount)
    if (
      typeof aVal === 'object' &&
      'amount' in aVal &&
      typeof bVal === 'object' &&
      'amount' in bVal
    ) {
      return ((aVal.amount as number) - (bVal.amount as number)) * multiplier;
    }

    // Date comparison
    if (aVal instanceof Date && bVal instanceof Date) {
      return (aVal.getTime() - bVal.getTime()) * multiplier;
    }

    // String comparison (default)
    return String(aVal).localeCompare(String(bVal)) * multiplier;
  });
}
