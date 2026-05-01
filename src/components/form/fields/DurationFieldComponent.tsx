// packages/features/crud/src/components/form/fields/DurationFieldComponent.tsx

/**
 * @fileoverview Duration Field Component
 * @description Form field for duration in minutes. Preset chips (30m, 1h, 1h30, etc.)
 * plus Custom option with slider. Stores and returns number (minutes).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Clock } from 'lucide-react';
import { useState, useMemo } from 'react';

import { Label, Stack, Button, Slider } from '@donotdev/components';

import type { ComponentType } from 'react';

/** Preset durations in minutes */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180] as const;

export interface DurationFieldComponentProps {
  /** Label for the field */
  label: string;
  /** Current value in minutes */
  value?: number;
  /** Change handler (minutes) */
  onChange: (value: number) => void;
  /** Whether the field is in error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Read-only mode (display only) */
  readonly?: boolean;
  /** Min minutes for custom slider (default 0) */
  min?: number;
  /** Max minutes for custom slider (default 480 = 8h) */
  max?: number;
  /** Step for custom slider (default 5) */
  step?: number;
  /**
   * Translation function for preset labels (e.g. t('crud:duration.30m')).
   * Receives i18n key; return value is the chip label.
   */
  t?: (key: string, options?: Record<string, unknown>) => string;
}

const PRESET_I18N_KEYS: Record<number, string> = {
  15: 'duration.15m',
  30: 'duration.30m',
  45: 'duration.45m',
  60: 'duration.1h',
  90: 'duration.1h30',
  120: 'duration.2h',
  150: 'duration.2h30',
  180: 'duration.3h',
};

function formatPresetLabel(
  minutes: number,
  t: ((k: string, o?: Record<string, unknown>) => string) | undefined
): string {
  const fallback =
    minutes < 60
      ? `${minutes}m`
      : minutes % 60 === 0
        ? `${minutes / 60}h`
        : `${Math.floor(minutes / 60)}h${minutes % 60}`;
  const key = PRESET_I18N_KEYS[minutes as keyof typeof PRESET_I18N_KEYS];
  if (!t || !key) return fallback;
  return t(`crud:${key}`, { defaultValue: fallback }) ?? fallback;
}

/**
 * DurationFieldComponent - Preset chips + Custom slider for duration (minutes)
 *
 * Used by the built-in entity field type `duration`.
 *
 * @see Entity field type: `duration` (registered in registerBuiltinFieldTypes)
 */
const DurationFieldComponent: ComponentType<DurationFieldComponentProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  disabled,
  required,
  readonly,
  min = 0,
  max = 480,
  step = 5,
  t,
}) => {
  const numericValue =
    typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const isPreset = (DURATION_PRESETS as readonly number[]).includes(
    numericValue
  );
  const [showCustom, setShowCustom] = useState(!isPreset && numericValue > 0);

  const presetLabels = useMemo(
    () =>
      DURATION_PRESETS.map((mins) => ({
        minutes: mins,
        label: formatPresetLabel(mins, t),
      })),
    [t]
  );

  const customLabel = t
    ? t('crud:duration.custom', { defaultValue: 'Custom' })
    : 'Custom';

  if (readonly) {
    const display =
      numericValue === 0
        ? t
          ? t('crud:duration.zero', { defaultValue: '—' })
          : '—'
        : numericValue < 60
          ? t
            ? t('crud:duration.minutes', {
                count: numericValue,
                defaultValue: `${numericValue} min`,
              })
            : `${numericValue} min`
          : t
            ? t('crud:duration.hoursMinutes', {
                hours: Math.floor(numericValue / 60),
                minutes: numericValue % 60,
                defaultValue: `${Math.floor(numericValue / 60)}h${numericValue % 60 ? ` ${numericValue % 60}min` : ''}`,
              })
            : `${Math.floor(numericValue / 60)}h${numericValue % 60 ? ` ${numericValue % 60}m` : ''}`;
    return (
      <Stack gap="tight">
        <Label
          required={required}
          style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}
        >
          {label}
        </Label>
        <Stack direction="row" gap="tight" align="center">
          <Clock
            size={18}
            style={{ color: 'var(--muted-foreground)' }}
            aria-hidden
          />
          <span
            style={{
              color: 'var(--muted-foreground)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {display}
          </span>
        </Stack>
        {helperText && (
          <p
            style={{
              fontSize: 'var(--font-size-xs)',
              color: error
                ? 'var(--destructive-foreground)'
                : 'var(--muted-foreground)',
              marginTop: 'var(--gap-sm)',
            }}
          >
            {helperText}
          </p>
        )}
      </Stack>
    );
  }

  return (
    <Stack>
      <Label
        required={required}
        style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}
      >
        {label}
      </Label>

      <Stack
        direction="row"
        gap="tight"
        align="center"
        style={{ flexWrap: 'wrap' }}
      >
        {presetLabels.map(({ minutes, label: chipLabel }) => (
          <Button
            key={minutes}
            type="button"
            variant={numericValue === minutes ? 'primary' : 'outline'}
            disabled={disabled}
            onClick={() => {
              setShowCustom(false);
              onChange(minutes);
            }}
            aria-pressed={numericValue === minutes}
            aria-label={chipLabel}
          >
            <Clock
              size={14}
              style={{ marginRight: 'var(--gap-xs)' }}
              aria-hidden
            />
            {chipLabel}
          </Button>
        ))}
        <Button
          type="button"
          variant={showCustom ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={() => {
            setShowCustom(true);
            if (!isPreset && numericValue > 0) onChange(numericValue);
            else onChange(30);
          }}
          aria-pressed={showCustom}
          aria-label={customLabel}
        >
          {customLabel}
        </Button>
      </Stack>

      {showCustom && (
        <Stack gap="tight" style={{ marginTop: 'var(--gap-sm)' }}>
          <Slider
            value={[isPreset ? 30 : numericValue]}
            onValueChange={([v]) =>
              onChange(Math.max(min, Math.min(max, v ?? 0)))
            }
            min={min}
            max={max}
            step={step}
            showValue
            disabled={disabled}
            aria-label={label}
          />
        </Stack>
      )}

      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
            marginTop: 'var(--gap-sm)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default DurationFieldComponent;
