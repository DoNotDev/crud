'use client';
// packages/features/crud/src/components/form/fields/PhoneNumberComponent.tsx

/**
 * @fileoverview Phone Number Component
 * @description Single phone number input with country code selector and flag. Form field component for phone number inputs in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useMemo, useEffect, useId } from 'react';

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

import type { ChangeEvent, ComponentType } from 'react';

export interface PhoneNumberComponentProps {
  /** Field label */
  label: string;
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
  value = '',
  onChange,
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

  useEffect(() => {
    if (detectedCountry.code !== selectedCountry.code) {
      setSelectedCountry(detectedCountry);
    }
  }, [detectedCountry, selectedCountry.code]);

  const phoneNumber = extractedNumber;

  const handleCountryChange = (country: CountryData) => {
    setSelectedCountry(country);

    // Clean up phone number when country changes: remove leading 0 if present
    let cleanedNumber = phoneNumber;
    if (cleanedNumber.startsWith('0')) {
      cleanedNumber = cleanedNumber.slice(1).trim();
    }
    // Clean up spaces
    cleanedNumber = cleanedNumber.replace(/\s+/g, ' ').trim();

    const newValue =
      country.dialCode + (cleanedNumber ? ' ' + cleanedNumber : '');
    const syntheticEvent = {
      target: { value: newValue },
    } as ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    let phoneValue = event.target.value;

    // Remove leading "0" when country code is selected (common in European countries)
    // This handles cases like France: "06 37 37 54 37" -> "6 37 37 54 37" -> "+33 6 37 37 54 37"
    if (phoneValue.startsWith('0')) {
      phoneValue = phoneValue.slice(1).trim();
    }

    // Clean up the phone number: remove extra spaces, keep single spaces for readability
    phoneValue = phoneValue.replace(/\s+/g, ' ').trim();

    const fullValue =
      selectedCountry.dialCode + (phoneValue ? ' ' + phoneValue : '');
    const syntheticEvent = {
      target: { value: fullValue },
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
            color: 'var(--destructive-foreground)',
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
