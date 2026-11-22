'use client';
// packages/features/crud/src/components/form/fields/PhoneNumberComponent.tsx

/**
 * @fileoverview Phone Number Component
 * @description Single phone number input with country code selector and flag. Form field component for phone number inputs in CRUD forms.
 * Value: `<dial code> <number>`, separators stripped (`+33 612345678`), `''` when no
 * number is typed (see {@link toPhoneValue}).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useMemo, useEffect, useId } from 'react';
import type { ChangeEvent, ComponentProps, ComponentType } from 'react';

import {
  Input,
  FloatingLabel,
  Button,
  BUTTON_VARIANT,
  DropdownMenu,
  Stack,
  cn,
} from '@donotdev/components';
import type { DropdownMenuItemData } from '@donotdev/components';
import { Flag, COUNTRIES } from '@donotdev/core';
import type { CountryData } from '@donotdev/core';

/** Separators allowed between digits: spaces, dots, dashes. */
const PHONE_SEPARATORS = /[\s.-]/g;

/**
 * Stored value of a typed number with the selected dial code: `<dial code> <number>`,
 * separators stripped, national trunk `0` dropped. The dial code is never added twice:
 * a number typed with it (`+33…`, `0033…`) keeps one, a number typed with another
 * `+` code is kept as typed (`+447911123456`). Nothing after the dial code (`+33`, `''`):
 * `''` (the controlled field stores `null`: the field is empty, not invalid).
 *
 * @param typed - What the input holds
 * @param dialCode - Selected country's dial code (`+33`)
 * @returns `+33 612345678`, or `''` when no number is typed
 *
 * @example
 * ```ts
 * toPhoneValue('06.12.34.56.78', '+33'); // '+33 612345678'
 * toPhoneValue('+33 6 12 34 56 78', '+33'); // '+33 612345678'
 * toPhoneValue('+33', '+33'); // ''
 * ```
 */
export function toPhoneValue(typed: string, dialCode: string): string {
  let number = typed.replace(PHONE_SEPARATORS, '');
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  if (number.startsWith(dialCode)) number = number.slice(dialCode.length);
  else if (number.startsWith('+')) return number;
  if (number.startsWith('0')) number = number.slice(1);
  return number ? `${dialCode} ${number}` : '';
}

/** Props for the phone input, including native form identity, blur, and ref wiring. */
export interface PhoneNumberComponentProps {
  /** Name of the telephone input in the form */
  name?: ComponentProps<typeof Input>['name'];
  /** Blur handler for the telephone input */
  onBlur?: ComponentProps<typeof Input>['onBlur'];
  /** React 19 native ref targeting the telephone input */
  ref?: ComponentProps<typeof Input>['ref'];
  /** Field label */
  label: string;
  /** Help text (entity field `hint`): an (i) after the label shows it */
  info?: string;
  /** Current phone number value (full number with country code) */
  value?: string;
  /** Change handler */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Required field indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Default country code (e.g., 'FR' for +33) */
  defaultCountry?: string;
  /** Whether to show country flags */
  showFlags?: boolean;
  /** Preferred country codes to show at the top (e.g., ['FR', 'US', 'GB']) */
  preferredCountries?: string[];
  /** Custom list of country codes to show (if provided, only these countries are shown) */
  countries?: string[];
}

/**
 * PhoneNumberComponent renders a single phone number input with country code selector.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const PhoneNumberComponent: ComponentType<PhoneNumberComponentProps> = ({
  label,
  info,
  value = '',
  onChange,
  name,
  onBlur,
  ref,
  error,
  helperText,
  required = false,
  disabled = false,
  defaultCountry = 'FR',
  showFlags = true,
  preferredCountries,
  countries,
}) => {
  const id = useId();

  const availableCountries = useMemo(() => {
    if (countries && countries.length > 0) {
      return countries
        .map((code) => COUNTRIES.find((c) => c.code === code))
        .filter((c): c is CountryData => c !== undefined);
    }
    return Array.from(COUNTRIES);
  }, [countries]);

  const orderedCountries = useMemo(() => {
    if (!preferredCountries || preferredCountries.length === 0) {
      return availableCountries;
    }

    const preferred = preferredCountries
      .map((code) => availableCountries.find((c) => c.code === code))
      .filter((c): c is CountryData => c !== undefined);

    const rest = availableCountries.filter(
      (c) => !preferredCountries.includes(c.code)
    );

    return [...preferred, ...rest];
  }, [availableCountries, preferredCountries]);

  const defaultCountryData = useMemo(
    () =>
      orderedCountries.find((c) => c.code === defaultCountry) ||
      orderedCountries[0] ||
      COUNTRIES[0],
    [defaultCountry, orderedCountries]
  ) as CountryData;

  const { country: detectedCountry, phoneNumber: extractedNumber } =
    useMemo(() => {
      if (!value) {
        return { country: defaultCountryData, phoneNumber: '' };
      }

      const matchingCountry = orderedCountries.find((c) =>
        value.startsWith(c.dialCode)
      );
      if (matchingCountry) {
        let extracted = value.slice(matchingCountry.dialCode.length).trim();
        // Remove leading "0" if present (common in European countries)
        if (extracted.startsWith('0')) {
          extracted = extracted.slice(1).trim();
        }
        // Clean up spaces
        extracted = extracted.replace(/\s+/g, ' ').trim();
        return {
          country: matchingCountry,
          phoneNumber: extracted,
        };
      }

      if (value.startsWith('+')) {
        return { country: defaultCountryData, phoneNumber: value };
      }

      // If value doesn't start with +, remove leading 0 if present
      let cleanedValue = value.trim();
      if (cleanedValue.startsWith('0')) {
        cleanedValue = cleanedValue.slice(1).trim();
      }
      cleanedValue = cleanedValue.replace(/\s+/g, ' ').trim();
      return { country: defaultCountryData, phoneNumber: cleanedValue };
    }, [value, defaultCountryData, orderedCountries]);

  const [selectedCountry, setSelectedCountry] =
    useState<CountryData>(defaultCountryData);

  // An empty value carries no country: keep the one picked until a number is typed.
  useEffect(() => {
    if (value && detectedCountry.code !== selectedCountry.code) {
      setSelectedCountry(detectedCountry);
    }
  }, [value, detectedCountry, selectedCountry.code]);

  const phoneNumber = extractedNumber;

  const handleCountryChange = (country: CountryData) => {
    setSelectedCountry(country);

    // No number: empty value (a bare dial code is not a phone number)
    const syntheticEvent = {
      target: { value: toPhoneValue(phoneNumber, country.dialCode) },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Emptied input or dial code only: empty value (the controlled field stores it as null)
    const syntheticEvent = {
      target: { value: toPhoneValue(event.target.value, selectedCountry.dialCode) },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const countryMenuItems: DropdownMenuItemData[] = orderedCountries.map(
    (country) => ({
      label: country.dialCode,
      onClick: () => handleCountryChange(country),
      checked: country.code === selectedCountry.code,
      children: showFlags ? (
        <Stack direction="row" align="center" gap="tight">
          <Flag code={country.flagCode} title={country.name} />
          <span>{country.dialCode}</span>
          <span
            style={{
              color: 'var(--muted-foreground)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            {country.name}
          </span>
        </Stack>
      ) : (
        <span>
          {country.dialCode} {country.name}
        </span>
      ),
    })
  );

  const hasError = !!error;

  return (
    <Stack gap="tight">
      <FloatingLabel
        htmlFor={id}
        label={label}
        info={info}
        disabled={disabled}
        required={required}
      >
        <div className="dndev-relative" style={{ display: 'flex', gap: 0 }}>
          <DropdownMenu
            trigger={
              <Button
                type="button"
                variant={BUTTON_VARIANT.GHOST}
                disabled={disabled}
                style={{
                  minWidth: 'fit-content',
                  padding: '0 var(--gap-md)',
                }}
                aria-label={`Country code: ${selectedCountry.dialCode}`}
              >
                <Stack direction="row" align="center" gap="tight">
                  {showFlags && (
                    <Flag
                      code={selectedCountry.flagCode}
                      title={selectedCountry.name}
                    />
                  )}
                  <span>{selectedCountry.dialCode}</span>
                </Stack>
              </Button>
            }
            items={countryMenuItems}
            contentWidth="16rem"
          />
          <Input
            ref={ref}
            name={name}
            onBlur={onBlur}
            id={id}
            type="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            disabled={disabled}
            placeholder="6 12 34 56 78"
            bare
            data-variant={hasError ? 'destructive' : undefined}
            className="dndev-flex-1"
            style={{
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
            }}
            aria-describedby={cn(
              hasError && `${id}-error`,
              helperText && !hasError && `${id}-helper`
            )}
            aria-invalid={hasError}
          />
        </div>
      </FloatingLabel>

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

export default PhoneNumberComponent;
