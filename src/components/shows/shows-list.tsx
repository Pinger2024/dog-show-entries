'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/date-utils';
import { PUBLIC_SHOW_STATUSES } from '@/lib/public-show-statuses';
import { showTypeLabels, displayShowTypeLabel } from '@/lib/show-types';
import {
  MapPin,
  Search,
  Loader2,
  Navigation,
  Locate,
  ChevronDown,
  Sparkles,
  Clock,
  Dog,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Chip, Pulse, SEButton, SECard, SecLabel } from '@/components/show-experience/kit';

/* ─── Debounce hook ────────────────────────────────── */

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ─── Types ────────────────────────────────────────── */

type ShowListItem = {
  id: string;
  slug: string | null;
  name: string;
  showType: string;
  showRuleset?: string | null;
  status: string;
  startDate: string;
  endDate: string;
  entriesOpenDate: string | Date | null;
  entryCloseDate: string | Date | null;
  organisation: { name: string } | null;
  venue: { name: string } | null;
  // Not selected by the `nearby` query (near-me results simply omit a fee).
  firstEntryFee?: number | null;
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  entries_open: 'Entries Open',
  entries_closed: 'Entries Closed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const radiusOptions = [
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: 200, label: '200 miles' },
];

/* ─── Date helpers ─────────────────────────────────── */

function isEntryCloseDatePast(date: string | Date | null) {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() < Date.now();
}

/* ─── Status pill ────────────────────────────────────
 * Same rules the old ClosingCountdown/badge combo used, consolidated
 * into one place so the card only needs one tone + label. */

type StatusPillTone = 'fresh' | 'honey' | 'light';

function getStatusPill(show: ShowListItem): {
  tone: StatusPillTone;
  label: string;
  showClock?: boolean;
  showPulse?: boolean;
} {
  const closePassed = isEntryCloseDatePast(show.entryCloseDate);

  if (show.status === 'entries_open' && !closePassed) {
    if (show.entryCloseDate) {
      const closeDate =
        typeof show.entryCloseDate === 'string' ? new Date(show.entryCloseDate) : show.entryCloseDate;
      const days = differenceInDays(closeDate, new Date());
      if (days <= 0) return { tone: 'honey', label: 'Closes today!', showClock: true };
      if (days <= 7) return { tone: 'honey', label: `Closes in ${days}d`, showClock: true };
    }
    return { tone: 'fresh', label: 'Entries open', showPulse: true };
  }

  if (show.status === 'entries_open' && closePassed) {
    return { tone: 'light', label: 'Entries Closed' };
  }

  if (show.status === 'published' && show.entriesOpenDate) {
    const openDate =
      typeof show.entriesOpenDate === 'string' ? new Date(show.entriesOpenDate) : show.entriesOpenDate;
    return { tone: 'light', label: `Opens ${format(openDate, 'd MMM')}` };
  }

  return { tone: 'light', label: statusLabels[show.status] ?? show.status };
}

/* ─── Active filter pills ───────────────────────────── */

function FilterPills({
  search,
  showType,
  status,
  breedName,
  onClearSearch,
  onClearShowType,
  onClearStatus,
  onClearBreed,
}: {
  search: string;
  showType: string;
  status: string;
  breedName: string | null;
  onClearSearch: () => void;
  onClearShowType: () => void;
  onClearStatus: () => void;
  onClearBreed: () => void;
}) {
  const hasFilters = search || showType !== 'all' || status !== 'all' || breedName;
  if (!hasFilters) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-se-ink3">Active filters:</span>
      {search && (
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex min-h-[2.75rem] items-center"
        >
          <Chip tone="light" className="gap-1.5">
            &ldquo;{search}&rdquo;
            <X className="size-3" />
          </Chip>
        </button>
      )}
      {showType !== 'all' && (
        <button
          type="button"
          onClick={onClearShowType}
          className="inline-flex min-h-[2.75rem] items-center"
        >
          <Chip tone="light" className="gap-1.5">
            {showTypeLabels[showType]}
            <X className="size-3" />
          </Chip>
        </button>
      )}
      {status !== 'all' && (
        <button
          type="button"
          onClick={onClearStatus}
          className="inline-flex min-h-[2.75rem] items-center"
        >
          <Chip tone="light" className="gap-1.5">
            {statusLabels[status]}
            <X className="size-3" />
          </Chip>
        </button>
      )}
      {breedName && (
        <button
          type="button"
          onClick={onClearBreed}
          className="inline-flex min-h-[2.75rem] items-center"
        >
          <Chip tone="light" className="gap-1.5">
            {breedName}
            <X className="size-3" />
          </Chip>
        </button>
      )}
    </div>
  );
}

/* ─── Postcode lookup helper ────────────────────────── */

async function lookupPostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const cleaned = postcode.trim().replace(/\s+/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── Near Me Controls ──────────────────────────────── */

function NearMeControls({
  location,
  radiusMiles,
  breedId,
  postcode,
  postcodeError,
  isLocating,
  onUseMyLocation,
  onPostcodeChange,
  onPostcodeSubmit,
  onRadiusChange,
  onBreedChange,
  onDisable,
}: {
  location: { lat: number; lng: number } | null;
  radiusMiles: number;
  breedId: string;
  postcode: string;
  postcodeError: string;
  isLocating: boolean;
  onUseMyLocation: () => void;
  onPostcodeChange: (v: string) => void;
  onPostcodeSubmit: () => void;
  onRadiusChange: (v: number) => void;
  onBreedChange: (v: string) => void;
  onDisable: () => void;
}) {
  const { data: breeds } = trpc.breeds.list.useQuery();

  return (
    <div className="mb-4 rounded-[14px] border border-se-fresh-line bg-se-fresh-soft p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="size-4 text-se-fresh-deep" />
          <span className="text-sm font-semibold text-se-ink">Near Me</span>
        </div>
        <button
          type="button"
          onClick={onDisable}
          aria-label="Close Near Me"
          className="flex size-8 items-center justify-center rounded-full text-se-ink3 transition-colors hover:bg-se-surface hover:text-se-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Location input */}
      {!location && (
        <div className="space-y-3">
          <SEButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUseMyLocation}
            disabled={isLocating}
            className="w-full gap-2 sm:w-auto"
          >
            {isLocating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Locate className="size-4" />
            )}
            {isLocating ? 'Locating...' : 'Use my location'}
          </SEButton>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-se-line2" />
            <span className="text-xs text-se-ink3">or</span>
            <div className="h-px flex-1 bg-se-line2" />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter postcode (e.g. G1 1AA)"
              value={postcode}
              onChange={(e) => onPostcodeChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onPostcodeSubmit();
              }}
              className="h-11 flex-1 rounded-[12px] border-se-line2 bg-se-surface text-se-ink placeholder:text-se-ink3 shadow-none"
            />
            <SEButton
              type="button"
              variant="fresh"
              size="sm"
              onClick={onPostcodeSubmit}
              disabled={!postcode.trim()}
            >
              Search
            </SEButton>
          </div>
          {postcodeError && (
            <p className="text-xs text-red-600">{postcodeError}</p>
          )}
        </div>
      )}

      {/* Active location controls */}
      {location && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Select
            value={radiusMiles.toString()}
            onValueChange={(v) => onRadiusChange(Number(v))}
          >
            <SelectTrigger className="h-9 w-full rounded-[10px] border-se-line2 bg-se-surface text-se-ink shadow-none sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-se-line bg-se-surface text-se-ink">
              {radiusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {breeds && breeds.length > 0 && (
            <Select value={breedId} onValueChange={onBreedChange}>
              <SelectTrigger className="h-9 w-full rounded-[10px] border-se-line2 bg-se-surface text-se-ink shadow-none sm:w-[200px]">
                <SelectValue placeholder="Any breed" />
              </SelectTrigger>
              <SelectContent className="border-se-line bg-se-surface text-se-ink">
                <SelectItem value="all">Any breed</SelectItem>
                {breeds.map((breed) => (
                  <SelectItem key={breed.id} value={breed.id}>
                    {breed.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <SEButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDisable}
            className="text-se-ink3"
          >
            Clear location
          </SEButton>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────── */

const PAGE_SIZE = 24;

export default function ShowsList() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [showType, setShowType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const debouncedSearch = useDebounce(search, 300);

  // Near Me state
  const [nearMeActive, setNearMeActive] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [breedId, setBreedId] = useState<string>('all');
  const [postcode, setPostcode] = useState('');
  const [postcodeError, setPostcodeError] = useState('');

  // Auto-breed filter state
  const [autoBreedFilter, setAutoBreedFilter] = useState(true); // default to auto-filter
  const [userBreedIds, setUserBreedIds] = useState<string[]>([]);
  const [userBreedNames, setUserBreedNames] = useState<string[]>([]);
  const autoBreedInitRef = useRef(false);

  // Fetch breeds for breed filter
  const { data: breeds } = trpc.breeds.list.useQuery();

  // Fetch user's dogs to extract their breeds (only for logged-in users)
  const { data: userDogs } = trpc.dogs.list.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const [isLocating, setIsLocating] = useState(false);

  // Pagination state — accumulated items + current cursor
  const [cursor, setCursor] = useState(0);
  const [allItems, setAllItems] = useState<ShowListItem[]>([]);
  const prevKeyRef = useRef('');

  // Auto-populate breed filter from user's dogs on initial load
  useEffect(() => {
    if (autoBreedInitRef.current || !userDogs || !breeds) return;
    autoBreedInitRef.current = true;

    // Extract unique breed IDs and names from user's dogs
    const breedMap = new Map<string, string>();
    for (const dog of userDogs) {
      if (dog.breedId && dog.breed?.name) {
        breedMap.set(dog.breedId, dog.breed.name);
      }
    }

    if (breedMap.size > 0) {
      setUserBreedIds([...breedMap.keys()]);
      setUserBreedNames([...breedMap.values()]);
      setAutoBreedFilter(true);
    } else {
      setAutoBreedFilter(false);
    }
  }, [userDogs, breeds]);

  // Determine if we should apply the auto breed filter
  const isAutoBreedActive = autoBreedFilter && userBreedIds.length > 0 && breedId === 'all';

  // Build query key for detecting filter changes
  const autoBreedKey = isAutoBreedActive ? userBreedIds.join(',') : '';
  const queryKey = `${debouncedSearch}|${showType}|${status}|${breedId}|${autoBreedKey}`;

  // Standard list query (only when near me is not active)
  const { data, isLoading, isFetching } = trpc.shows.list.useQuery(
    {
      showType:
        showType !== 'all'
          ? (showType as
              | 'companion'
              | 'primary'
              | 'limited'
              | 'open'
              | 'premier_open'
              | 'championship')
          : undefined,
      status:
        status !== 'all'
          ? (status as (typeof PUBLIC_SHOW_STATUSES)[number])
          : undefined,
      search: debouncedSearch || undefined,
      breedId: breedId !== 'all' ? breedId : undefined,
      breedIds: isAutoBreedActive ? userBreedIds : undefined,
      limit: PAGE_SIZE,
      cursor,
    },
    { enabled: !nearMeActive || !location },
  );

  // Reset pagination when filters change
  useEffect(() => {
    if (queryKey !== prevKeyRef.current) {
      prevKeyRef.current = queryKey;
      setCursor(0);
      setAllItems([]);
    }
  }, [queryKey]);

  // Accumulate items as pages load
  useEffect(() => {
    if (data?.items) {
      if (cursor === 0) {
        setAllItems(data.items);
      } else {
        setAllItems((prev) => [...prev, ...data.items]);
      }
    }
  }, [data?.items, cursor]);

  // Nearby query (only when near me is active and we have a location)
  const {
    data: nearbyData,
    isLoading: isNearbyLoading,
  } = trpc.shows.nearby.useQuery(
    {
      lat: location?.lat ?? 0,
      lng: location?.lng ?? 0,
      radiusMiles,
      breedId: breedId !== 'all' ? breedId : undefined,
      limit: 50,
    },
    { enabled: nearMeActive && !!location },
  );

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setPostcodeError('Geolocation is not supported by your browser. Please enter a postcode instead.');
      return;
    }

    setIsLocating(true);
    setPostcodeError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
      },
      () => {
        setPostcodeError('Could not get your location. Please enter a postcode instead.');
        setIsLocating(false);
      },
      { timeout: 10000 }
    );
  }, []);

  const handlePostcodeSubmit = useCallback(async () => {
    if (!postcode.trim()) return;
    setPostcodeError('');
    setIsLocating(true);

    const result = await lookupPostcode(postcode);
    if (result) {
      setLocation(result);
      setPostcodeError('');
    } else {
      setPostcodeError('Postcode not found. Please check and try again.');
    }
    setIsLocating(false);
  }, [postcode]);

  const handleDisableNearMe = useCallback(() => {
    setNearMeActive(false);
    setLocation(null);
    setPostcode('');
    setPostcodeError('');
    setBreedId('all');
  }, []);

  const handleEnableNearMe = useCallback(() => {
    setNearMeActive(true);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor != null) {
      setCursor(data.nextCursor);
    }
  }, [data?.nextCursor]);

  // Determine which data to show
  const isNearMeMode = nearMeActive && !!location;
  const currentLoading = isNearMeMode ? isNearbyLoading : (isLoading && cursor === 0);
  const isLoadingMore = isFetching && cursor > 0;

  // Use accumulated items for standard list (server handles search now)
  const filteredShows = allItems;
  const totalShows = data?.total ?? 0;
  const hasMore = data?.nextCursor != null;

  /* Split into actually-accepting-entries vs others for visual grouping */
  const openShows = filteredShows.filter((s) => s.status === 'entries_open' && !isEntryCloseDatePast(s.entryCloseDate));
  const otherShows = filteredShows.filter((s) => s.status !== 'entries_open' || isEntryCloseDatePast(s.entryCloseDate));

  // Nearby shows
  const nearbyShows = nearbyData ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* ─── Page header ─────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold leading-[1.05] text-se-ink sm:text-[34px]">
          Find a Show
        </h1>
        <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-se-ink3">
          {isNearMeMode
            ? `${postcode.trim() || 'Your location'} · within ${radiusMiles} miles`
            : 'Browse championship, open, and companion shows across the country. Find your next ring and enter online.'}
        </p>
      </div>

      {/* ─── Filters ─────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-se-ink3" />
          <Input
            placeholder="Search shows, venues, societies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-[13px] border-se-line bg-se-surface pl-10 text-se-ink placeholder:text-se-ink3 shadow-none transition-shadow focus-visible:border-se-fresh focus-visible:ring-se-fresh/25"
            disabled={isNearMeMode}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
          <Select value={showType} onValueChange={setShowType} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-[13px] border-se-line bg-se-surface text-se-ink shadow-none sm:w-[160px]">
              <SelectValue placeholder="Show Type" />
            </SelectTrigger>
            <SelectContent className="border-se-line bg-se-surface text-se-ink">
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(showTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-[13px] border-se-line bg-se-surface text-se-ink shadow-none sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="border-se-line bg-se-surface text-se-ink">
              <SelectItem value="all">All Statuses</SelectItem>
              {PUBLIC_SHOW_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={breedId} onValueChange={setBreedId} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-[13px] border-se-line bg-se-surface text-se-ink shadow-none sm:w-[190px]">
              <SelectValue placeholder="Breed" />
            </SelectTrigger>
            <SelectContent className="border-se-line bg-se-surface text-se-ink">
              <SelectItem value="all">All Breeds</SelectItem>
              {breeds?.map((breed) => (
                <SelectItem key={breed.id} value={breed.id}>
                  {breed.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Near Me toggle button */}
          <SEButton
            type="button"
            variant={nearMeActive ? 'fresh' : 'ghost'}
            size="sm"
            onClick={nearMeActive ? handleDisableNearMe : handleEnableNearMe}
            className="h-11 gap-2 rounded-[13px]"
          >
            <Navigation className="size-4" />
            <span className="hidden sm:inline">Near Me</span>
          </SEButton>
        </div>
      </div>

      {/* Clear filters */}
      {(search || showType !== 'all' || status !== 'all' || breedId !== 'all') && !nearMeActive && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setShowType('all');
              setStatus('all');
              setBreedId('all');
            }}
            className="flex items-center gap-1 rounded-full border border-dashed border-se-line2 px-2.5 py-1 text-xs text-se-ink3 transition-colors hover:border-se-fresh hover:text-se-fresh-deep"
          >
            <X className="size-3" />
            Clear all filters
          </button>
        </div>
      )}

      {/* ─── Near Me Controls ────────────────────── */}
      {nearMeActive && (
        <NearMeControls
          location={location}
          radiusMiles={radiusMiles}
          breedId={breedId}
          postcode={postcode}
          postcodeError={postcodeError}
          isLocating={isLocating}
          onUseMyLocation={handleUseMyLocation}
          onPostcodeChange={setPostcode}
          onPostcodeSubmit={handlePostcodeSubmit}
          onRadiusChange={setRadiusMiles}
          onBreedChange={setBreedId}
          onDisable={handleDisableNearMe}
        />
      )}

      {!isNearMeMode && (
        <FilterPills
          search={search}
          showType={showType}
          status={status}
          breedName={breedId !== 'all' ? breeds?.find((b) => b.id === breedId)?.name ?? null : null}
          onClearSearch={() => setSearch('')}
          onClearShowType={() => setShowType('all')}
          onClearStatus={() => setStatus('all')}
          onClearBreed={() => setBreedId('all')}
        />
      )}

      {/* ─── Auto breed filter banner ──────────── */}
      {isAutoBreedActive && !isNearMeMode && (
        <SECard className="mb-4 flex flex-col gap-3 border-se-fresh-line bg-se-fresh-soft p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-se-fresh-deep sm:mt-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-se-ink">
                Showing shows for your breeds
              </p>
              <p className="mt-0.5 text-xs text-se-ink3">
                {userBreedNames.join(', ')}
              </p>
            </div>
          </div>
          <SEButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAutoBreedFilter(false)}
            className="shrink-0"
          >
            Show all
          </SEButton>
        </SECard>
      )}

      {/* ─── Loading ─────────────────────────────── */}
      {currentLoading ? (
        <div className="flex min-h-[45vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-se-fresh" />
            <p className="text-sm text-se-ink3">
              {isNearMeMode ? 'Finding shows near you...' : 'Loading shows...'}
            </p>
          </div>
        </div>
      ) : isNearMeMode ? (
        /* ─── Near Me Results ────────────────────── */
        nearbyShows.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No shows nearby"
            description="Try increasing the search radius or check back later"
            variant="centered"
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-se-ink3">
              {nearbyShows.length} show{nearbyShows.length !== 1 ? 's' : ''} within {radiusMiles} miles
            </p>
            <div className="flex flex-col gap-3">
              {nearbyShows.map((show) => (
                <ShowCard
                  key={show.id}
                  show={{
                    id: show.id,
                    slug: null,
                    name: show.name,
                    showType: show.showType,
                    status: show.status,
                    startDate: show.startDate,
                    endDate: show.endDate,
                    entriesOpenDate: show.entriesOpenDate,
                    entryCloseDate: show.entryCloseDate,
                    organisation: show.organisation,
                    venue: show.venue,
                  }}
                  distance={show.distance}
                />
              ))}
            </div>
          </>
        )
      ) : filteredShows.length === 0 ? (
        /* ─── Empty state ──────────────────────── */
        <EmptyState
          icon={Dog}
          title="No shows found"
          description={
            search || showType !== 'all' || status !== 'all'
              ? 'Try adjusting your filters'
              : 'Check back soon for upcoming shows'
          }
          variant="centered"
        />
      ) : (
        <>
          {/* ─── Results count ───────────────────── */}
          <p className="mb-6 text-sm text-se-ink3">
            {totalShows > filteredShows.length
              ? `Showing ${filteredShows.length} of ${totalShows} show${totalShows !== 1 ? 's' : ''}`
              : `${filteredShows.length} show${filteredShows.length !== 1 ? 's' : ''}`}
            {openShows.length > 0 && (
              <span className="ml-1">
                · <span className="font-medium text-se-fresh-deep">{openShows.length} accepting entries</span>
              </span>
            )}
          </p>

          {/* ─── Entries open section ────────────── */}
          {openShows.length > 0 && (
            <div className="mb-8">
              <SecLabel>Accepting Entries</SecLabel>
              <div className="flex flex-col gap-3">
                {openShows.map((show, idx) => (
                  <ShowCard key={show.id} show={show} featured={idx === 0} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Other shows section ─────────────── */}
          {otherShows.length > 0 && (
            <div>
              {openShows.length > 0 && <SecLabel>Coming Soon</SecLabel>}
              <div className="flex flex-col gap-3">
                {otherShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Load More ─────────────────────────── */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <SEButton
                type="button"
                variant="ghost"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="gap-2"
              >
                {isLoadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                {isLoadingMore ? 'Loading...' : `Show More (${totalShows - filteredShows.length} remaining)`}
              </SEButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Show Card ─────────────────────────────────────── */

function ShowCard({
  show,
  distance,
  featured,
}: {
  show: ShowListItem;
  distance?: number;
  featured?: boolean;
}) {
  const pill = getStatusPill(show);
  const start = parseISO(show.startDate);
  const dayNum = format(start, 'd');
  const monthShort = format(start, 'MMM').toUpperCase();

  return (
    <Link href={`/shows/${show.slug ?? show.id}`} className="group block">
      <SECard
        className={cn(
          'flex gap-3 p-3.5 transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(27,36,29,0.06),0_22px_40px_-26px_rgba(27,36,29,0.5)]',
          featured && 'border-se-fresh-line'
        )}
      >
        {/* Date tile */}
        <div
          className={cn(
            'flex w-[58px] shrink-0 flex-col items-center self-start rounded-xl py-2.5',
            featured ? 'bg-se-fresh-soft' : 'bg-se-paper2'
          )}
        >
          <span
            className={cn(
              'text-2xl font-bold leading-[0.95]',
              featured ? 'text-se-fresh-deep' : 'text-se-ink'
            )}
          >
            {dayNum}
          </span>
          <span className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-se-ink3">
            {monthShort}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {show.organisation && (
            <h3 className="truncate text-[17px] font-bold leading-tight text-se-ink transition-colors group-hover:text-se-green">
              {show.organisation.name}
            </h3>
          )}
          <p className={cn('truncate text-[12.5px] text-se-ink3', show.organisation && 'mt-0.5')}>
            {show.name} · {displayShowTypeLabel(show.showType, show.showRuleset)}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Chip tone={pill.tone}>
              {pill.showPulse && <Pulse />}
              {pill.showClock && <Clock className="size-3" />}
              {pill.label}
            </Chip>

            {show.venue && (
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-se-ink2">
                <MapPin className="size-3 shrink-0 text-se-ink3" />
                <span className="truncate">{show.venue.name}</span>
              </span>
            )}

            {distance != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-se-fresh-deep">
                <Navigation className="size-3" />
                {distance} {show.venue ? 'mi' : 'miles away'}
              </span>
            )}

            {show.firstEntryFee != null && show.firstEntryFee > 0 && (
              <span className="ml-auto shrink-0 whitespace-nowrap text-[12.5px] text-se-ink2">
                from <b className="text-[15px] font-bold text-se-fresh-deep">{formatCurrency(show.firstEntryFee)}</b>
              </span>
            )}
          </div>
        </div>
      </SECard>
    </Link>
  );
}
