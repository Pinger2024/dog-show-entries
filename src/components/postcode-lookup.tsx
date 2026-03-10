'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type AddressResult = {
  address: string;
  town: string;
  postcode: string;
  fullAddress: string;
};

/** Format an AddressResult as a single-line string (address, town). Postcode excluded — use result.postcode separately. */
export function formatAddress(result: AddressResult): string {
  const parts = [result.address];
  if (result.town) parts.push(result.town);
  return parts.join(', ');
}

interface PostcodeLookupProps {
  onSelect: (result: AddressResult) => void;
  /** Compact mode hides the label and uses smaller sizing */
  compact?: boolean;
}

type Suggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

/** Extract structured address fields from Google Places addressComponents */
function parseAddressComponents(
  components: google.maps.places.AddressComponent[],
  formattedAddress: string | null,
): AddressResult {
  let streetNumber = '';
  let route = '';
  let subpremise = '';
  let premise = '';
  let locality = '';
  let postalTown = '';
  let postcode = '';

  for (const c of components) {
    const type = c.types[0];
    switch (type) {
      case 'street_number': streetNumber = c.longText ?? ''; break;
      case 'route': route = c.longText ?? ''; break;
      case 'subpremise': subpremise = c.longText ?? ''; break;
      case 'premise': premise = c.longText ?? ''; break;
      case 'locality': locality = c.longText ?? ''; break;
      case 'postal_town': postalTown = c.longText ?? ''; break;
      case 'postal_code': postcode = c.longText ?? ''; break;
    }
  }

  // Build street address
  const parts: string[] = [];
  if (subpremise) parts.push(subpremise);
  if (premise) parts.push(premise);
  const street = [streetNumber, route].filter(Boolean).join(' ');
  if (street) parts.push(street);

  return {
    address: parts.join(', ') || formattedAddress?.split(',')[0] || '',
    town: postalTown || locality,
    postcode,
    fullAddress: formattedAddress ?? [parts.join(', '), postalTown || locality, postcode].filter(Boolean).join(', '),
  };
}

export function PostcodeLookup({ onSelect, compact }: PostcodeLookupProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [focused, setFocused] = useState(false);

  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the Places library once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
        setOptions({
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '',
          version: 'weekly',
        });
        const lib = await importLibrary('places');
        if (cancelled) return;
        placesLibRef.current = lib;
        sessionTokenRef.current = new lib.AutocompleteSessionToken();
      } catch {
        // Silently fail — address lookup is a convenience, not critical
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const lib = placesLibRef.current;
    if (!lib || !input || input.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current!,
        includedRegionCodes: ['gb'],
        language: 'en-GB',
      });

      const mapped: Suggestion[] = response.suggestions
        .map((s) => s.placePrediction)
        .filter(Boolean)
        .map((p) => ({
          placeId: p!.placeId,
          mainText: p!.mainText?.text ?? '',
          secondaryText: p!.secondaryText?.text ?? '',
          fullText: p!.text?.text ?? '',
        }));

      setSuggestions(mapped);
    } catch {
      setSuggestions([]);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      await fetchSuggestions(value);
      setLoading(false);
    }, 300);
  }

  async function handleSelect(suggestion: Suggestion) {
    const lib = placesLibRef.current;
    if (!lib) return;

    setSelecting(true);
    setSuggestions([]);

    try {
      const place = new lib.Place({ id: suggestion.placeId });
      await place.fetchFields({
        fields: ['formattedAddress', 'addressComponents'],
      });

      const result = parseAddressComponents(
        place.addressComponents ?? [],
        place.formattedAddress,
      );

      onSelect(result);
      setQuery('');

      // Reset session token for next search
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    } catch {
      // If place details fail, use the suggestion text as a fallback
      onSelect({
        address: suggestion.mainText,
        town: suggestion.secondaryText.replace(/, UK$/, ''),
        postcode: '',
        fullAddress: suggestion.fullText,
      });
      setQuery('');
    } finally {
      setSelecting(false);
    }
  }

  return (
    <div className="relative space-y-2">
      {!compact && (
        <p className="text-sm font-medium">Find address</p>
      )}
      <div className="relative">
        <Input
          placeholder="Start typing your address..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay hiding so click on suggestion registers
            setTimeout(() => setFocused(false), 200);
          }}
          className={compact ? 'h-9 text-sm' : 'h-11 sm:h-12 text-sm sm:text-[0.9375rem]'}
          autoComplete="off"
        />
        {(loading || selecting) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 w-full max-h-48 overflow-y-auto rounded-md border bg-background shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="font-medium">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="text-muted-foreground"> {s.secondaryText}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
