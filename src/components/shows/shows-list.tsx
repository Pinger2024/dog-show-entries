'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, differenceInDays } from 'date-fns';
import { formatDateRange, formatCurrency } from '@/lib/date-utils';
import { showTypeLabels } from '@/lib/show-types';
import {
  CalendarDays,
  MapPin,
  Search,
  Loader2,
  Ticket,
  ArrowRight,
  Dog,
  X,
  Navigation,
  Locate,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  status: string;
  startDate: string;
  endDate: string;
  entriesOpenDate: string | Date | null;
  entryCloseDate: string | Date | null;
  organisation: { name: string } | null;
  venue: { name: string } | null;
};

/* ─── Show type config ──────────────────────────────── */

const showTypeMeta: Record<string, { accent: string; bg: string; ring: string }> = {
  companion:    { accent: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200' },
  primary:      { accent: 'bg-sky-500',     bg: 'bg-sky-50 text-sky-700',         ring: 'ring-sky-200' },
  limited:      { accent: 'bg-amber-500',   bg: 'bg-amber-50 text-amber-700',     ring: 'ring-amber-200' },
  open:         { accent: 'bg-violet-500',   bg: 'bg-violet-50 text-violet-700',   ring: 'ring-violet-200' },
  premier_open: { accent: 'bg-rose-500',     bg: 'bg-rose-50 text-rose-700',       ring: 'ring-rose-200' },
  championship: { accent: 'bg-indigo-600',   bg: 'bg-indigo-50 text-indigo-700',   ring: 'ring-indigo-200' },
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

/* ─── Closing countdown ─────────────────────────────── */

function ClosingCountdown({ date }: { date: string | Date | null }) {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const days = differenceInDays(d, new Date());

  if (days < 0)
    return (
      <span className="text-xs font-medium text-destructive/80">Closed</span>
    );
  if (days === 0)
    return (
      <span className="animate-pulse text-xs font-semibold text-destructive">
        Closing today!
      </span>
    );
  if (days <= 7)
    return (
      <span className="text-xs font-semibold text-amber-600">
        {days}d left to enter
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">
      Closes {format(d, 'dd MMM')}
    </span>
  );
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
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
      {search && (
        <button
          onClick={onClearSearch}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 min-h-[2.75rem] text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          &ldquo;{search}&rdquo;
          <X className="size-3" />
        </button>
      )}
      {showType !== 'all' && (
        <button
          onClick={onClearShowType}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 min-h-[2.75rem] text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {showTypeLabels[showType]}
          <X className="size-3" />
        </button>
      )}
      {status !== 'all' && (
        <button
          onClick={onClearStatus}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 min-h-[2.75rem] text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {statusLabels[status]}
          <X className="size-3" />
        </button>
      )}
      {breedName && (
        <button
          onClick={onClearBreed}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 min-h-[2.75rem] text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {breedName}
          <X className="size-3" />
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
    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Near Me</span>
        </div>
        <button
          onClick={onDisable}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Location input */}
      {!location && (
        <div className="space-y-3">
          <Button
            variant="outline"
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
          </Button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter postcode (e.g. G1 1AA)"
              value={postcode}
              onChange={(e) => onPostcodeChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onPostcodeSubmit();
              }}
              className="h-11 flex-1 rounded-lg border-border/60 bg-white"
            />
            <Button
              size="sm"
              onClick={onPostcodeSubmit}
              disabled={!postcode.trim()}
              className="h-11 px-4"
            >
              Search
            </Button>
          </div>
          {postcodeError && (
            <p className="text-xs text-destructive">{postcodeError}</p>
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
            <SelectTrigger className="h-9 w-full rounded-lg border-border/60 bg-white shadow-sm sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {radiusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {breeds && breeds.length > 0 && (
            <Select value={breedId} onValueChange={onBreedChange}>
              <SelectTrigger className="h-9 w-full rounded-lg border-border/60 bg-white shadow-sm sm:w-[200px]">
                <SelectValue placeholder="Any breed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any breed</SelectItem>
                {breeds.map((breed) => (
                  <SelectItem key={breed.id} value={breed.id}>
                    {breed.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onDisable}
            className="h-9 text-xs text-muted-foreground"
          >
            Clear location
          </Button>
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
          ? (status as
              | 'draft'
              | 'published'
              | 'entries_open'
              | 'entries_closed'
              | 'in_progress'
              | 'completed'
              | 'cancelled')
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
    <>
      {/* ─── Filters ─────────────────────────────── */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search shows, venues, societies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-sm transition-shadow focus-visible:shadow-md"
            disabled={isNearMeMode}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <Select value={showType} onValueChange={setShowType} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-xl border-border/60 bg-white shadow-sm sm:w-[170px]">
              <SelectValue placeholder="Show Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(showTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-xl border-border/60 bg-white shadow-sm sm:w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={breedId} onValueChange={setBreedId} disabled={isNearMeMode}>
            <SelectTrigger className="h-11 w-full rounded-xl border-border/60 bg-white shadow-sm sm:w-[200px]">
              <SelectValue placeholder="Breed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Breeds</SelectItem>
              {breeds?.map((breed) => (
                <SelectItem key={breed.id} value={breed.id}>
                  {breed.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Near Me toggle button */}
          <Button
            variant={nearMeActive ? 'default' : 'outline'}
            onClick={nearMeActive ? handleDisableNearMe : handleEnableNearMe}
            className={`h-11 gap-2 rounded-xl shadow-sm ${
              nearMeActive
                ? 'bg-primary text-primary-foreground'
                : 'border-border/60 bg-white'
            }`}
          >
            <Navigation className="size-4" />
            <span className="hidden sm:inline">Near Me</span>
          </Button>
        </div>
      </div>

      {/* Clear filters */}
      {(search || showType !== 'all' || status !== 'all' || breedId !== 'all') && !nearMeActive && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setShowType('all');
              setStatus('all');
              setBreedId('all');
            }}
            className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
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
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 sm:items-center sm:px-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Showing shows for your breeds
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {userBreedNames.join(', ')}
            </p>
          </div>
          <button
            onClick={() => setAutoBreedFilter(false)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent min-h-[2.75rem] sm:min-h-0"
          >
            Show all
          </button>
        </div>
      )}

      {/* ─── Loading ─────────────────────────────── */}
      {currentLoading ? (
        <div className="flex min-h-[45vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">
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
            <p className="mb-6 text-sm text-muted-foreground">
              {nearbyShows.length} show{nearbyShows.length !== 1 ? 's' : ''} within {radiusMiles} miles
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {nearbyShows.map((show) => (
                <ShowCard
                  key={show.id}
                  show={{
                    id: show.id,
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
          <p className="mb-6 text-sm text-muted-foreground">
            {totalShows > filteredShows.length
              ? `Showing ${filteredShows.length} of ${totalShows} show${totalShows !== 1 ? 's' : ''}`
              : `${filteredShows.length} show${filteredShows.length !== 1 ? 's' : ''}`}
            {openShows.length > 0 && (
              <span className="ml-1">
                · <span className="font-medium text-emerald-600">{openShows.length} accepting entries</span>
              </span>
            )}
          </p>

          {/* ─── Entries open section ────────────── */}
          {openShows.length > 0 && (
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                  Accepting Entries
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {openShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Other shows section ─────────────── */}
          {otherShows.length > 0 && (
            <div>
              {openShows.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-muted-foreground/30" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                    Coming Soon
                  </h2>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {otherShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Load More ─────────────────────────── */}
          {hasMore && (
            <div className="mt-10 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="h-12 gap-2 rounded-xl px-8"
              >
                {isLoadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                {isLoadingMore ? 'Loading...' : `Show More (${totalShows - filteredShows.length} remaining)`}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ─── Show Card ─────────────────────────────────────── */

function ShowCard({ show, distance }: { show: ShowListItem; distance?: number }) {
  const meta = showTypeMeta[show.showType];
  // Entries are only "open" if the status says so AND the close date hasn't passed
  const isOpen = show.status === 'entries_open' && !isEntryCloseDatePast(show.entryCloseDate);

  return (
    <Link href={`/shows/${show.slug ?? show.id}`} className="group block">
      <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm transition-all duration-200 hover:border-border hover:shadow-md">
        {/* Colored top accent bar */}
        <div className={`h-1 w-full ${meta?.accent ?? 'bg-gray-300'}`} />

        <div className="flex flex-1 flex-col p-3 sm:p-4 lg:p-5">
          {/* Header: type badge + status */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className={`text-[11px] font-semibold uppercase tracking-wide ${meta?.bg ?? ''}`}
            >
              {showTypeLabels[show.showType] ?? show.showType}
            </Badge>
            {isOpen && (
              <ClosingCountdown date={show.entryCloseDate} />
            )}
          </div>

          {/* Host club — primary anchor so it's unmistakable who's running the show */}
          {show.organisation && (
            <h3 className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-base">
              {show.organisation.name}
            </h3>
          )}

          {/* Show name — secondary, descriptive */}
          <p className={`line-clamp-2 text-xs font-medium leading-snug text-muted-foreground sm:text-[13px] ${show.organisation ? 'mt-1' : ''}`}>
            {show.name}
          </p>

          {/* Spacer pushes date/venue to bottom */}
          <div className="mt-auto pt-4">
            <div className="space-y-1.5 border-t border-dashed border-border/60 pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span>{formatDateRange(show.startDate, show.endDate)}</span>
              </div>
              {show.venue && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{show.venue.name}</span>
                  </div>
                  {distance != null && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Navigation className="size-3" />
                      {distance} mi
                    </span>
                  )}
                </div>
              )}
              {/* Show distance even if no venue name (shouldn't happen for nearby, but safety) */}
              {distance != null && !show.venue && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Navigation className="size-3.5 shrink-0 text-primary/60" />
                  <span className="font-medium text-primary">{distance} miles away</span>
                </div>
              )}
            </div>
          </div>

          {/* Entry fee */}
          {show.firstEntryFee != null && show.firstEntryFee > 0 && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              From {formatCurrency(show.firstEntryFee)} per entry
            </p>
          )}

          {/* Footer action indicator */}
          <div className="mt-4">
            {isOpen ? (
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20">
                  <Ticket className="size-3" />
                  Enter Now
                </span>
                <ArrowRight className="size-4 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className="w-fit text-[11px] font-medium">
                    {show.status === 'entries_open' && isEntryCloseDatePast(show.entryCloseDate)
                      ? 'Entries Closed'
                      : (statusLabels[show.status] ?? show.status)}
                  </Badge>
                  {show.status === 'published' && show.entriesOpenDate && (
                    <span className="text-[11px] text-muted-foreground">
                      Entries open {format(new Date(show.entriesOpenDate), 'd MMM yyyy')}
                    </span>
                  )}
                </div>
                <ArrowRight className="size-4 text-muted-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
