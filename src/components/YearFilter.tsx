'use client';
// packages/features/crud/src/components/YearFilter.tsx

/**
 * @fileoverview YearFilter Component
 * @description Year range filter using RangeInput with numeric bounds.
 *
 * @version 0.3.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { RangeInput } from '@donotdev/components';

export type YearFilterValue = { min?: string; max?: string };

export interface YearFilterProps {
  /** Field label */
  label: string;
  /** Current filter value */
  value?: YearFilterValue;
  /** Callback when filter value changes */
  onChange: (value: YearFilterValue | undefined) => void;
  /** Translation function for CRUD namespace */
  tCrud: (key: string, opts?: { defaultValue?: string }) => string;
  /** Minimum year (from entity validation.min) */
  minYear?: number;
  /** Maximum year (from entity validation.max) */
  maxYear?: number;
}

/**
 * YearFilter - Year range filter backed by RangeInput (type="number").
 * Matches every other numeric range filter in the framework.
 */
export function YearFilter({
  label,
  value,
  onChange,
  tCrud,
  minYear = 1900,
  maxYear = new Date().getFullYear() + 10,
}: YearFilterProps) {
  const current = value ?? { min: '', max: '' };

  return (
    <RangeInput
      type="number"
      label={label}
      min={minYear}
      max={maxYear}
      minPlaceholder={tCrud('filter.min', { defaultValue: 'Min' })}
      maxPlaceholder={tCrud('filter.max', { defaultValue: 'Max' })}
      minValue={current.min || ''}
      maxValue={current.max || ''}
      onChange={(min, max) => {
        const y1 = min.slice(0, 4);
        const y2 = max.slice(0, 4);
        const n1 = y1 ? Number(y1) : undefined;
        const n2 = y2 ? Number(y2) : undefined;
        if (n1 !== undefined && n2 !== undefined && n1 > n2) return;
        onChange(y1 || y2 ? { min: y1, max: y2 } : undefined);
      }}
      onClear={() => onChange(undefined)}
    />
  );
}
