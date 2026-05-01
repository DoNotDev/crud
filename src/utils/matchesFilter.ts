// packages/features/crud/src/utils/matchesFilter.ts

/**
 * @fileoverview Standalone filter matching utility
 * @description Pure function to check if an item value matches a filter value.
 * Extracted from EntityFilters.tsx for reuse in hooks and non-React contexts.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { getFilterType } from '../fieldTypeRegistry.store';

/**
 * Pure filter matching utility — checks if an item value matches a filter value.
 *
 * Supports all built-in field types: text (contains), number/price (range),
 * date/datetime (range), select (exact), multiselect (contains), address (formatted_address).
 *
 * Null/undefined handling for range filters:
 * - MIN only → exclude null/undefined
 * - MAX only → include null/undefined
 * - MIN + MAX → exclude null/undefined
 *
 * @param itemValue - The item's field value to test
 * @param filterValue - The filter criterion (string, range, date, array)
 * @param fieldType - Entity field type (e.g. 'text', 'number', 'date', 'price')
 * @returns true if item passes the filter
 *
 * @example
 * ```typescript
 * import { matchesFilter } from '@donotdev/crud';
 *
 * matchesFilter('hello world', 'hello', 'text'); // true (contains)
 * matchesFilter(42, { min: '10', max: '50' }, 'number'); // true (in range)
 * matchesFilter(null, { min: '10' }, 'number'); // false (null excluded)
 * ```
 */
export function matchesFilter(
  itemValue: any,

  filterValue:
    | string
    | { min?: string; max?: string }
    | string[]
    | { date: string; time?: string }
    | {
        min?: { date: string; time?: string };
        max?: { date: string; time?: string };
      }
    | { date: string; time?: string }[],

  fieldType: string
): boolean {
  if (!filterValue) return true;

  // Handle multiple date filter (array of dates)
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) return true;

    const filterType = getFilterType(fieldType);
    const isDate =
      filterType === 'range' &&
      (fieldType === 'date' ||
        fieldType === 'datetime-local' ||
        fieldType === 'timestamp');

    if (!isDate) {
      // For non-date arrays, check if itemValue is in the array
      return filterValue.some((fv) => {
        if (typeof fv === 'object' && 'date' in fv) {
          const dateStr = fv.date;
          if (itemValue == null) return false;
          const d = itemValue instanceof Date ? itemValue : new Date(itemValue);
          if (isNaN(d.getTime())) return false;
          return d.toISOString().split('T')[0] === dateStr;
        }
        return String(itemValue) === String(fv);
      });
    }

    // Date array: check if item's date matches any in the array
    if (itemValue == null) return false;
    const parsedDate =
      itemValue instanceof Date ? itemValue : new Date(itemValue);
    if (isNaN(parsedDate.getTime())) return false;
    const itemDateStr = parsedDate.toISOString().split('T')[0];

    return filterValue.some((fv) => {
      if (typeof fv === 'string') {
        return itemDateStr === fv;
      }
      if (typeof fv === 'object' && 'date' in fv) {
        return itemDateStr === fv.date;
      }
      return false;
    });
  }

  // Handle single date filter with time (datetime object)
  if (
    typeof filterValue === 'object' &&
    'date' in filterValue &&
    !('min' in filterValue) &&
    !Array.isArray(filterValue)
  ) {
    const filterType = getFilterType(fieldType);
    const isDate =
      filterType === 'range' &&
      (fieldType === 'date' ||
        fieldType === 'datetime-local' ||
        fieldType === 'timestamp');

    if (!isDate) return false;

    const filterDate = filterValue.date;
    if (!filterDate) return true;

    if (itemValue === null || itemValue === undefined) return false;

    const itemDateStr =
      itemValue instanceof Date
        ? itemValue.toISOString().split('T')[0]
        : new Date(itemValue).toISOString().split('T')[0];

    // For datetime fields, also check time if provided
    if (
      (fieldType === 'datetime-local' || fieldType === 'timestamp') &&
      filterValue.time
    ) {
      const itemTimeStr =
        itemValue instanceof Date
          ? itemValue.toISOString().slice(11, 16)
          : new Date(itemValue).toISOString().slice(11, 16);
      return itemDateStr === filterDate && itemTimeStr === filterValue.time;
    }

    return itemDateStr === filterDate;
  }

  // Handle range filters (min/max for numbers and dates)

  if (typeof filterValue === 'object' && 'min' in filterValue) {
    const filterType = getFilterType(fieldType);

    if (!filterType) {
      // Unknown field type — pass through rather than crashing the .filter() call chain.
      // Throwing inside Array.filter() kills the entire render; warn in dev only.
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[dndev] matchesFilter: field type "${fieldType}" not registered. Skipping filter.`
        );
      }
      return true;
    }

    const isDate =
      filterType === 'range' &&
      (fieldType === 'date' ||
        fieldType === 'datetime-local' ||
        fieldType === 'timestamp');

    const isNumber = filterType === 'range' && !isDate;

    const isPrice = fieldType === 'price';

    // Price field: filter by amount (value.amount)

    const numValueForRange =
      isPrice && itemValue != null && typeof itemValue === 'object'
        ? Number((itemValue as { amount?: number }).amount)
        : isNumber && itemValue != null
          ? typeof itemValue === 'number'
            ? itemValue
            : Number(itemValue)
          : NaN;

    if (isNumber || isPrice) {
      // Type guard: ensure this is a string range, not datetime range
      if (
        typeof filterValue.min === 'object' &&
        filterValue.min !== null &&
        'date' in filterValue.min
      ) {
        return false; // Datetime range objects don't apply to numbers
      }

      // Type assertion: for numbers, filterValue is always { min?: string; max?: string }
      const numRange = filterValue as { min?: string; max?: string };
      const hasMin = typeof numRange.min === 'string' && numRange.min !== '';
      const hasMax = typeof numRange.max === 'string' && numRange.max !== '';

      // If min is set but max is not: only show defined values >= min (exclude null/undefined)

      if (hasMin && !hasMax) {
        if (itemValue === null || itemValue === undefined) return false;

        if (isNaN(numValueForRange)) return false;

        return numValueForRange >= Number(numRange.min!);
      }

      // If max is set but min is not: show value <= max OR null/undefined

      if (!hasMin && hasMax) {
        if (itemValue === null || itemValue === undefined) return true;

        if (isNaN(numValueForRange)) return false;

        return numValueForRange <= Number(numRange.max!);
      }

      // If both are set: show min <= value <= max (exclude null/undefined)

      if (hasMin && hasMax) {
        if (itemValue === null || itemValue === undefined) return false;

        if (isNaN(numValueForRange)) return false;

        return (
          numValueForRange >= Number(numRange.min!) &&
          numValueForRange <= Number(numRange.max!)
        );
      }

      // If neither is set: no filter (shouldn't happen, but handle gracefully)

      return true;
    }

    if (isDate) {
      // Handle datetime range objects with time
      if (
        typeof filterValue.min === 'object' &&
        filterValue.min !== null &&
        'date' in filterValue.min &&
        !('min' in filterValue.min)
      ) {
        // Type assertion: this is a datetime range object
        const datetimeRange = filterValue as {
          min?: { date: string; time?: string };
          max?: { date: string; time?: string };
        };
        const minObj = datetimeRange.min as
          | { date: string; time?: string }
          | undefined;
        const maxObj = datetimeRange.max as
          | { date: string; time?: string }
          | undefined;

        const hasMin = minObj?.date && minObj.date !== '';
        const hasMax = maxObj?.date && maxObj.date !== '';

        if (hasMin && !hasMax) {
          if (itemValue === null || itemValue === undefined) return false;
          const dateValue =
            itemValue instanceof Date
              ? itemValue
              : new Date(itemValue as string);
          if (isNaN(dateValue.getTime())) return false;
          const minDate = new Date(
            minObj.date + (minObj.time ? `T${minObj.time}:00` : 'T00:00:00')
          );
          return dateValue >= minDate;
        }

        if (!hasMin && hasMax && maxObj) {
          if (itemValue === null || itemValue === undefined) return true;
          const dateValue =
            itemValue instanceof Date
              ? itemValue
              : new Date(itemValue as string);
          if (isNaN(dateValue.getTime())) return false;
          const maxDate = new Date(
            maxObj.date + (maxObj.time ? `T${maxObj.time}:00` : 'T23:59:59')
          );
          return dateValue <= maxDate;
        }

        if (hasMin && hasMax && maxObj) {
          if (itemValue === null || itemValue === undefined) return false;
          const dateValue =
            itemValue instanceof Date
              ? itemValue
              : new Date(itemValue as string);
          if (isNaN(dateValue.getTime())) return false;
          const minDate = new Date(
            minObj!.date + (minObj!.time ? `T${minObj!.time}:00` : 'T00:00:00')
          );
          const maxDate = new Date(
            maxObj!.date + (maxObj!.time ? `T${maxObj!.time}:00` : 'T23:59:59')
          );
          return dateValue >= minDate && dateValue <= maxDate;
        }

        return true;
      }

      // Handle string range (legacy format)
      // Type assertion: for date strings, filterValue is { min?: string; max?: string }
      const dateRange = filterValue as { min?: string; max?: string };
      const hasMin = typeof dateRange.min === 'string' && dateRange.min !== '';
      const hasMax = typeof dateRange.max === 'string' && dateRange.max !== '';

      // If min is set but max is not: only show defined dates >= min (exclude null/undefined)
      if (hasMin && !hasMax) {
        if (itemValue === null || itemValue === undefined) return false;
        const dateValue =
          itemValue instanceof Date ? itemValue : new Date(itemValue as string);
        if (isNaN(dateValue.getTime())) return false;
        return dateValue >= new Date(dateRange.min!);
      }

      // If max is set but min is not: show date <= max OR null/undefined (include null/undefined)
      if (!hasMin && hasMax) {
        if (itemValue === null || itemValue === undefined) return true;
        const dateValue =
          itemValue instanceof Date ? itemValue : new Date(itemValue as string);
        if (isNaN(dateValue.getTime())) return false;
        return dateValue <= new Date(dateRange.max!);
      }

      // If both are set: show min <= date <= max (exclude null/undefined)
      if (hasMin && hasMax) {
        if (itemValue === null || itemValue === undefined) return false;
        const dateValue =
          itemValue instanceof Date ? itemValue : new Date(itemValue as string);
        if (isNaN(dateValue.getTime())) return false;
        return (
          dateValue >= new Date(dateRange.min!) &&
          dateValue <= new Date(dateRange.max!)
        );
      }

      // If neither is set: no filter (shouldn't happen, but handle gracefully)
      return true;
    }
  }

  // Rating filter: simple "min and above" comparison
  if (
    typeof filterValue === 'string' &&
    getFilterType(fieldType) === 'rating'
  ) {
    if (itemValue === null || itemValue === undefined) return false;
    const minRating = Number(filterValue);
    const itemRating =
      typeof itemValue === 'number' ? itemValue : Number(itemValue);
    if (isNaN(minRating) || isNaN(itemRating)) return false;
    return itemRating >= minRating;
  }

  // Handle special field types

  const filterType = getFilterType(fieldType);

  if (!filterType) {
    // Same as above — unknown type passes through, never throws inside .filter().
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[dndev] matchesFilter: field type "${fieldType}" not registered. Skipping filter.`
      );
    }
    return true;
  }

  if (filterType === 'address') {
    // Address is stored as object with formatted_address string

    if (itemValue === null || itemValue === undefined) return false;

    if (typeof itemValue === 'object' && 'formatted_address' in itemValue) {
      return String(itemValue.formatted_address)
        .toLowerCase()

        .includes(String(filterValue).toLowerCase());
    }

    return false;
  }

  if (filterType === 'multiselect') {
    // Multiselect is stored as string array

    if (!Array.isArray(itemValue) || itemValue.length === 0) return false;

    const filterLower = String(filterValue).toLowerCase();

    return itemValue.some((val) =>
      String(val).toLowerCase().includes(filterLower)
    );
  }

  // Handle string filters (exact match or contains)

  // For string filters, null/undefined values are excluded

  if (itemValue === null || itemValue === undefined) return false;

  return String(itemValue)
    .toLowerCase()

    .includes(String(filterValue).toLowerCase());
}
