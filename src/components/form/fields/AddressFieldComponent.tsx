// packages/features/crud/src/components/form/fields/AddressFieldComponent.tsx

/**
 * @fileoverview AddressFieldComponent
 * @description Address field component with Google Maps autocomplete integration
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { MapPin } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

import { Combobox, Stack } from '@donotdev/components';
import { useTranslation, getPlatformEnvVar } from '@donotdev/core';

/**
 * Address field component props
 */
export interface AddressFieldComponentProps {
  /** Field label */
  label: string;
  /** Address value with formatted address and coordinates */
  value?: {
    formatted_address: string;
    latitude?: number;
    longitude?: number;
    [key: string]: any;
  };
  /** Change handler */
  onChange: (value: any) => void;
  /**
   * Whether to enable Google Maps autocomplete (default: false)
   * Requires env var: VITE_GOOGLE_MAPS_API_KEY (Vite) or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Next.js)
   */
  enableGoogleMaps?: boolean;
  /** Whether to extract district code for Paris addresses */
  extractDistrictCode?: boolean;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
}

/**
 * Address field component with Google Maps autocomplete
 * Integrates with Google Places API for address selection
 *
 * Environment variables required for Google Maps:
 * - Vite: VITE_GOOGLE_MAPS_API_KEY
 * - Next.js: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 *
 * @component
 * @param {AddressFieldComponentProps} props - Component props
 * @returns {JSX.Element} Address input field with autocomplete
 */
const AddressFieldComponent = ({
  label,
  value,
  onChange,
  enableGoogleMaps = false,
  extractDistrictCode,
  error,
  helperText,
  required,
}: AddressFieldComponentProps) => {
  const { t } = useTranslation('crud');
  const [inputValue, setInputValue] = useState(value?.formatted_address || '');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // API key from env var only (security: never expose in props)
  // Supports both VITE_GOOGLE_MAPS_API_KEY (Vite) and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Next.js)
  const googleMapsApiKey = getPlatformEnvVar('GOOGLE_MAPS_API_KEY') || '';
  const isGoogleMapsEnabled = enableGoogleMaps && !!googleMapsApiKey;

  // Convert predictions to ComboboxOption format
  const comboboxOptions = useMemo(() => {
    return predictions.map((prediction) => ({
      value: prediction.place_id,
      label: prediction.description,
      description: prediction.structured_formatting?.secondary_text,
      content: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--gap-sm)',
          }}
        >
          <MapPin
            style={{
              width: 'var(--size-icon-sm)',
              height: 'var(--size-icon-sm)',
            }}
          />
          <div>
            <div>{prediction.description}</div>
            {prediction.structured_formatting?.secondary_text && (
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--muted-foreground)',
                }}
              >
                {prediction.structured_formatting.secondary_text}
              </div>
            )}
          </div>
        </div>
      ),
    }));
  }, [predictions]);

  // Handle selection from combobox
  const handleSelect = (placeId: string) => {
    if (!placesServiceRef.current) return;

    setIsLoading(true);
    placesServiceRef.current.getDetails(
      {
        placeId,
        fields: ['formatted_address', 'geometry', 'address_components'],
      },
      (place: any, status: string) => {
        setIsLoading(false);
        if (
          status === window.google?.maps?.places?.PlacesServiceStatus.OK &&
          place
        ) {
          const formatted_address = place.formatted_address || '';
          const lat = place.geometry?.location?.lat();
          const lng = place.geometry?.location?.lng();

          const newValue: any = {
            formatted_address,
            latitude: lat,
            longitude: lng,
          };

          // Extract district code for Paris addresses if requested
          if (extractDistrictCode && place.address_components) {
            const postalCodeComponent = place.address_components.find(
              (comp: any) => comp.types.includes('postal_code')
            );
            const postal_code = postalCodeComponent?.long_name || '';
            const district_code = postal_code.startsWith('92')
              ? 92
              : parseInt(postal_code.slice(-2), 10) || null;
            newValue.district_code = district_code;
          }

          setInputValue(formatted_address);
          onChange(newValue);
        }
      }
    );
  };

  // Sync input value with prop value
  useEffect(() => {
    if (value?.formatted_address) {
      setInputValue(value.formatted_address);
    }
  }, [value]);

  // Load Google Maps script and initialize services (only if enabled)
  useEffect(() => {
    if (!isGoogleMapsEnabled) return;

    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const initServices = () => {
      if (!window.google?.maps?.places) return;

      // Initialize AutocompleteService for getting predictions
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();

      // Initialize PlacesService for getting place details
      placesServiceRef.current = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );
    };

    const loadScript = () => {
      if (window.google?.maps?.places) {
        initServices();
        return;
      }

      if (document.querySelector('#google-maps-script')) {
        // Script tag already added by another instance — poll until ready.
        // Store handle so the cleanup callback can cancel it on unmount.
        pollingInterval = setInterval(() => {
          if (window.google?.maps?.places) {
            clearInterval(pollingInterval!);
            pollingInterval = null;
            initServices();
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => initServices();
      document.head.appendChild(script);
    };

    loadScript();

    return () => {
      if (pollingInterval !== null) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };
  }, [isGoogleMapsEnabled, googleMapsApiKey]);

  // Fetch predictions when input value changes (debounced) - only if Google Maps enabled
  useEffect(() => {
    if (
      !isGoogleMapsEnabled ||
      !inputValue ||
      !autocompleteServiceRef.current
    ) {
      setPredictions([]);
      return;
    }

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce API calls
    debounceTimerRef.current = setTimeout(() => {
      setIsLoading(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: inputValue,
          types: ['geocode', 'establishment'],
        },
        (predictions: any[], status: string) => {
          setIsLoading(false);
          if (
            status === window.google?.maps?.places?.PlacesServiceStatus.OK &&
            predictions
          ) {
            setPredictions(predictions);
          } else {
            setPredictions([]);
          }
        }
      );
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isGoogleMapsEnabled, inputValue]);

  // Handle manual input change (when Google Maps disabled)
  const handleManualChange = (newValue: string) => {
    setInputValue(newValue);
    onChange({
      formatted_address: newValue,
    });
  };

  const handleValueChange = (newValue: string | string[]) => {
    const finalValue = Array.isArray(newValue) ? newValue[0] || '' : newValue;

    if (!isGoogleMapsEnabled) {
      // Manual mode
      handleManualChange(finalValue);
      return;
    }

    // Google Maps mode: check if it's a place_id (from selection)
    const isPlaceId = predictions.some((p) => p.place_id === finalValue);
    if (isPlaceId) {
      // It's a selected prediction - get place details
      handleSelect(finalValue);
    }
    // If it's not a place_id, onSearchChange already updated inputValue
  };

  const handleSearchChange = (search: string) => {
    if (isGoogleMapsEnabled) {
      setInputValue(search);
    }
  };

  // Manual mode: simple text input without autocomplete
  if (!isGoogleMapsEnabled) {
    return (
      <Stack gap="tight">
        <Combobox
          label={label}
          value={inputValue}
          onValueChange={handleValueChange}
          placeholder={t('address.placeholder', 'Enter address...')}
          options={[]}
          required={required}
          variant={error ? 'destructive' : undefined}
          creatable={true}
          createLabel={t('actions.use', 'Use this address')}
        />
        {helperText && (
          <p
            style={{
              fontSize: 'var(--font-size-xs)',
              color: error
                ? 'var(--destructive-foreground)'
                : 'var(--muted-foreground)',
            }}
          >
            {helperText}
          </p>
        )}
      </Stack>
    );
  }

  // Google Maps mode: combobox with autocomplete
  return (
    <Stack gap="tight">
      <Combobox
        label={label}
        value={inputValue}
        onValueChange={handleValueChange}
        onSearchChange={handleSearchChange}
        placeholder={t('address.placeholder', 'Enter address...')}
        emptyMessage={
          isLoading
            ? t('messages.loading', 'Loading...')
            : t('address.noResults', 'No addresses found')
        }
        options={comboboxOptions}
        required={required}
        variant={error ? 'destructive' : undefined}
        isLoading={isLoading}
        creatable={true}
        createLabel={t('actions.use', 'Use this address')}
      />
      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default AddressFieldComponent;
