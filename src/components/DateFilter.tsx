'use client';
// packages/features/crud/src/components/DateFilter.tsx

/**
 * @fileoverview DateFilter Component
 * @description Simple date filter component using open-ended From/To range
 * Supports date field types (date, week, month) - date only, no time
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { X } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Calendar,
  FloatingLabel,
  Sheet,
  Text,
} from '@donotdev/components';
// patterns.css provides .dndev-inline-action-btn
import { formatDate } from '@donotdev/core';

export type DateFilterValue = { min?: string; max?: string }; // Range: min/max date strings (YYYY-MM-DD)

export interface DateFilterProps {
  /** Field label */
  label: string;
  /** Field type */
  fieldType: 'date' | 'week' | 'month';
  /** Current filter value (range format: { min?: string; max?: string }) */
  value?: DateFilterValue;
  /** Callback when filter value changes */
  onChange: (value: DateFilterValue | undefined) => void;
  /** Translation function for CRUD namespace */
  tCrud: (key: string, opts?: { defaultValue?: string }) => string;
  /** Current locale for date formatting */
  locale?: string;
}

/**
 * DateFilter - Simple date filter component
 * Uses open-ended From/To range which covers all use cases:
 * - From only: set min, leave max empty
 * - To only: set max, leave min empty
 * - Between: set both min and max
 * - Exact: set min = max (same date)
 */
export function DateFilter({
  label,
  fieldType,
  value,
  onChange,
  tCrud,
  locale = 'en',
}: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [activeRange, setActiveRange] = useState<'start' | 'end' | null>(null);

  // Parse current value - always range format
  const parsedValue = (() => {
    if (!value) {
      return { min: '', max: '' };
    }

    if (typeof value === 'object' && value !== null && 'min' in value) {
      return {
        min: value.min || '',
        max: value.max || '',
      };
    }

    return { min: '', max: '' };
  })();

  // Format date for display
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return formatDate(date, locale);
    } catch {
      return dateStr;
    }
  };

  // Get preset dates
  const getPresetDates = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yYear = yesterday.getFullYear();
    const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yDay = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tYear = tomorrow.getFullYear();
    const tMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tDay = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${tYear}-${tMonth}-${tDay}`;

    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const l7Year = last7Days.getFullYear();
    const l7Month = String(last7Days.getMonth() + 1).padStart(2, '0');
    const l7Day = String(last7Days.getDate()).padStart(2, '0');
    const last7DaysStr = `${l7Year}-${l7Month}-${l7Day}`;

    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);
    const l30Year = last30Days.getFullYear();
    const l30Month = String(last30Days.getMonth() + 1).padStart(2, '0');
    const l30Day = String(last30Days.getDate()).padStart(2, '0');
    const last30DaysStr = `${l30Year}-${l30Month}-${l30Day}`;

    const next7Days = new Date(today);
    next7Days.setDate(next7Days.getDate() + 7);
    const n7Year = next7Days.getFullYear();
    const n7Month = String(next7Days.getMonth() + 1).padStart(2, '0');
    const n7Day = String(next7Days.getDate()).padStart(2, '0');
    const next7DaysStr = `${n7Year}-${n7Month}-${n7Day}`;

    const next30Days = new Date(today);
    next30Days.setDate(next30Days.getDate() + 30);
    const n30Year = next30Days.getFullYear();
    const n30Month = String(next30Days.getMonth() + 1).padStart(2, '0');
    const n30Day = String(next30Days.getDate()).padStart(2, '0');
    const next30DaysStr = `${n30Year}-${n30Month}-${n30Day}`;

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const msYear = thisMonthStart.getFullYear();
    const msMonth = String(thisMonthStart.getMonth() + 1).padStart(2, '0');
    const msDay = String(thisMonthStart.getDate()).padStart(2, '0');
    const thisMonthStartStr = `${msYear}-${msMonth}-${msDay}`;

    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const meYear = thisMonthEnd.getFullYear();
    const meMonth = String(thisMonthEnd.getMonth() + 1).padStart(2, '0');
    const meDay = String(thisMonthEnd.getDate()).padStart(2, '0');
    const thisMonthEndStr = `${meYear}-${meMonth}-${meDay}`;

    return {
      today: todayStr,
      yesterday: yesterdayStr,
      tomorrow: tomorrowStr,
      last7Days: last7DaysStr,
      last30Days: last30DaysStr,
      next7Days: next7DaysStr,
      next30Days: next30DaysStr,
      thisMonthStart: thisMonthStartStr,
      thisMonthEnd: thisMonthEndStr,
    };
  };

  const current = parsedValue;
  const presets = getPresetDates();

  const hasValue = !!(current?.min || current?.max);

  // Render calendar sheet content for min or max
  const renderCalendarSheet = (range: 'start' | 'end') => {
    const isMin = range === 'start';
    const currentDate = isMin ? current?.min : current?.max;

    return (
      <div style={{ padding: 'var(--gap-md)' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--gap-md)',
          }}
        >
          {/* Preset buttons */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--gap-tight)',
            }}
          >
            {(isMin
              ? [
                  'today',
                  'yesterday',
                  'last7Days',
                  'last30Days',
                  'thisMonthStart',
                ]
              : ['today', 'tomorrow', 'next7Days', 'next30Days', 'thisMonthEnd']
            ).map((preset) => {
              const presetDate = presets[preset as keyof typeof presets];
              return (
                <Button
                  key={preset}
                  variant="outline"
                  onClick={() => {
                    onChange({
                      min: isMin ? presetDate : current?.min || '',
                      max: isMin ? current?.max || '' : presetDate,
                    });
                    setOpen(false);
                  }}
                >
                  {tCrud(`filter.${preset}`, { defaultValue: preset })}
                </Button>
              );
            })}
          </div>

          {/* Calendar */}
          <Calendar
            selected={
              currentDate ? new Date(currentDate + 'T00:00:00') : undefined
            }
            mode="single"
            onSelect={(date) => {
              if (!date) return;
              // Extract date components in local time to avoid timezone issues
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const dateStr = `${year}-${month}-${day}`;
              onChange({
                min: isMin ? dateStr : current?.min || '',
                max: isMin ? current?.max || '' : dateStr,
              });
              setOpen(false);
            }}
            defaultMonth={
              currentDate ? new Date(currentDate + 'T00:00:00') : new Date()
            }
          />

          {/* Clear button */}
          <Button
            variant="ghost"
            display="compact"
            onClick={() => {
              onChange({
                min: isMin ? '' : current?.min || '',
                max: isMin ? current?.max || '' : '',
              });
              setOpen(false);
            }}
          >
            {tCrud('filter.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
      </div>
    );
  };

  // Structure matching RangeInput: Min button - separator - Max button - Clear button
  const inputs = (
    <>
      <Sheet
        trigger={
          <Button
            variant="ghost"
            onClick={() => {
              setActiveRange('start');
              setOpen(true);
            }}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingInlineStart: 'var(--gap-md)',
              justifyContent: 'flex-start',
            }}
          >
            {current?.min ? (
              formatDisplayDate(current.min)
            ) : (
              <Text as="span" level="small" variant="muted">
                {tCrud('filter.min', { defaultValue: 'Min' })}
              </Text>
            )}
          </Button>
        }
        title={`${label} - ${tCrud('filter.min', { defaultValue: 'Min' })}`}
        open={open && activeRange === 'start'}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setActiveRange(null);
        }}
      >
        {renderCalendarSheet('start')}
      </Sheet>
      <Text
        level="small"
        variant="muted"
        className="dndev-range-input-separator"
      >
        –
      </Text>
      <Sheet
        trigger={
          <Button
            variant="ghost"
            onClick={() => {
              setActiveRange('end');
              setOpen(true);
            }}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingInlineStart: 'var(--gap-md)',
              justifyContent: 'flex-start',
            }}
          >
            {current?.max ? (
              formatDisplayDate(current.max)
            ) : (
              <Text as="span" level="small" variant="muted">
                {tCrud('filter.max', { defaultValue: 'Max' })}
              </Text>
            )}
          </Button>
        }
        title={`${label} - ${tCrud('filter.max', { defaultValue: 'Max' })}`}
        open={open && activeRange === 'end'}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setActiveRange(null);
        }}
      >
        {renderCalendarSheet('end')}
      </Sheet>
      <button
        type="button"
        className="dndev-inline-action-btn"
        onClick={() => {
          onChange(undefined);
        }}
        disabled={!hasValue}
        aria-label={tCrud('filter.clear', { defaultValue: 'Clear' })}
      >
        <X />
      </button>
    </>
  );

  // Wrap in FloatingLabel like RangeInput does
  if (label) {
    return (
      <FloatingLabel label={label}>
        <div className="dndev-range-input">{inputs}</div>
      </FloatingLabel>
    );
  }

  return <div className="dndev-range-input">{inputs}</div>;
}
