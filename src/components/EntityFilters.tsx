'use client';
// packages/features/crud/src/components/EntityFilters.tsx

/**

 * @fileoverview Entity Filters Component

 * @description Standalone, reusable component for auto-generating entity filters.

 * Features: Auto-generates filters based on entity field types (string, number, date).

 *

 * @todo Server-side filtering: Currently only handles client-side filtering.

 * When server-side pagination is needed, we'll need:

 * - "Apply Filters" button to send filters to server

 * - "Clear Filters" to reset

 * - Draft state (filters don't apply until "Apply" is clicked)

 * - Update useCrudList to accept filters in options

 * - Update backend query to handle filter parameters

 *

 * @version 0.1.0

 * @since 0.0.1

 * @author AMBROISE PARK Consulting

 */

import { FilterX } from 'lucide-react';
import { useMemo, useState, useRef, useEffect } from 'react';

import {
  Button,
  Calendar,
  Combobox,
  Grid,
  Popover,
  Rating,
  RangeInput,
  ScrollArea,
  Slider,
  Stack,
  Tag,
  Text,
} from '@donotdev/components';
import type { GridCols } from '@donotdev/components';
import type { AnyEntity, EntityField } from '@donotdev/core';
import {
  useTranslation,
  handleError,
  formatDate,
  isFieldVisible,
} from '@donotdev/core';

import { DateFilter, type DateFilterValue } from './DateFilter';
import { YearFilter } from './YearFilter';
import { getFilterType, isFilterable } from '../fieldTypeRegistry';
import { translateFieldLabel, translateLabel } from '../forms/utils';
import { useCrudFilters } from '../hooks/useCrudFilters';
import { useReferenceResolver } from '../hooks/useReferenceResolver';
import type { FilterState } from '../types';
import { useCrudCardList } from '../useCrudCardList';
import { matchesFilter } from '../utils/matchesFilter';

// Re-export for backward compatibility
export { matchesFilter } from '../utils/matchesFilter';

/** Narrowest inline filter column: labels and values stay readable. */
const FILTER_TRACK_MIN = '14rem';

/** As many columns of at least {@link FILTER_TRACK_MIN} as fit, at most 2 (mobile, tablet). */
const FILTER_COLS_UP_TO_2 = `repeat(auto-fit, minmax(max(min(100%, ${FILTER_TRACK_MIN}), calc((100% - var(--gap-md)) / 2)), 1fr))`;

/** As many columns of at least {@link FILTER_TRACK_MIN} as fit (laptop, desktop). */
const FILTER_COLS_ALL = `repeat(auto-fit, minmax(min(100%, ${FILTER_TRACK_MIN}), 1fr))`;

/**
 * Inline filter columns: sized by the panel's width, so a select never gets
 * narrower than 14rem whatever the viewport and the sidebar take; `auto-fit`
 * collapses empty columns so the filters fill the row. Range filters span two tracks.
 */
const INLINE_FILTER_COLS: GridCols = [
  FILTER_COLS_UP_TO_2,
  FILTER_COLS_UP_TO_2,
  FILTER_COLS_ALL,
  FILTER_COLS_ALL,
];

/** Inline clear button: its own width beside the filters, the whole line once wrapped below them. */
const INLINE_CLEAR_BUTTON_STYLE = { flex: '1 1 auto' } as const;

/** Value of the single-select "any" option (never a stored option value). */
const ANY_OPTION_VALUE = '__dndev_filter_any__';

/** Option `{ value, label }` of a select / multiselect field (`validation.options`). */
type FieldOption = { value: string; label: string };

/** The field's declared options (`validation.options`, array or function). */
function declaredOptionsOf(fieldConfig: EntityField): FieldOption[] {
  const validation = fieldConfig.validation as
    | {
        options?:
          | ReadonlyArray<FieldOption | string>
          | (() => ReadonlyArray<FieldOption | string>);
      }
    | undefined;
  const raw =
    typeof validation?.options === 'function'
      ? validation.options()
      : (validation?.options ?? []);
  return raw.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );
}

/**
 * Stored values a row's field contributes to option counts: each item of an array
 * value, the formatted address of an address, else the value itself.
 */
function filterValuesOf(value: unknown, isAddress: boolean): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map(String);
  }
  if (isAddress && typeof value === 'object' && 'formatted_address' in value) {
    const address = (value as { formatted_address?: string })
      .formatted_address;
    return address ? [String(address)] : [];
  }
  return [String(value)];
}

/** Props for {@link EntityFilters}, auto-generates filter UI based on entity field types. */
export interface EntityFiltersProps<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: interface-typed records have no implicit index signature; Record<string, unknown> would reject them
  T extends Record<string, any> & { id: string } = Record<string, any> & {
    id: string;
  },
> {
  /** The entity definition */
  entity: AnyEntity;

  /** Optional: Specific fields to show filters for (defaults to all entity fields) */
  fieldsToFilter?: string[];

  /** Layout variant: 'inline' (multi-column grid) or 'sidebar' (single column stack) */
  variant?: 'inline' | 'sidebar';

  /**
   * Override grid columns. Default for inline: as many columns of at least 14rem
   * as the container fits (the filter panel's own width, not the viewport), at most
   * 2 below laptop; 1 for sidebar. Inline, the clear button sits beside the filters
   * when they all fit on one row, else on its own full-width line below.
   */
  cols?: GridCols;

  /** Optional: Data array to extract unique values and min/max from (if not provided, fetches automatically) */
  data?: T[];
  /** Current viewer role — defaults to 'guest'. Fields with visibility above this role are hidden. */
  viewerRole?: string;
  /**
   * Key of the filter state in CrudStore (read it with `useCrudFilters({ collection: filterKey })`).
   * Default: the entity's collection, shared with the lists of that collection.
   * Give a separate key to filters that must not affect them (e.g. a picker dialog).
   * @since 0.2.5
   */
  filterKey?: string;
  /**
   * Sync the filter state with the URL (`f_<field>` params). Default: on for the
   * entity's collection key, off with a `filterKey` (see `useCrudFilters` `urlSync`).
   * @since 0.3.0
   */
  urlSync?: boolean;
}

/**

 * Entity Filters Component - Auto-generates filter UI based on entity field types

 *

 * Features:

 * - Select/radio/multiselect/reference fields: multi-select Combobox (exact match,
 *   OR within the field; reference options labelled like list cells; a field's
 *   `filter.wildcard` value is never offered and matches every option)
 * - Text fields: Combobox with the unique values (substring match)

 * - Number fields: Min/Max inputs + Slider (2 rows)

 * - Date fields: Min/Max date pickers + shortcuts (2 rows)

 * - Filters wrap naturally with flex-wrap

 * - Clear individual filters (chips with option labels) or all filters
 * - URL sync of the entity collection's state (`urlSync`, CRUD.md "Filters")

 */

export function EntityFilters<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: interface-typed records have no implicit index signature; Record<string, unknown> would reject them
  T extends Record<string, any> & { id: string } = Record<string, any> & {
    id: string;
  },
>({
  entity,
  data: dataProp,
  fieldsToFilter,
  variant = 'inline',
  cols,
  viewerRole = 'guest',
  filterKey,
  urlSync,
}: EntityFiltersProps<T>) {
  const isSidebar = variant === 'sidebar';

  const { t: tCrud, i18n } = useTranslation('crud');

  // Entity + crud namespaces so translateLabel can resolve crud:status.* etc.
  const { t } = useTranslation([entity.namespace, 'crud']);

  // Get current locale for date formatting
  const locale = i18n?.language || 'en';

  // Fetch data automatically (self-contained like EntityFormRenderer/EntityDisplayRenderer)
  // If data prop is provided, use it (for cases where parent already has data)
  // Let TypeScript infer the type from useCrudCardList to ensure type safety
  const { data: fetchedData } = useCrudCardList(entity, {
    enabled: !dataProp, // Only fetch if data not provided
  });
  // why: fetched items are untyped entity records; T is the caller-declared row shape (useCrudCardList returns items with id)
  const data = (dataProp ?? (fetchedData?.items || [])) as T[];

  // Get filters from CrudStore (self-contained like EntityFormRenderer/EntityDisplayRenderer)
  const { filters, setFilters } = useCrudFilters({
    collection: filterKey ?? entity.collection,
    urlSync,
    entity,
  });

  // Draft state for range text inputs — decoupled from store for debounced writes
  const [draftRanges, setDraftRanges] = useState<
    Record<string, { min: string; max: string }>
  >({});
  // Local slider positions for smooth drag — committed to store on pointer-up
  const [sliderDrafts, setSliderDrafts] = useState<
    Record<string, [number, number]>
  >({});
  const rangeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup timers on unmount
  useEffect(
    () => () => {
      Object.values(rangeTimers.current).forEach(clearTimeout);
    },
    []
  );

  // Debounced handler for RangeInput typing (250ms per field)
  const handleRangeInputChange = (
    fieldName: string,
    min: string,
    max: string
  ) => {
    setDraftRanges((prev) => ({ ...prev, [fieldName]: { min, max } }));
    if (rangeTimers.current[fieldName])
      clearTimeout(rangeTimers.current[fieldName]);
    rangeTimers.current[fieldName] = setTimeout(() => {
      handleFilterChange(fieldName, { min, max });
    }, 250);
  };

  // Determine which fields to show filters for

  // Exclude non-filterable field types:

  // - File types: objects (Picture/FileAsset), not strings

  // - Complex objects: geopoint, map, array (need special filtering logic)

  // - UI-only: hidden, submit, reset (not real data fields)

  const fieldsToShow = useMemo(() => {
    const candidateFields =
      fieldsToFilter && fieldsToFilter.length > 0
        ? fieldsToFilter
        : entity.listFields || Object.keys(entity.fields);

    return candidateFields.filter((fieldName) => {
      const fieldConfig = entity.fields[fieldName];

      const fieldType = fieldConfig?.type || 'text';

      if (!isFilterable(fieldType)) return false;
      if (!isFieldVisible(fieldConfig?.visibility ?? 'guest', viewerRole))
        return false;
      return true;
    });
  }, [fieldsToFilter, entity.listFields, entity.fields, viewerRole]);

  // Reference filters: labels of the referenced documents (same lookup as list cells)
  const hasReferenceFilter = fieldsToShow.some(
    (fieldName) =>
      getFilterType(entity.fields[fieldName]?.type || 'text') === 'reference'
  );
  const referenceData = useReferenceResolver(entity, hasReferenceFilter);

  /**
   * Display label of a stored filter value: the translated option label (select,
   * multiselect), the referenced document's label (reference, raw id until resolved
   * or when the document is unknown, as in list cells), else the value.
   */
  const optionLabel = (fieldConfig: EntityField, value: string): string => {
    if (getFilterType(fieldConfig.type || 'text') === 'reference') {
      const collection = fieldConfig.validation?.reference;
      return (
        (typeof collection === 'string'
          ? referenceData[collection]?.[value]
          : undefined) ?? value
      );
    }
    const option = declaredOptionsOf(fieldConfig).find(
      (opt) => opt.value === value
    );
    return option ? translateLabel(option.label, t) : value;
  };

  // Pre-compute filtered datasets for each field (excluding that field from filters)

  // This memoizes the actual results, not just the function

  const filteredDataPerField = useMemo(() => {
    const result: Record<string, T[]> = {};

    fieldsToShow.forEach((fieldName) => {
      // Apply all filters except the current field

      const otherFilters = Object.fromEntries(
        Object.entries(filters).filter(([key]) => key !== fieldName)
      );

      if (Object.keys(otherFilters).length === 0) {
        result[fieldName] = data;

        return;
      }

      result[fieldName] = data.filter((item) => {
        return Object.entries(otherFilters).every(
          ([filterFieldName, filterValue]) => {
            const itemValue = item[filterFieldName];

            const fieldConfig = entity.fields[filterFieldName];

            const fieldType = fieldConfig?.type || 'text';

            return matchesFilter(
              itemValue,
              filterValue,
              fieldType,
              fieldConfig?.filter
            );
          }
        );
      });
    });

    return result;
  }, [data, filters, entity.fields, fieldsToShow]);

  // Compute min/max for ALL number/date fields ONCE

  const minMaxValues = useMemo(() => {
    const result: Record<
      string,
      { min: number; max: number } | { min: string; max: string }
    > = {};

    fieldsToShow.forEach((fieldName) => {
      const fieldConfig = entity.fields[fieldName];

      if (!fieldConfig) return;

      const fieldType = fieldConfig.type || 'text';

      const filterType = getFilterType(fieldType);

      if (!filterType) {
        // Skip this field instead of crashing - log warning

        handleError(
          new Error(
            `Field type "${fieldType}" not registered in field type registry`
          ),

          {
            userMessage: `Field type "${fieldType}" is missing from registry`,

            context: {
              fieldType,

              fieldName,

              operation: 'minmax_computation',

              fix: 'Add to registerBuiltinFieldTypes.ts or registerFieldType()',
            },

            severity: 'warning',
          }
        );

        return; // Skip this field
      }

      const isYear = filterType === 'range' && fieldType === 'year';

      const isDate =
        filterType === 'range' &&
        !isYear &&
        (fieldType === 'date' ||
          fieldType === 'datetime-local' ||
          fieldType === 'timestamp' ||
          fieldType === 'time' ||
          fieldType === 'week' ||
          fieldType === 'month');

      const isNumber = filterType === 'range' && !isDate && !isYear;

      const isPrice = fieldType === 'price';

      if (isNumber || isYear || isPrice) {
        // For numbers/price/year: get actual min/max from non-null values (price: use value.amount)

        const nums = data

          .map((item) => item[fieldName])

          .filter((val) => val !== null && val !== undefined && val !== '')

          .map((val) =>
            isPrice && typeof val === 'object' && val !== null
              ? Number((val as { amount?: number }).amount)
              : typeof val === 'number'
                ? val
                : Number(val)
          )

          .filter((n) => !isNaN(n));

        if (nums.length > 0) {
          result[fieldName] = {
            min: Math.min(...nums),

            max: Math.max(...nums),
          };
        }
      } else if (isDate) {
        // For dates: get actual min/max from non-null values only

        const dates = data

          .map((item) => item[fieldName])

          .filter((val) => val !== null && val !== undefined && val !== '')

          .map((v) => (v instanceof Date ? v : new Date(v as string)))

          .filter((d) => !isNaN(d.getTime()));

        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));

          const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

          const minStr = minDate.toISOString().split('T')[0]; // YYYY-MM-DD

          const maxStr = maxDate.toISOString().split('T')[0];

          result[fieldName] = {
            min: minStr || '',

            max: maxStr || '',
          };
        }
      }
    });

    return result;
  }, [data, entity.fields, fieldsToShow]);

  // Update filter value helper
  const handleFilterChange = (
    fieldName: string,
    value: string | { min?: string; max?: string } | string[] | undefined
  ) => {
    const next = { ...filters };

    if (!value || value === '') {
      delete next[fieldName];
    } else if (Array.isArray(value)) {
      next[fieldName] = value;
    } else if (typeof value === 'object' && 'min' in value) {
      // For range filters: delete if both min and max are empty
      const hasMin = value.min && value.min !== '';
      const hasMax = value.max && value.max !== '';

      if (!hasMin && !hasMax) {
        delete next[fieldName];
      } else {
        next[fieldName] = value;
      }
    } else {
      next[fieldName] = value;
    }

    setFilters(next);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({});
  };

  // Generate filter UI

  const filterElements = useMemo(() => {
    if (fieldsToShow.length === 0) return null;

    return fieldsToShow.map((fieldName) => {
      const fieldConfig = entity.fields[fieldName];

      if (!fieldConfig) return null;

      const label = translateFieldLabel(fieldName, fieldConfig, t);

      const fieldType = fieldConfig.type || 'text';

      const filterType = getFilterType(fieldType);

      if (!filterType) {
        // Skip this field instead of crashing - log warning

        handleError(
          new Error(
            `Field type "${fieldType}" not registered in field type registry`
          ),

          {
            userMessage: `Field type "${fieldType}" is missing from registry`,

            context: {
              fieldType,

              fieldName,

              operation: 'filter_ui_render',

              fix: 'Add to registerBuiltinFieldTypes.ts or registerFieldType()',
            },

            severity: 'warning',
          }
        );

        return null; // Skip rendering this filter
      }

      const isYear = filterType === 'range' && fieldType === 'year';

      const isDate =
        filterType === 'range' &&
        !isYear &&
        (fieldType === 'date' ||
          fieldType === 'datetime-local' ||
          fieldType === 'timestamp' ||
          fieldType === 'time' ||
          fieldType === 'week' ||
          fieldType === 'month');

      const isNumber = filterType === 'range' && !isDate && !isYear;

      const isSelect = filterType === 'select';

      const isMultiSelect = filterType === 'multiselect';

      const isReference = filterType === 'reference';

      const filterValue = filters[fieldName];

      const isRangeFilter =
        typeof filterValue === 'object' &&
        filterValue !== null &&
        'min' in filterValue;

      const rangeFilter = isRangeFilter
        ? (filterValue)
        : { min: '', max: '' };
      const rangeGridSpanStyle = {
        gridColumn: isSidebar ? 'span 1' : 'span 2',
      };

      // Rating: clickable stars (click = min rating, click same = clear)
      if (filterType === 'rating') {
        const max = fieldConfig.validation?.max ?? 5;
        const currentRating =
          typeof filterValue === 'string' && filterValue !== ''
            ? Number(filterValue)
            : 0;

        return (
          <div
            key={fieldName}
            style={{
              gridColumn: 'span 1',
              gridRow: 'span 1',
            }}
          >
            <Rating
              value={currentRating}
              max={max}
              aria-label={label}
              onChange={(value) => {
                handleFilterChange(
                  fieldName,
                  value === currentRating ? undefined : String(value)
                );
              }}
            />
          </div>
        );
      }

      // Number/Currency/Year: Min/Max inputs + Slider (2 rows)

      if (isNumber) {
        const minMax = minMaxValues[fieldName] as
          | { min: number; max: number }
          | undefined;

        const sliderMin = minMax?.min ?? 0;

        const sliderMax = minMax?.max ?? 100;

        const currentMin = rangeFilter.min
          ? Number(rangeFilter.min)
          : sliderMin;

        const currentMax = rangeFilter.max
          ? Number(rangeFilter.max)
          : sliderMax;

        return (
          <Stack key={fieldName} gap="tight" style={rangeGridSpanStyle}>
            {/* First row: Min/Max inputs */}

            <RangeInput
              type="number"
              label={label}
              minPlaceholder={tCrud('filter.min')}
              maxPlaceholder={tCrud('filter.max')}
              minValue={draftRanges[fieldName]?.min ?? rangeFilter.min ?? ''}
              maxValue={draftRanges[fieldName]?.max ?? rangeFilter.max ?? ''}
              actualMin={sliderMin}
              actualMax={sliderMax}
              onChange={(min, max) =>
                handleRangeInputChange(fieldName, min, max)
              }
              onClear={() => {
                setDraftRanges((prev) => {
                  const n = { ...prev };
                  delete n[fieldName];
                  return n;
                });
                setSliderDrafts((prev) => {
                  const n = { ...prev };
                  delete n[fieldName];
                  return n;
                });
                handleFilterChange(fieldName, undefined);
              }}
            />

            {/* Second row: Slider */}

            <Slider
              key={`${fieldName}-${rangeFilter.min ?? ''}-${rangeFilter.max ?? ''}`}
              value={sliderDrafts[fieldName] ?? [currentMin, currentMax]}
              min={sliderMin}
              max={sliderMax}
              step={1}
              onValueChange={(values) =>
                setSliderDrafts((prev) => ({
                  ...prev,
                  [fieldName]: values as [number, number],
                }))
              }
              onValueCommit={(values) => {
                setDraftRanges((prev) => ({
                  ...prev,
                  [fieldName]: {
                    min: String(values[0]),
                    max: String(values[1]),
                  },
                }));
                handleFilterChange(fieldName, {
                  min: String(values[0]),
                  max: String(values[1]),
                });
              }}
            />
          </Stack>
        );
      }

      // Year: dedicated year range filter with Combobox dropdowns
      if (isYear) {
        const yearMinMax = minMaxValues[fieldName] as
          | { min: number; max: number }
          | undefined;
        return (
          <div key={fieldName} style={rangeGridSpanStyle}>
            <YearFilter
              label={label}
              value={isRangeFilter ? rangeFilter : undefined}
              onChange={(newValue) => handleFilterChange(fieldName, newValue)}
              tCrud={tCrud}
              minYear={
                yearMinMax?.min ??
                fieldConfig.validation?.min
              }
              maxYear={
                yearMinMax?.max ??
                fieldConfig.validation?.max
              }
            />
          </div>
        );
      }

      // Date: DateFilter component (open-ended From/To range covers all use cases)
      // Note: datetime-local, timestamp, and time fields also use DateFilter (date part only)
      if (isDate) {
        // Map datetime field types to 'date' for DateFilter (we only filter by date, not time)
        const dateFilterFieldType: 'date' | 'week' | 'month' =
          fieldType === 'week' || fieldType === 'month'
            ? (fieldType as 'week' | 'month')
            : 'date';

        // Convert filter value to DateFilterValue format (always range format)
        // Extract date part only (ignore time if present in datetime fields)
        const dateFilterValue: DateFilterValue | undefined = (() => {
          if (!filterValue) return undefined;

          // Always expect range format: { min?: string; max?: string }
          if (typeof filterValue === 'object' && 'min' in filterValue) {
            const range = filterValue;
            return {
              min: range.min ? range.min.split('T')[0] || '' : '',
              max: range.max ? range.max.split('T')[0] || '' : '',
            };
          }

          // Fallback: treat string as single date (set both min and max to same value)
          if (typeof filterValue === 'string') {
            const dateOnly = filterValue.split('T')[0] || '';
            return { min: dateOnly, max: dateOnly };
          }

          return undefined;
        })();

        return (
          <div key={fieldName} style={rangeGridSpanStyle}>
            <DateFilter
              label={label}
              fieldType={dateFilterFieldType}
              value={dateFilterValue}
              locale={locale}
              onChange={(newValue) => {
                // Convert DateFilterValue back to filter format (always range)
                if (!newValue) {
                  handleFilterChange(fieldName, undefined);
                  return;
                }

                // Always range format - just pass date strings directly
                if (typeof newValue === 'object' && 'min' in newValue) {
                  handleFilterChange(fieldName, {
                    min: newValue.min || '',
                    max: newValue.max || '',
                  });
                }
              }}
              tCrud={tCrud}
            />
          </div>
        );
      }

      // String/Select/Reference: Combobox (1 row) with FloatingLabel

      // Declared options (select, multiselect); the wildcard is never a choice
      const wildcard = fieldConfig.filter?.wildcard;

      const selectEntityOptions =
        isSelect || isMultiSelect
          ? declaredOptionsOf(fieldConfig).filter(
              (opt) => opt.value !== wildcard
            )
          : [];

      // Faceted counts from the rows matching the other filters, per stored value
      // (array values: per item). A row holding the wildcard counts for every option.

      const filteredDataExcludingField =
        filteredDataPerField[fieldName] || data;

      const isAddress = filterType === 'address';

      const valueCounts = new Map<string, number>();

      let wildcardCount = 0;

      filteredDataExcludingField.forEach((item) => {
        const values = new Set(filterValuesOf(item[fieldName], isAddress));
        if (wildcard !== undefined && values.has(wildcard)) {
          wildcardCount += 1;
          return;
        }
        values.forEach((value) =>
          valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1)
        );
      });

      const countOf = (value: string) =>
        (valueCounts.get(value) ?? 0) + wildcardCount;

      // Build options: show all from entity definition, disable ones not in filtered data

      // Sort: available (not disabled) first, then disabled, both alphabetically

      const options: Array<{
        value: string;

        label: string;

        disabled?: boolean;

        count?: number;
      }> = [
        {
          value: ANY_OPTION_VALUE,

          label: tCrud('filter.selectPlaceholder'),

          count: filteredDataExcludingField.length,
        },
      ];

      if (selectEntityOptions.length > 0) {
        const translated = selectEntityOptions.map((opt) => ({
          value: opt.value,
          label: translateLabel(opt.label, t),
          count: countOf(opt.value),
        }));

        const byLabel = (a: { label: string }, b: { label: string }) =>
          a.label.localeCompare(b.label);

        // Available options first, then disabled ones, each sorted by label
        translated
          .filter((opt) => opt.count > 0)
          .sort(byLabel)
          .forEach((opt) => options.push({ ...opt, disabled: false }));

        translated
          .filter((opt) => opt.count === 0)
          .sort(byLabel)
          .forEach((opt) => options.push({ ...opt, disabled: true }));
      } else {
        // No declared options: the values present in the data (references: labelled)
        Array.from(valueCounts.keys())
          .filter((value) => value !== wildcard)
          .map((value) => ({
            value,
            label: isReference ? optionLabel(fieldConfig, value) : value,
            count: countOf(value),
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(0, 100) // Limit to 100 options
          .forEach((opt) => options.push(opt));
      }

      // Select / radio / multiselect / reference: several values (OR within the
      // field, exact per value); the state is an array. A string state (set by code)
      // reads as one selected value.
      if (isSelect || isMultiSelect || isReference) {
        // No "any" option: an empty selection is "any"
        const multiOptions = options.filter(
          (o) => o.value !== ANY_OPTION_VALUE
        );
        const selectedValues = Array.isArray(filterValue)
          ? filterValue
          : typeof filterValue === 'string' && filterValue !== ''
            ? [filterValue]
            : [];

        return (
          <div
            key={fieldName}
            style={{
              gridColumn: isSidebar ? 'span 1' : 'span 1',
              gridRow: 'span 1',
            }}
          >
            <Combobox
              label={label}
              value={selectedValues}
              onValueChange={(value) => {
                const arr = (Array.isArray(value) ? value : [value]).filter(
                  (v): v is string => typeof v === 'string' && v !== ''
                );
                handleFilterChange(fieldName, arr.length > 0 ? arr : undefined);
              }}
              options={multiOptions}
              placeholder={tCrud('filter.placeholder')}
              selectedLabel={tCrud('filters.selected', {
                count: selectedValues.length,
              })}
              multiple
              clearable
              clearLabel={tCrud('filter.clear')}
            />
          </div>
        );
      }

      // Text / address: one value among those in the data (substring match)
      return (
        <div
          key={fieldName}
          style={{
            gridColumn: isSidebar ? 'span 1' : 'span 1',
            gridRow: 'span 1',
          }}
        >
          <Combobox
            label={label}
            value={typeof filterValue === 'string' ? filterValue : undefined}
            onValueChange={(value) => {
              handleFilterChange(
                fieldName,

                value === ANY_OPTION_VALUE || !value ? '' : String(value)
              );
            }}
            options={options}
            placeholder={tCrud('filter.placeholder')}
            clearable
            clearLabel={tCrud('filter.clear')}
          />
        </div>
      );
    });
  }, [
    fieldsToShow,

    entity.fields,

    data,

    filters,

    t,

    tCrud,

    filteredDataPerField,

    referenceData,
  ]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  // Build active filter pills
  const filterPills = useMemo(() => {
    if (!hasActiveFilters) return null;

    const pills: React.ReactNode[] = [];

    Object.entries(filters).forEach(([fieldName, value]) => {
      const fieldConfig = entity.fields[fieldName];
      if (!fieldConfig) return;
      const fieldLabel = translateFieldLabel(fieldName, fieldConfig, t);

      if (typeof value === 'string') {
        // String filter: option / reference label, free text as typed
        const displayValue = optionLabel(fieldConfig, value);
        pills.push(
          <Tag
            key={fieldName}
            size="sm"
            variant="outline"
            removeLabel={tCrud('form.remove')}
            onRemove={() => handleFilterChange(fieldName, undefined)}
          >
            {fieldLabel}: {displayValue}
          </Tag>
        );
      } else if (Array.isArray(value)) {
        // Multi-select: one tag per value
        value.forEach((v, i) => {
          pills.push(
            <Tag
              key={`${fieldName}-${i}`}
              size="sm"
              variant="outline"
              removeLabel={tCrud('form.remove')}
              onRemove={() => {
                const next = value.filter((_, idx) => idx !== i);
                handleFilterChange(
                  fieldName,
                  next.length > 0 ? next : undefined
                );
              }}
            >
              {fieldLabel}: {optionLabel(fieldConfig, v)}
            </Tag>
          );
        });
      } else if (typeof value === 'object' && 'min' in value) {
        // Range filter
        const range = value;
        const parts: string[] = [];
        if (range.min) parts.push(range.min);
        if (range.max) parts.push(range.max);
        const displayRange = parts.join(' - ');
        if (displayRange) {
          pills.push(
            <Tag
              key={fieldName}
              size="sm"
              variant="outline"
              removeLabel={tCrud('form.remove')}
              onRemove={() => handleFilterChange(fieldName, undefined)}
            >
              {fieldLabel}: {displayRange}
            </Tag>
          );
        }
      }
    });

    return pills.length > 0 ? pills : null;
  }, [filters, entity.fields, t, tCrud, hasActiveFilters, referenceData]);

  // After every hook (rules of hooks): nothing to filter → nothing rendered
  if (!filterElements || filterElements.length === 0) return null;

  // Filter out null elements

  const validFilterElements = filterElements.filter(Boolean);

  const clearButton = (
    <Button
      variant="outline"
      icon={<FilterX size={18} />}
      onClick={handleClearFilters}
      disabled={!hasActiveFilters}
      style={isSidebar ? undefined : INLINE_CLEAR_BUTTON_STYLE}
    >
      {tCrud('filter.clear')}
    </Button>
  );

  // Inline: the clear button sits beside the filters while they all fit on one
  // row at FILTER_TRACK_MIN (grid basis = their tracks, range = 2), else wraps below
  // and takes the whole line. The grid's large grow factor keeps the button narrow.
  const filterTracks = fieldsToShow.reduce((tracks, fieldName) => {
    const fieldConfig = entity.fields[fieldName];
    if (!fieldConfig) return tracks;
    const filterType = getFilterType(fieldConfig.type || 'text');
    if (!filterType) return tracks;
    return tracks + (filterType === 'range' ? 2 : 1);
  }, 0);

  const content = (
    <Stack direction="column" gap="tight">
      {/* Active filter tags */}
      {filterPills && (
        <Stack direction="row" gap="tight" style={{ flexWrap: 'wrap' }}>
          {filterPills}
        </Stack>
      )}

      {isSidebar ? (
        <Stack direction="column" gap="medium">
          <Grid cols={cols ?? 1}>{validFilterElements}</Grid>
          {clearButton}
        </Stack>
      ) : (
        <Stack direction="row" wrap="wrap" align="end" gap="medium">
          <Grid
            cols={cols ?? INLINE_FILTER_COLS}
            style={{
              flex: `999 1 calc(${filterTracks} * ${FILTER_TRACK_MIN} + ${filterTracks - 1} * var(--gap-md))`,
            }}
          >
            {validFilterElements}
          </Grid>
          {clearButton}
        </Stack>
      )}
    </Stack>
  );

  if (isSidebar) {
    return <ScrollArea style={{ maxHeight: '100%' }}>{content}</ScrollArea>;
  }

  return content;
}
