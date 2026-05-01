'use client';
// packages/features/crud/src/hooks/useRelatedItems.ts

/**
 * @fileoverview useRelatedItems hook
 * @description Finds related items based on matching field values
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo } from 'react';

import type { AnyEntity } from '@donotdev/core';

/** Options for the {@link useRelatedItems} hook. */
export interface UseRelatedItemsOptions {
  /** Maximum number of related items to return (default: 3) */
  limit?: number;
  /** Tolerance for numeric field matching as percentage (default: 0.2 = 20%) */
  tolerance?: number;
}

/** Return type of the {@link useRelatedItems} hook. */
export interface UseRelatedItemsReturn<T> {
  /** Array of related items */
  items: T[];
  /** Whether any related items were found */
  hasItems: boolean;
}

/**
 * useRelatedItems - Finds related items based on matching field criteria
 *
 * Matching logic by field type:
 * - String/select fields: exact match
 * - Number fields: within ±tolerance% of current value
 *
 * Items are matched if they satisfy ANY of the specified fields (OR logic).
 * Current item is automatically excluded.
 *
 * @example
 * ```tsx
 * const { items: relatedCars } = useRelatedItems(
 *   carEntity,
 *   currentCar,
 *   allCars,
 *   ['make', 'price'],
 *   { limit: 3, tolerance: 0.2 }
 * );
 * ```
 */
export function useRelatedItems<T extends Record<string, unknown>>(
  entity: AnyEntity,
  currentItem: T | null | undefined,
  allItems: T[] | null | undefined,
  matchFields: string[],
  options: UseRelatedItemsOptions = {}
): UseRelatedItemsReturn<T> {
  const { limit = 3, tolerance = 0.2 } = options;

  const items = useMemo(() => {
    if (
      !currentItem ||
      !allItems ||
      allItems.length === 0 ||
      matchFields.length === 0
    ) {
      return [];
    }

    const currentId = currentItem.id;

    return allItems
      .filter((item) => {
        // Exclude current item
        if (item.id === currentId) return false;

        // Check if item matches any of the specified fields
        return matchFields.some((fieldName) => {
          const fieldConfig = entity.fields[fieldName];
          if (!fieldConfig) return false;

          const currentValue = currentItem[fieldName];
          const itemValue = item[fieldName];

          // Skip if either value is null/undefined
          if (currentValue == null || itemValue == null) return false;

          // Number fields: match within tolerance range
          if (
            fieldConfig.type === 'number' ||
            fieldConfig.type === 'range' ||
            fieldConfig.type === 'year'
          ) {
            const numCurrent = Number(currentValue);
            const numItem = Number(itemValue);
            if (isNaN(numCurrent) || isNaN(numItem)) return false;

            const range = Math.abs(numCurrent * tolerance);
            return Math.abs(numItem - numCurrent) <= range;
          }

          // String/select fields: exact match
          return String(currentValue) === String(itemValue);
        });
      })
      .slice(0, limit);
  }, [currentItem, allItems, matchFields, entity.fields, limit, tolerance]);

  return {
    items,
    hasItems: items.length > 0,
  };
}
