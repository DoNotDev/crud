// packages/features/crud/src/components/form/fields/DateFieldComponent.tsx

/**
 * @fileoverview Date Field Component
 * @description Renders a date (or related) input field with a label, error indication, and helper text using Radix UI components. Form field component for date inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { ChangeEvent, ComponentType } from 'react';

import {
  DatePicker,
  DateTimePicker,
  Input,
  cn,
  Stack,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

export interface DateFieldComponentProps {
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Value as an ISO string or null */
  value?: string | null;
  /** Change handler emitting an ISO string or null */
  onChange: (date: string | null) => void;
  /** Error message (string = message to display, falsy = no error) */
  error?: string;
  /** Helper text to display */
  helperText?: string;
  /**
   * Input mode: "date", "datetime-local", "month", "time", or "week".
   * This controls both the input type and the formatting of the displayed value.
   */
  mode?: 'date' | 'datetime-local' | 'month' | 'time' | 'week';
  /** Whether the field is required */
  required?: boolean;
}

/** Date → local wall time `YYYY-MM-DDTHH:MM` (the DateTimePicker / datetime-local format). */
function toLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * DateFieldComponent renders a date (or related) input field
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const DateFieldComponent: ComponentType<DateFieldComponentProps> = ({
  label,
  info,
  value,
  onChange,
  error,
  helperText,
  mode = 'date',
  required,
  ...props
}) => {
  const id = useId();
  const hasError = !!error;
  const { t } = useTranslation('crud');

  // Handle input change: convert the native value to an ISO string (or null)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value
      ? new Date(event.target.value).toISOString()
      : null;
    onChange(newValue);
  };

  // DateTimePicker speaks local wall time (YYYY-MM-DDTHH:MM); the stored value is an
  // ISO instant. Convert at this boundary so the admin sees and edits local time.
  const handleDateTimeChange = (local: string | null) => {
    onChange(local ? new Date(local).toISOString() : null);
  };

  // Format the incoming ISO string for display in the input
  let displayValue = '';
  if (value) {
    const date = new Date(value);
    if (mode === 'date') {
      displayValue = date.toISOString().split('T')[0] || '';
    } else if (mode === 'datetime-local') {
      displayValue = toLocalDateTime(date);
    } else if (mode === 'month') {
      displayValue = date.toISOString().slice(0, 7);
    } else if (mode === 'time') {
      displayValue = date.toISOString().slice(11, 16);
    } else if (mode === 'week') {
      // Week input isn't natively supported by all browsers;
      // fallback to the date format (you may wish to enhance this).
      displayValue = date.toISOString().split('T')[0] || '';
    }
  }

  // Date mode: use segmented DatePicker with calendar popover
  if (mode === 'date') {
    return (
      <Stack gap="tight">
        <DatePicker
          id={id}
          calendarErrorLabel={t('date.calendarLoadError')}
          label={label}
          info={info}
          value={value ?? null}
          onChange={onChange}
          required={required}
          aria-describedby={cn(
            hasError && `${id}-error`,
            helperText && !hasError && `${id}-helper`
          )}
          aria-invalid={hasError}
          data-variant={hasError ? 'destructive' : undefined}
        />

        {/* Error Message */}
        {hasError && (
          <Stack
            id={`${id}-error`}
            direction="row"
            align="center"
            gap="tight"
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--destructive)',
            }}
            role="alert"
          >
            <span>⚠</span>
            {error}
          </Stack>
        )}

        {/* Helper Text */}
        {helperText && !hasError && (
          <p
            id={`${id}-helper`}
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--muted-foreground)',
            }}
          >
            {helperText}
          </p>
        )}
      </Stack>
    );
  }

  // Datetime-local mode: use segmented DateTimePicker with calendar popover
  if (mode === 'datetime-local') {
    return (
      <Stack gap="tight">
        <DateTimePicker
          id={id}
          calendarErrorLabel={t('date.calendarLoadError')}
          label={label}
          info={info}
          value={displayValue || null}
          onChange={handleDateTimeChange}
          required={required}
          aria-describedby={cn(
            hasError && `${id}-error`,
            helperText && !hasError && `${id}-helper`
          )}
          aria-invalid={hasError}
          data-variant={hasError ? 'destructive' : undefined}
        />

        {/* Error Message */}
        {hasError && (
          <Stack
            id={`${id}-error`}
            direction="row"
            align="center"
            gap="tight"
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--destructive)',
            }}
            role="alert"
          >
            <span>⚠</span>
            {error}
          </Stack>
        )}

        {/* Helper Text */}
        {helperText && !hasError && (
          <p
            id={`${id}-helper`}
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--muted-foreground)',
            }}
          >
            {helperText}
          </p>
        )}
      </Stack>
    );
  }

  // Other modes (time, month, week): native Input
  return (
    <Stack gap="tight">
      <Input
        id={id}
        label={label}
        info={info}
        type={mode}
        value={displayValue}
        onChange={handleChange}
        required={required}
        aria-describedby={cn(
          hasError && `${id}-error`,
          helperText && !hasError && `${id}-helper`
        )}
        aria-invalid={hasError}
        data-variant={hasError ? 'destructive' : undefined}
        className="dndev-w-full"
        {...props}
      />

      {/* Error Message */}
      {hasError && (
        <Stack
          id={`${id}-error`}
          direction="row"
          align="center"
          gap="tight"
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--destructive)',
          }}
          role="alert"
        >
          <span>⚠</span>
          {error}
        </Stack>
      )}

      {/* Helper Text */}
      {helperText && !hasError && (
        <p
          id={`${id}-helper`}
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default DateFieldComponent;
