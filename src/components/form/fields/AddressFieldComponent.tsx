// packages/features/crud/src/components/form/fields/AddressFieldComponent.tsx

/**
 * @fileoverview AddressFieldComponent
 * @description Address field with Google Places autocomplete (new AutocompleteSuggestion API).
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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
   * Whether to enable Google Maps autocomplete (default: false).
   * Requires env var: VITE_GOOGLE_MAPS_API_KEY (Vite) or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Next.js).
   */
  enableGoogleMaps?: boolean;
  /**
   * Whether to extract district_code (last 2 digits of postal code, "92" prefix → 92)
   * onto the address value.
   */
  extractDistrictCode?: boolean;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
}

interface AddressOption {
  value: string;
  label: string;
}

const CACHE_KEY = 'dndev-address-autocomplete-cache';
const MAX_CACHE_SIZE = 100;

function loadCache(): Map<string, AddressOption[]> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    if (raw) return new Map(JSON.parse(raw));
  } catch {
    /* corrupted — start fresh */
  }
  return new Map();
}

function persistCache(cache: Map<string, AddressOption[]>) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify([...cache]));
    }
  } catch {
    /* storage full — non-critical */
  }
}

function evictOldest(map: Map<string, unknown>) {
  if (map.size > MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey as string);
  }
}

const globalSuggestionCache = loadCache();
// Predictions are non-serializable Google SDK objects — keep in-memory only.
const globalPredictions = new Map<string, any>();

/**
 * Google Maps JS API bootstrap loader.
 * Defines `google.maps.importLibrary` as a shim that queues library requests
 * and loads the script on first call. Required for the new Places API.
 * @see https://developers.google.com/maps/documentation/javascript/load-maps-js-api#dynamic-library-import
 */
function installBootstrapLoader(key: string) {
  const g = { key, v: 'weekly' } as Record<string, string>;
  const c = 'google';
  const l = 'importLibrary';
  const q = '__ib__';
  const m = document;
  const b = window as any;
  b[c] = b[c] || {};
  const d = b[c].maps || (b[c].maps = {});
  const r = new Set<string>();
  const e = new URLSearchParams();

  const u = () =>
    // eslint-disable-next-line no-async-promise-executor
    d._p ||
    (d._p = new Promise<void>(async (resolve, reject) => {
      const a = m.createElement('script');
      e.set('libraries', [...r].join(','));
      for (const k of Object.keys(g)) {
        e.set(k.replace(/[A-Z]/g, (t: string) => '_' + t[0]!.toLowerCase()), g[k]!);
      }
      e.set('callback', c + '.maps.' + q);
      a.src = `https://maps.googleapis.com/maps/api/js?` + e;
      d[q] = resolve;
      a.onerror = () => {
        d._p = null;
        reject(new Error('Google Maps JS API could not load.'));
      };
      const nonceEl = m.querySelector<HTMLScriptElement>('script[nonce]');
      if (nonceEl?.nonce) a.nonce = nonceEl.nonce;
      m.head.append(a);
    }));

  if (!d[l]) {
    d[l] = (f: string, ...n: unknown[]) => {
      r.add(f);
      return u().then(() => d[l](f, ...n));
    };
  }
}

/**
 * Address field component with Google Places autocomplete (new API).
 *
 * Modes:
 * - Manual (no API key or `enableGoogleMaps=false`): free-text via Combobox `creatable`.
 * - Google: AutocompleteSuggestion + Place.fetchFields() with Geocoder fallback for coords.
 *
 * Env vars:
 * - Vite: VITE_GOOGLE_MAPS_API_KEY
 * - Next.js: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
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

  const [inputValue, setInputValue] = useState<string>(value?.formatted_address || '');
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = getPlatformEnvVar('GOOGLE_MAPS_API_KEY') || '';
  const isGoogleMapsEnabled = enableGoogleMaps && !!apiKey;

  // Sync field value → input on external change
  useEffect(() => {
    const next = value?.formatted_address ?? '';
    setInputValue((prev) => (prev === next ? prev : next));
  }, [value]);

  // Bootstrap-load Google Maps + Places library
  useEffect(() => {
    if (!isGoogleMapsEnabled || mapsLoaded) return;

    const g = (window as any).google;
    if (g?.maps?.places?.AutocompleteSuggestion) {
      sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
      setMapsLoaded(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (!(window as any).google?.maps?.importLibrary) {
          installBootstrapLoader(apiKey);
        }
        await (window as any).google.maps.importLibrary('places');
        if (cancelled) return;
        sessionTokenRef.current = new (window as any).google.maps.places.AutocompleteSessionToken();
        setMapsLoaded(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AddressFieldComponent] Google Maps loading failed:', err);
        if (!cancelled) setApiError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGoogleMapsEnabled, apiKey, mapsLoaded]);

  // Fetch suggestions (debounced)
  useEffect(() => {
    if (!isGoogleMapsEnabled || !mapsLoaded || apiError) return;
    if (inputValue.length < 3) {
      setOptions([]);
      return;
    }

    const cached = globalSuggestionCache.get(inputValue);
    if (cached) {
      setOptions(cached);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const places = (window as any).google.maps.places;
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: inputValue,
          sessionToken: sessionTokenRef.current,
        });

        const newOptions: AddressOption[] = suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => {
            const pred = s.placePrediction;
            const label = [pred.mainText?.text, pred.secondaryText?.text].filter(Boolean).join(', ');
            globalPredictions.set(label, pred);
            evictOldest(globalPredictions);
            return { value: label, label };
          });

        setOptions(newOptions);
        globalSuggestionCache.set(inputValue, newOptions);
        evictOldest(globalSuggestionCache);
        persistCache(globalSuggestionCache);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[AddressFieldComponent] AutocompleteSuggestion failed:', err);
        setApiError(true);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isGoogleMapsEnabled, mapsLoaded, apiError, inputValue]);

  const handleSelect = useCallback(
    async (selected: string | string[]) => {
      const selectedLabel = Array.isArray(selected) ? selected[0] || '' : selected;
      if (!selectedLabel) return;

      // Manual mode: emit raw text
      if (!isGoogleMapsEnabled) {
        setInputValue(selectedLabel);
        onChange({ formatted_address: selectedLabel });
        return;
      }

      let prediction = globalPredictions.get(selectedLabel);
      const places = (window as any).google?.maps?.places;
      if (!places) return;

      if (!prediction) {
        // Cache miss (e.g. localStorage rehydrate) — re-fetch to recover the SDK object
        setLoading(true);
        try {
          const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: selectedLabel,
            sessionToken: sessionTokenRef.current,
          });
          const match = suggestions.find((s: any) => {
            const label = [s.placePrediction?.mainText?.text, s.placePrediction?.secondaryText?.text]
              .filter(Boolean)
              .join(', ');
            return label === selectedLabel;
          });
          if (match?.placePrediction) {
            prediction = match.placePrediction;
            globalPredictions.set(selectedLabel, prediction);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AddressFieldComponent] Re-fetch for selection failed:', err);
        }
        if (!prediction) {
          setLoading(false);
          // Fallback: emit raw text so user input isn't lost
          setInputValue(selectedLabel);
          onChange({ formatted_address: selectedLabel });
          return;
        }
      }

      setLoading(true);
      try {
        const place = prediction.toPlace();
        await place.fetchFields({
          fields: ['formattedAddress', 'location', 'addressComponents'],
        });

        const formattedAddress: string = place.formattedAddress || selectedLabel;
        let lat = place.location?.lat() ?? 0;
        let lng = place.location?.lng() ?? 0;

        // Coord fallback: geocode the address if Places returned none
        if (lat === 0 && lng === 0 && formattedAddress) {
          try {
            const geocodingLib: any = await (window as any).google.maps.importLibrary('geocoding');
            const geocoder = new geocodingLib.Geocoder();
            const geocodeResult = await geocoder.geocode({ address: formattedAddress });
            const loc = geocodeResult.results?.[0]?.geometry?.location;
            if (loc) {
              lat = loc.lat();
              lng = loc.lng();
            }
          } catch (geoErr) {
            // eslint-disable-next-line no-console
            console.error('[AddressFieldComponent] Geocoder fallback failed:', geoErr);
          }
        }

        const newValue: any = {
          formatted_address: formattedAddress,
          latitude: lat,
          longitude: lng,
        };

        if (extractDistrictCode) {
          const components: any[] = place.addressComponents || [];
          const postal =
            components.find((c) => (c.types || []).includes('postal_code'))?.longText ||
            components.find((c) => (c.types || []).includes('postal_code'))?.long_name ||
            '';
          const districtCode = postal.startsWith('92') ? 92 : parseInt(postal.slice(-2), 10) || null;
          newValue.district_code = districtCode;
        }

        setInputValue(formattedAddress);
        setOptions([]);
        onChange(newValue);

        // New session token after a successful selection (per Google docs)
        sessionTokenRef.current = new places.AutocompleteSessionToken();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AddressFieldComponent] Place fetchFields failed:', err);
        // Don't drop the user's input on error
        setInputValue(selectedLabel);
        onChange({ formatted_address: selectedLabel });
      } finally {
        setLoading(false);
      }
    },
    [isGoogleMapsEnabled, extractDistrictCode, onChange]
  );

  const handleSearchChange = (search: string) => {
    setInputValue(search);
  };

  // Manual mode: simple combobox with creatable text entry
  if (!isGoogleMapsEnabled) {
    return (
      <Stack gap="tight">
        <Combobox
          label={label}
          value={inputValue}
          onValueChange={handleSelect}
          onSearchChange={handleSearchChange}
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
              color: error ? 'var(--destructive-foreground)' : 'var(--muted-foreground)',
            }}
          >
            {helperText}
          </p>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="tight">
      <Combobox
        label={label}
        value={inputValue}
        onValueChange={handleSelect}
        onSearchChange={handleSearchChange}
        placeholder={t('address.placeholder', 'Enter address...')}
        emptyMessage={
          loading
            ? t('messages.loading', 'Loading...')
            : t('address.noResults', 'No addresses found')
        }
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        required={required}
        variant={error ? 'destructive' : undefined}
        isLoading={loading}
        creatable={true}
        createLabel={t('actions.use', 'Use this address')}
        disabled={!mapsLoaded && !apiError}
      />
      {apiError && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--muted-foreground)',
          }}
        >
          {t('address.apiUnavailable', 'Google Places unavailable — type address manually')}
        </p>
      )}
      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error ? 'var(--destructive-foreground)' : 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </Stack>
  );
};

export default AddressFieldComponent;
