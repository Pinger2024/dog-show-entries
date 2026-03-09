'use client';

import { useState } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type AddressResult = {
  address: string;
  town: string;
  postcode: string;
  fullAddress: string;
  uprn: string;
};

interface PostcodeLookupProps {
  onSelect: (result: AddressResult) => void;
  /** Compact mode hides the label and uses smaller sizing */
  compact?: boolean;
}

export function PostcodeLookup({ onSelect, compact }: PostcodeLookupProps) {
  const [postcode, setPostcode] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const trimmed = postcode.trim();
    if (!trimmed) return;

    setError('');
    setLoading(true);
    setResults([]);
    setSearched(true);

    try {
      const res = await fetch(`/api/address-lookup?postcode=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Lookup failed');
        return;
      }

      if (data.results.length === 0) {
        setError('No addresses found for this postcode');
        return;
      }

      setResults(data.results);
    } catch {
      setError('Failed to look up address');
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(result: AddressResult) {
    onSelect(result);
    setResults([]);
    setPostcode('');
    setSearched(false);
  }

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-sm font-medium">Find address</p>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Enter postcode"
          value={postcode}
          onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
          className={compact ? 'h-9 text-sm' : 'h-11 sm:h-12 text-sm sm:text-[0.9375rem]'}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleSearch}
          disabled={loading || !postcode.trim()}
          className={compact ? 'h-9 px-3' : 'h-11 sm:h-12 px-4'}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
          {results.map((result) => (
            <button
              key={result.uprn}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              onClick={() => handleSelect(result)}
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{result.fullAddress}</span>
            </button>
          ))}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No results</p>
      )}
    </div>
  );
}
