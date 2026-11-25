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
  FieldMessage,
  Input,
  Stack,
  fieldMessageAria,
  isoToZonedWallTime,
  toZonedCalendarDate,
  useComponentLocale,
  zonedWallTimeToISO,
} from '@donotdev/components';

export interface DateFieldComponentProps {
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Stored value: an ISO instant (`datetime-local`), or the mode's calendar / wall value (`YYYY-MM-DD`, `YYYY-MM`, `HH:mm`, `YYYY-Www`); null when empty */
  value?: string | null;
  /** Change handler emitting the value in the same format, or null */
  onChange: (date: string | null) => void;
  /** Validation error (translated): shown in place of `helperText` (FieldMessage) */
  error?: string;
  /** Helper text under the field while there is no error */
  helperText?: string;
  /**
   * Input mode: "date", "datetime-local", "month", "time", or "week".
   * This controls both the input type and the formatting of the displayed value.
   */
  mode?: 'date' | 'datetime-local' | 'month' | 'time' | 'week';
  /** Whether the field is required */
  required?: boolean;
}

/** The ISO 8601 week (`YYYY-Www`) of a calendar date (`YYYY-MM-DD`). */
function isoWeekOf(calendarDate: string): string {
  const [year, month, day] = calendarDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  // The week's Thursday decides its year (ISO 8601: weeks start on Monday)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const weekYear = date.getUTCFullYear();
  const week = Math.ceil(
    ((date.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1) / 7
  );
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/** Stored formats of the native modes (the value schemas of `fieldSemantics`). */
const NATIVE_VALUE: Readonly<Record<'month' | 'time' | 'week', RegExp>> = {
  month: /^\d{4}-\d{2}$/,
  time: /^\d{2}:\d{2}(?::\d{2})?$/,
  week: /^\d{4}-W\d{2}$/,
};

/**
 * The native input value of a month / time / week field. Its stored value
 * (`YYYY-MM`, `HH:mm[:ss]`, `YYYY-Www`) as written, never shifted; a calendar date
 * (`YYYY-MM-DD`) as its month or week; an instant (ISO with time) as its month, time
 * or week in the app's zone (`timeZone`), as the date and date-time modes. `''` when
 * it is none of these.
 */
function nativeInputValue(
  value: string,
  mode: 'month' | 'time' | 'week',
  timeZone: string
): string {
  if (NATIVE_VALUE[mode].test(value)) return value;
  if (mode === 'time') {
    // A calendar date has no time of day
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? ''
      : isoToZonedWallTime(value, timeZone).slice(11, 16);
  }
  const calendarDate = toZonedCalendarDate(value, timeZone);
  if (calendarDate === '') return '';
  return mode === 'month' ? calendarDate.slice(0, 7) : isoWeekOf(calendarDate);
}

/**
 * DateFieldComponent renders a date (or related) input field. Values, as the app's time
 * zone rule (`i18n.timeZone`, ComponentLocale `timeZone`) says: a calendar or
 * wall-clock value (`date` `YYYY-MM-DD`, `month` `YYYY-MM`, `time` `HH:mm`, `week`
 * `YYYY-Www`) is shown and stored as written; a `datetime-local` value is an instant,
 * shown and picked as its wall time in the app's zone. A stored instant in a calendar
 * mode shows as its day, month, time or week in the app's zone.
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
  // The app's time zone (i18n.timeZone): date-times are shown and picked as wall times in it
  const { timeZone } = useComponentLocale();

  // Month / time / week (native input): the value is a calendar or wall-clock value
  // (`YYYY-MM`, `HH:mm`, `YYYY-Www`, the field's stored format), stored as written: no
  // instant, no zone
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value || null);
  };

  // DateTimePicker speaks wall time (YYYY-MM-DDTHH:MM); the stored value is an ISO
  // instant. Convert at this boundary in the app's zone (not the machine's): every
  // viewer sees and edits the same wall time.
  const handleDateTimeChange = (wall: string | null) => {
    onChange(wall ? zonedWallTimeToISO(wall, timeZone) : null);
  };

  // Date mode: use segmented DatePicker with calendar popover
  if (mode === 'date') {
    // A calendar date as is; a stored instant as its day in the app's zone ('' = none or invalid)
    const calendarDate = value ? toZonedCalendarDate(value, timeZone) : '';
    return (
      <Stack gap="tight">
        <DatePicker
          id={id}
          label={label}
          info={info}
          value={calendarDate === '' ? null : calendarDate}
          onChange={onChange}
          required={required}
          {...fieldMessageAria({
            id: `${id}-message`,
            error,
            helperText,
          })}
          data-variant={hasError ? 'destructive' : undefined}
        />
        <FieldMessage
          id={`${id}-message`}
          error={error}
          helperText={helperText}
        />
      </Stack>
    );
  }

  // Datetime-local mode: use segmented DateTimePicker with calendar popover
  if (mode === 'datetime-local') {
    return (
      <Stack gap="tight">
        <DateTimePicker
          id={id}
          label={label}
          info={info}
          value={value ? isoToZonedWallTime(value, timeZone) || null : null}
          onChange={handleDateTimeChange}
          required={required}
          {...fieldMessageAria({
            id: `${id}-message`,
            error,
            helperText,
          })}
          data-variant={hasError ? 'destructive' : undefined}
        />
        <FieldMessage
          id={`${id}-message`}
          error={error}
          helperText={helperText}
        />
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
        value={value ? nativeInputValue(value, mode, timeZone) : ''}
        onChange={handleChange}
        required={required}
        {...fieldMessageAria({
          id: `${id}-message`,
          error,
          helperText,
        })}
        data-variant={hasError ? 'destructive' : undefined}
        className="dndev-w-full"
        {...props}
      />
      <FieldMessage
        id={`${id}-message`}
        error={error}
        helperText={helperText}
      />
    </Stack>
  );
};

export default DateFieldComponent;
