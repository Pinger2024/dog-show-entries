'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { formatDateRange } from '@/lib/date-utils';
import {
  CalendarDays,
  MapPin,
  Building2,
  Search,
  Loader2,
  Ticket,
  ArrowRight,
  Dog,
  X,
  Navigation,
  Locate,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ─── Show type config ──────────────────────────────── */

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

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
  onClearSearch,
  onClearShowType,
  onClearStatus,
}: {
  search: string;
  showType: string;
  status: string;
  onClearSearch: () => void;
  onClearShowType: () => void;
  onClearStatus: () => void;
}) {
  const hasFilters = search || showType !== 'all' || status !== 'all';
  if (!hasFilters) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
      {search && (
        <button
          onClick={onClearSearch}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          &ldquo;{search}&rdquo;
          <X className="size-3" />
        </button>
      )}
      {showType !== 'all' && (
        <button
          onClick={onClearShowType}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {showTypeLabels[showType]}
          <X className="size-3" />
        </button>
      )}
      {status !== 'all' && (
        <button
          onClick={onClearStatus}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {statusLabels[status]}
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
              className="h-10 flex-1 rounded-lg border-border/60 bg-white"
            />
            <Button
              size="sm"
              onClick={onPostcodeSubmit}
              disabled={!postcode.trim()}
              className="h-10 px-4"
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

export default function ShowsList() {
  const [search, setSearch] = useState('');
  const [showType, setShowType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  // Near Me state
  const [nearMeActive, setNearMeActive] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [breedId, setBreedId] = useState<string>('all');
  const [postcode, setPostcode] = useState('');
  const [postcodeError, setPostcodeError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Standard list query (only when near me is not active)
  const { data, isLoading } = trpc.shows.list.useQuery(
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
      limit: 50,
    },
    { enabled: !nearMeActive || !location },
  );

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

  // Determine which data to show
  const isNearMeMode = nearMeActive && !!location;
  const currentLoading = isNearMeMode ? isNearbyLoading : isLoading;

  // Standard list shows
  const listShows = data?.items ?? [];
  const filteredShows = search
    ? listShows.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.organisation?.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.venue?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : listShows;

  /* Split into entries-open vs others for visual grouping */
  const openShows = filteredShows.filter((s) => s.status === 'entries_open');
  const otherShows = filteredShows.filter((s) => s.status !== 'entries_open');

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
        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
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
          onClearSearch={() => setSearch('')}
          onClearShowType={() => setShowType('all')}
          onClearStatus={() => setStatus('all')}
        />
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
          <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-muted">
              <MapPin className="size-10 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-lg font-semibold">No shows nearby</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try increasing the search radius or check back later
              </p>
            </div>
          </div>
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
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted">
            <Dog className="size-10 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-lg font-semibold">No shows found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || showType !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Check back soon for upcoming shows'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Results count ───────────────────── */}
          <p className="mb-6 text-sm text-muted-foreground">
            {filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}
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
        </>
      )}
    </>
  );
}

/* ─── Show Card ─────────────────────────────────────── */

function ShowCard({ show, distance }: { show: {
  id: string;
  name: string;
  showType: string;
  status: string;
  startDate: string;
  endDate: string;
  entriesOpenDate: string | Date | null;
  entryCloseDate: string | Date | null;
  organisation: { name: string } | null;
  venue: { name: string } | null;
}; distance?: number }) {
  const meta = showTypeMeta[show.showType];
  const isOpen = show.status === 'entries_open';

  return (
    <Link href={`/shows/${show.id}`} className="group block">
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

          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-[15px]">
            {show.name}
          </h3>

          {/* Organisation */}
          {show.organisation && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{show.organisation.name}</span>
            </p>
          )}

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
                    {statusLabels[show.status] ?? show.status}
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
