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
import type { AnyEntity } from '@donotdev/core';
import { useTranslation, handleError, formatDate, isFieldVisible } from '@donotdev/core';

import { DateFilter, type DateFilterValue } from './DateFilter';
import { YearFilter } from './YearFilter';

import { getFilterType, isFilterable } from '../fieldTypeRegistry';
import { translateFieldLabel, translateLabel } from '../forms/utils';
import { useCrudFilters } from '../hooks/useCrudFilters';
import { useCrudCardList } from '../useCrudCardList';
import { matchesFilter } from '../utils/matchesFilter';

import type { FilterState } from '../types';

// Re-export for backward compatibility
export { matchesFilter } from '../utils/matchesFilter';

/** Props for {@link EntityFilters}, auto-generates filter UI based on entity field types. */
export interface EntityFiltersProps<
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

  /** Override responsive grid columns. Default: [2, 4, 6, 8] for inline, 1 for sidebar. */
  cols?: GridCols;

  /** Optional: Data array to extract unique values and min/max from (if not provided, fetches automatically) */
  data?: T[];
  /** Current viewer role — defaults to 'guest'. Fields with visibility above this role are hidden. */
  viewerRole?: string;
}

/**

 * Entity Filters Component - Auto-generates filter UI based on entity field types

 *

 * Features:

 * - String/Select fields: Combobox with unique values

 * - Number fields: Min/Max inputs + Slider (2 rows)

 * - Date fields: Min/Max date pickers + shortcuts (2 rows)

 * - Filters wrap naturally with flex-wrap

 * - Clear individual filters or all filters

 */

export function EntityFilters<
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
}: EntityFiltersProps<T>) {
  const isSidebar = variant === 'sidebar';

  const { t: tCrud, i18n } = useTranslation('crud');

  // Entity + crud namespaces so translateLabel can resolve crud:status.* etc.
  const { t } = useTranslation(entity.namespace);

  // Get current locale for date formatting
  const locale = i18n?.language || 'en';

  // Fetch data automatically (self-contained like EntityFormRenderer/EntityDisplayRenderer)
  // If data prop is provided, use it (for cases where parent already has data)
  // Let TypeScript infer the type from useCrudCardList to ensure type safety
  const { data: fetchedData } = useCrudCardList(entity, {
    enabled: !dataProp, // Only fetch if data not provided
  });
  // Type assertion is safe: useCrudCardList returns items with id, and T extends Record<string, any> & { id: string }
  const data = (dataProp ?? (fetchedData?.items || [])) as T[];

  // Get filters from CrudStore (self-contained like EntityFormRenderer/EntityDisplayRenderer)
  const { filters, setFilters } = useCrudFilters({
    collection: entity.collection,
  });

  // Draft state for range text inputs — decoupled from store for debounced writes
  const [draftRanges, setDraftRanges] = useState<Record<string, { min: string; max: string }>>({});
  // Local slider positions for smooth drag — committed to store on pointer-up
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, [number, number]>>({});
  const rangeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup timers on unmount
  useEffect(() => () => { Object.values(rangeTimers.current).forEach(clearTimeout); }, []);

  // Debounced handler for RangeInput typing (250ms per field)
  const handleRangeInputChange = (fieldName: string, min: string, max: string) => {
    setDraftRanges((prev) => ({ ...prev, [fieldName]: { min, max } }));
    if (rangeTimers.current[fieldName]) clearTimeout(rangeTimers.current[fieldName]);
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
      if (!isFieldVisible(fieldConfig?.visibility ?? 'guest', viewerRole)) return false;
      return true;
    });
  }, [fieldsToFilter, entity.listFields, entity.fields, viewerRole]);

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

            return matchesFilter(itemValue, filterValue, fieldType);
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
      next[fieldName] = value as string[];
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

      const filterValue = filters[fieldName];

      const isRangeFilter =
        typeof filterValue === 'object' &&
        filterValue !== null &&
        'min' in filterValue;

      const rangeFilter = isRangeFilter
        ? (filterValue as { min?: string; max?: string })
        : { min: '', max: '' };
      const rangeGridSpanStyle = {
        gridColumn: isSidebar ? 'span 1' : 'span 2',
      };

      // Rating: clickable stars (click = min rating, click same = clear)
      if (filterType === 'rating') {
        const max = (fieldConfig.validation?.max as number) ?? 5;
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
              minPlaceholder={tCrud('filter.min', { defaultValue: 'Min' })}
              maxPlaceholder={tCrud('filter.max', { defaultValue: 'Max' })}
              minValue={draftRanges[fieldName]?.min ?? rangeFilter.min ?? ''}
              maxValue={draftRanges[fieldName]?.max ?? rangeFilter.max ?? ''}
              actualMin={sliderMin}
              actualMax={sliderMax}
              onChange={(min, max) => handleRangeInputChange(fieldName, min, max)}
              onClear={() => {
                setDraftRanges((prev) => { const n = { ...prev }; delete n[fieldName]; return n; });
                setSliderDrafts((prev) => { const n = { ...prev }; delete n[fieldName]; return n; });
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
                setSliderDrafts((prev) => ({ ...prev, [fieldName]: values as [number, number] }))
              }
              onValueCommit={(values) => {
                setDraftRanges((prev) => ({ ...prev, [fieldName]: { min: String(values[0]), max: String(values[1]) } }));
                handleFilterChange(fieldName, { min: String(values[0]), max: String(values[1]) });
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
              minYear={yearMinMax?.min ?? (fieldConfig.validation?.min as number | undefined)}
              maxYear={yearMinMax?.max ?? (fieldConfig.validation?.max as number | undefined)}
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
            const range = filterValue as { min?: string; max?: string };
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

      // String/Select: Combobox (1 row) with FloatingLabel

      // Get all options from entity definition

      const hasOptions =
        (isSelect || isMultiSelect) &&
        fieldConfig.validation &&
        'options' in fieldConfig.validation;

      const selectEntityOptions =
        hasOptions && fieldConfig.validation
          ? Array.isArray(fieldConfig.validation.options)
            ? fieldConfig.validation.options
            : typeof fieldConfig.validation.options === 'function'
              ? fieldConfig.validation.options()
              : []
          : [];

      // Get available values from pre-computed filtered data (excluding current field)

      const filteredDataExcludingField =
        filteredDataPerField[fieldName] || data;

      const availableValues = new Set<string>();

      const isAddress = filterType === 'address';

      filteredDataExcludingField.forEach((item) => {
        const val = item[fieldName];

        if (val !== null && val !== undefined) {
          if (
            isAddress &&
            typeof val === 'object' &&
            'formatted_address' in val
          ) {
            const addr = val as { formatted_address?: string };
            if (addr.formatted_address) {
              availableValues.add(String(addr.formatted_address));
            }
          } else {
            availableValues.add(String(val));
          }
        }
      });

      // Compute faceted counts per option value
      const valueCounts = new Map<string, number>();
      filteredDataExcludingField.forEach((item) => {
        const val = item[fieldName];
        if (val !== null && val !== undefined) {
          const key =
            isAddress && typeof val === 'object' && 'formatted_address' in val
              ? String(
                  (val as { formatted_address?: string }).formatted_address
                )
              : String(val);
          valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
        }
      });

      // Build options: show all from entity definition, disable ones not in filtered data

      // Sort: available (not disabled) first, then disabled, both alphabetically

      const options: Array<{
        value: string;

        label: string;

        disabled?: boolean;

        count?: number;
      }> = [
        {
          value: 'all',

          label: tCrud('filter.selectPlaceholder', { defaultValue: 'All' }),

          count: filteredDataExcludingField.length,
        },
      ];

      if (selectEntityOptions.length > 0) {
        // Separate available and disabled options

        const available: Array<{ value: string; label: string }> = [];

        const disabled: Array<{ value: string; label: string }> = [];

        selectEntityOptions.forEach(
          (opt: { value: string; label: string } | string) => {
            const value = typeof opt === 'string' ? opt : opt.value;

            const label = typeof opt === 'string' ? opt : opt.label;

            const isAvailable = availableValues.has(value);

            if (isAvailable) {
              available.push({ value, label });
            } else {
              disabled.push({ value, label });
            }
          }
        );

        // Sort each group alphabetically by label

        available.sort((a, b) => a.label.localeCompare(b.label));

        disabled.sort((a, b) => a.label.localeCompare(b.label));

        // Add available options first (not disabled) - translate labels

        available.forEach((opt) => {
          options.push({
            value: opt.value,

            label: translateLabel(opt.label, t),

            disabled: false,

            count: valueCounts.get(opt.value) ?? 0,
          });
        });

        // Then add disabled options - translate labels

        disabled.forEach((opt) => {
          options.push({
            value: opt.value,

            label: translateLabel(opt.label, t),

            disabled: true,

            count: 0,
          });
        });
      } else {
        // Fallback: use unique values from data (no entity options defined)

        Array.from(availableValues)

          .sort()

          .slice(0, 100) // Limit to 100 options

          .forEach((val) => {
            options.push({
              value: val,
              label: val,
              count: valueCounts.get(val) ?? 0,
            });
          });
      }

      // Multiselect: Combobox with multiple mode, array values
      if (isMultiSelect) {
        // Remove "all" option for multiselect - doesn't make sense with checkboxes
        const multiOptions = options.filter((o) => o.value !== 'all');
        const selectedValues = Array.isArray(filterValue) ? filterValue : [];

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
                const arr = Array.isArray(value) ? value : [value];
                handleFilterChange(fieldName, arr.length > 0 ? arr : undefined);
              }}
              options={multiOptions}
              placeholder={tCrud('filter.placeholder', {
                defaultValue: 'Filter...',
              })}
              multiple
              clearable
            />
          </div>
        );
      }

      // Single select / text: Combobox (1 row)
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

                value === 'all' || !value ? '' : String(value)
              );
            }}
            options={options}
            placeholder={tCrud('filter.placeholder', {
              defaultValue: 'Filter...',
            })}
            clearable
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
  ]);

  if (!filterElements || filterElements.length === 0) return null;

  // Filter out null elements

  const validFilterElements = filterElements.filter(Boolean);

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
        // String filter
        const displayValue =
          fieldConfig.validation && 'options' in fieldConfig.validation
            ? translateLabel(value, t)
            : value;
        pills.push(
          <Tag
            key={fieldName}
            size="sm"
            variant="outline"
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
              onRemove={() => {
                const next = value.filter((_, idx) => idx !== i);
                handleFilterChange(
                  fieldName,
                  next.length > 0 ? next : undefined
                );
              }}
            >
              {fieldLabel}: {translateLabel(v, t)}
            </Tag>
          );
        });
      } else if (typeof value === 'object' && 'min' in value) {
        // Range filter
        const range = value as { min?: string; max?: string };
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
              onRemove={() => handleFilterChange(fieldName, undefined)}
            >
              {fieldLabel}: {displayRange}
            </Tag>
          );
        }
      }
    });

    return pills.length > 0 ? pills : null;
  }, [filters, entity.fields, t, tCrud, hasActiveFilters]);

  const content = (
    <Stack direction="column" gap="tight">
      {/* Active filter tags */}
      {filterPills && (
        <Stack direction="row" gap="tight" style={{ flexWrap: 'wrap' }}>
          {filterPills}
        </Stack>
      )}

      <Grid cols={cols ?? (isSidebar ? 1 : [2, 4, 6, 8])}>
        {validFilterElements}

        <Button
          variant="outline"
          icon={<FilterX size={18} />}
          onClick={handleClearFilters}
          disabled={!hasActiveFilters}
          style={{
            gridColumn: '1 / -1',

            gridRow: 'span 1',
          }}
        >
          {tCrud('filter.clear', { defaultValue: 'Clear Filters' })}
        </Button>
      </Grid>
    </Stack>
  );

  if (isSidebar) {
    return <ScrollArea style={{ maxHeight: '100%' }}>{content}</ScrollArea>;
  }

  return content;
}
