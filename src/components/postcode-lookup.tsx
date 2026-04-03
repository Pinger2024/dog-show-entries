'use client';

import { useState, useRef, useCallback } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

type PostcodeResult = {
  postcode: string;
  admin_district: string | null;
  admin_ward: string | null;
  parish: string | null;
  parliamentary_constituency: string | null;
  region: string | null;
};

export function PostcodeLookup({ onSelect, compact }: PostcodeLookupProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PostcodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookup = useCallback(async (postcode: string) => {
    const cleaned = postcode.trim().replace(/\s+/g, '');
    if (cleaned.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try exact postcode first
      const exactRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`);
      if (exactRes.ok) {
        const data = await exactRes.json();
        if (data.status === 200 && data.result) {
          setResults([data.result]);
          setShowResults(true);
          setLoading(false);
          return;
        }
      }

      // Fall back to autocomplete
      const autoRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}/autocomplete`);
      if (autoRes.ok) {
        const data = await autoRes.json();
        if (data.status === 200 && data.result?.length > 0) {
          // Fetch details for top results (max 5)
          const postcodes = data.result.slice(0, 5);
          const bulkRes = await fetch('https://api.postcodes.io/postcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postcodes }),
          });
          if (bulkRes.ok) {
            const bulkData = await bulkRes.json();
            const resolved = bulkData.result
              ?.filter((r: { result: PostcodeResult | null }) => r.result)
              .map((r: { result: PostcodeResult }) => r.result) ?? [];
            setResults(resolved);
            setShowResults(true);
            setLoading(false);
            return;
          }
        }
      }

      setResults([]);
      setError('No addresses found. Try a different postcode.');
    } catch {
      setError('Could not search postcodes. Please type your address manually.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(() => lookup(value), 400);
  }

  function handleSelect(result: PostcodeResult) {
    const town = result.admin_district ?? result.admin_ward ?? '';
    const area = result.parish ?? result.admin_ward ?? '';

    onSelect({
      address: area !== town ? area : '',
      town,
      postcode: result.postcode,
      fullAddress: [area !== town ? area : '', town, result.postcode].filter(Boolean).join(', '),
    });
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  function handleSearch() {
    if (query.trim().length >= 3) {
      lookup(query);
    }
  }

  return (
    <div className="relative space-y-2">
      {!compact && (
        <p className="text-sm font-medium">Find address by postcode</p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Enter postcode e.g. G41 3QU"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            onFocus={() => results.length > 0 && setShowResults(true)}
            onBlur={() => {
              setTimeout(() => setShowResults(false), 200);
            }}
            className={compact ? 'h-9 text-sm' : 'min-h-[2.75rem] text-sm'}
            autoComplete="off"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? 'h-9 px-3' : 'min-h-[2.75rem] px-3'}
          onClick={handleSearch}
          disabled={loading || query.trim().length < 3}
        >
          <Search className="size-4" />
        </Button>
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto overscroll-contain rounded-md border bg-background shadow-md">
          {results.map((r) => (
            <button
              key={r.postcode}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="font-medium">{r.postcode}</span>
                <span className="text-muted-foreground">
                  {' '}{[r.admin_ward, r.admin_district].filter(Boolean).join(', ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
      )}
    </div>
  );
}
