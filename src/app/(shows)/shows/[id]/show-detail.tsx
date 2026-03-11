'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  CalendarDays,
  MapPin,
  ChevronLeft,
  Clock,
  Loader2,
  Ticket,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Dog,
  Trophy,
  FileText,
  User,
  Award,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showTypeLabels } from '@/lib/show-types';
import { formatCurrency } from '@/lib/date-utils';
import { LiveEntryStats } from '@/components/show/live-entry-stats';
import { ShowShareDropdown } from '@/components/show/show-share-dropdown';
import { sanitizeFilename } from '@/lib/slugify';

/* ─── Show type badge colours ─────────────────── */

const showTypeMeta: Record<string, { bg: string }> = {
  companion:    { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  primary:      { bg: 'bg-sky-50 text-sky-700 border-sky-200' },
  limited:      { bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  open:         { bg: 'bg-violet-50 text-violet-700 border-violet-200' },
  premier_open: { bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  championship: { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

/* ─── Venue map ───────────────────────────────── */

function VenueMap({ lat, lng, name }: { lat: string; lng: string; name: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <iframe
        title={`Map of ${name}`}
        width="100%"
        height="200"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''}&q=${lat},${lng}&zoom=14`}
        allowFullScreen
      />
    </div>
  );
}

/* ─── Info row helper ─────────────────────────── */

function InfoRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${capitalize ? 'capitalize' : ''}`}>{value}</dd>
    </div>
  );
}

/* ─── Class column (Dogs / Bitches) ───────────── */

type ClassItem = {
  id: string;
  classNumber: number;
  classDefinition: { name: string; description: string | null; type: string };
};

function ClassColumn({
  title,
  classes,
  classSponsorMap,
}: {
  title: string;
  classes: ClassItem[];
  classSponsorMap: Map<string, { sponsorName: string; trophyName: string | null }>;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
        {title}
      </h4>
      <div className="space-y-0.5">
        {classes.map((sc) => {
          const sponsor = classSponsorMap.get(sc.id);
          return (
            <div key={sc.id}>
              <div className="flex items-baseline gap-2 py-0.5 text-sm">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground/60">
                  {sc.classNumber}
                </span>
                <span
                  className={`mt-1 size-1.5 shrink-0 self-start rounded-full ${
                    sc.classDefinition.type === 'age'
                      ? 'bg-sky-400'
                      : sc.classDefinition.type === 'achievement'
                        ? 'bg-amber-400'
                        : sc.classDefinition.type === 'junior_handler'
                          ? 'bg-emerald-400'
                          : 'bg-violet-400'
                  }`}
                />
                <span className="text-foreground/90">{sc.classDefinition.name}</span>
                <span className="sr-only">({sc.classDefinition.type.replace(/_/g, ' ')})</span>
              </div>
              {sponsor?.trophyName && (
                <div className="ml-[1.875rem] flex items-center gap-1 text-xs text-gold/80">
                  <Award className="size-3 shrink-0" />
                  <span className="truncate">{sponsor.trophyName}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Breed accordion ─────────────────────────── */

function BreedSection({
  breedName,
  classes,
  judgeName,
  ringName,
  classSponsorMap,
  defaultOpen,
}: {
  breedName: string;
  classes: Array<ClassItem & { sex: 'dog' | 'bitch' | null; entryFee: number }>;
  judgeName?: string | null;
  ringName?: string | null;
  classSponsorMap: Map<string, { sponsorName: string; trophyName: string | null }>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const dogClasses = classes.filter((c) => c.sex === 'dog');
  const bitchClasses = classes.filter((c) => c.sex === 'bitch');
  const mixedClasses = classes.filter((c) => c.sex === null);

  const sectionId = `breed-${breedName.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={sectionId}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
      >
        <Dog className="size-5 shrink-0 text-primary/40" />
        <div className="min-w-0 flex-1">
          <span className="font-serif text-base font-bold">{breedName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {classes.length} class{classes.length !== 1 ? 'es' : ''}
          </span>
        </div>
        {judgeName && (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <User className="size-3" />
            {judgeName}
          </span>
        )}
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/50" />
        )}
      </button>

      {open && (
        <div id={sectionId} className="border-t px-4 pb-4 pt-3">
          {/* Judge + ring on mobile */}
          {(judgeName || ringName) && (
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground sm:hidden">
              {judgeName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" /> {judgeName}
                </span>
              )}
              {ringName && <span>Ring: {ringName}</span>}
            </div>
          )}

          {dogClasses.length > 0 && bitchClasses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ClassColumn title="Dogs" classes={dogClasses} classSponsorMap={classSponsorMap} />
              <ClassColumn title="Bitches" classes={bitchClasses} classSponsorMap={classSponsorMap} />
            </div>
          ) : (
            <ClassColumn
              title={dogClasses.length > 0 ? 'Dogs' : bitchClasses.length > 0 ? 'Bitches' : 'Classes'}
              classes={classes}
              classSponsorMap={classSponsorMap}
            />
          )}

          {mixedClasses.length > 0 && (dogClasses.length > 0 || bitchClasses.length > 0) && (
            <div className="mt-3 border-t border-dashed pt-3">
              <ClassColumn title="Open to Both" classes={mixedClasses} classSponsorMap={classSponsorMap} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sponsor logo with optional link ─────────── */

function SponsorLogo({
  src,
  alt,
  href,
  className,
}: {
  src: string;
  alt: string;
  href?: string | null;
  className: string;
}) {
  const img = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`max-w-full object-contain ${className}`}
    />
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">
        {img}
      </a>
    );
  }
  return img;
}

/* ─── Main page ───────────────────────────────── */

export function ShowDetailClient() {
  const params = useParams();
  const idOrSlug = params.id as string;

  const [showStickyBar, setShowStickyBar] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  const { data: show, isLoading } = trpc.shows.getById.useQuery({
    id: idOrSlug,
  });
  const { data: showSponsors } = trpc.shows.getShowSponsors.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show?.id }
  );

  // URL segment for links — prefer slug over UUID
  const showSlug = (show as typeof show & { slug?: string | null })?.slug ?? idOrSlug;

  // Show sticky CTA bar after scrolling past the hero
  useEffect(() => {
    function handleScroll() {
      const next = window.scrollY > 300;
      setShowStickyBar((prev) => (prev === next ? prev : next));
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen" role="status">
        <span className="sr-only">Loading show details...</span>
        <div className="border-b bg-gradient-to-b from-primary/[0.08] to-transparent">
          <div className="mx-auto max-w-4xl px-3 pb-8 pt-6 sm:px-4 sm:pt-10 lg:px-6">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-6 space-y-3">
              <div className="flex gap-2">
                <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-[2px] w-14 bg-gold/30" />
              <div className="h-4 w-72 animate-pulse rounded bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            </div>
            <div className="mt-6 h-12 w-48 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Dog className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Show not found.</p>
        <Button variant="outline" asChild>
          <Link href="/shows">Back to shows</Link>
        </Button>
      </div>
    );
  }

  const closeDatePast = show.entryCloseDate
    ? new Date(show.entryCloseDate).getTime() < Date.now()
    : false;
  const isOpen = show.status === 'entries_open' && !closeDatePast;
  const hasResults = show.status === 'in_progress' || show.status === 'completed';
  const meta = showTypeMeta[show.showType];
  const showAny = show as typeof show & { startTime?: string | null; endTime?: string | null };
  const venue = show.venue as typeof show.venue & {
    address?: string | null;
    postcode?: string | null;
    lat?: string | null;
    lng?: string | null;
  };

  /* Group classes by breed */
  const breedMap = new Map<string, { groupSortOrder: number; classes: typeof show.showClasses }>();
  for (const sc of show.showClasses ?? []) {
    const name = sc.breed?.name ?? 'Any Breed';
    if (!breedMap.has(name)) {
      breedMap.set(name, { groupSortOrder: sc.breed?.group?.sortOrder ?? 999, classes: [] });
    }
    breedMap.get(name)!.classes.push(sc);
  }
  const breeds = Array.from(breedMap.entries()).sort(([a, aData], [b, bData]) => {
    if (aData.groupSortOrder !== bData.groupSortOrder) return aData.groupSortOrder - bData.groupSortOrder;
    return a.localeCompare(b);
  });

  /* Breed → judge/ring lookup */
  const breedJudgeMap = new Map<string, { judgeName: string; ringName?: string }>();
  let allBreedsJudge: { judgeName: string; ringName?: string } | null = null;
  for (const ja of show.judgeAssignments ?? []) {
    const info = {
      judgeName: ja.judge?.name ?? '',
      ringName: ja.ring ? `Ring ${ja.ring.number}` : undefined,
    };
    if (ja.breed) {
      breedJudgeMap.set(ja.breed.name, info);
    } else {
      allBreedsJudge = info;
    }
  }

  /* Sponsor grouping */
  const titleSponsors = showSponsors?.filter((s) => s.tier === 'title') ?? [];
  const showTierSponsors = showSponsors?.filter((s) => s.tier === 'show') ?? [];
  const otherSponsors = showSponsors?.filter((s) => s.tier !== 'title' && s.tier !== 'show') ?? [];

  /* Class ID → sponsor/trophy lookup */
  const classSponsorMap = new Map<string, { sponsorName: string; trophyName: string | null }>();
  for (const ss of showSponsors ?? []) {
    for (const cs of ss.classSponsorships) {
      const classId = cs.showClass?.id;
      if (classId) {
        classSponsorMap.set(classId, {
          sponsorName: ss.sponsor.name,
          trophyName: cs.trophyName,
        });
      }
    }
  }

  /* Unique judges */
  const uniqueJudges = [...new Set((show.judgeAssignments ?? []).map((ja) => ja.judge?.name).filter(Boolean))];

  return (
    <div className="min-h-screen">
      {/* ─── Hero header ──────────────────────── */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.08] to-transparent">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/[0.06] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-3 pb-4 pt-6 sm:px-4 sm:pb-8 sm:pt-10 lg:px-6">
          <Link
            href="/shows"
            className="inline-flex items-center gap-1 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            All shows
          </Link>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`border text-[11px] font-semibold uppercase tracking-wide ${meta?.bg ?? ''}`}
                >
                  {showTypeLabels[show.showType] ?? show.showType}
                </Badge>
                {isOpen && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                    </span>
                    Entries Open
                  </span>
                )}
                {!isOpen && (
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {(show.status === 'entries_open' && closeDatePast
                      ? 'Entries Closed'
                      : show.status
                    ).replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>

              {/* Org name — prominent, shown once */}
              {show.organisation && (
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-primary/70">
                  {show.organisation.name}
                </p>
              )}

              {/* Show name — billboard sized */}
              <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {show.name}
              </h1>

              {/* Gold rule — confident accent */}
              <div className="mt-3 h-[2px] w-14 bg-gold" />

              {/* Date, time, venue */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-muted-foreground/60" />
                  {format(parseISO(show.startDate), 'EEEE d MMMM yyyy')}
                  {show.startDate !== show.endDate &&
                    ` – ${format(parseISO(show.endDate), 'EEEE d MMMM yyyy')}`}
                </span>
                {showAny.startTime && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4 text-muted-foreground/60" />
                    {showAny.startTime}
                  </span>
                )}
              </div>
              {venue && (
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4 text-muted-foreground/60" />
                  {venue.name}
                  {venue.postcode && `, ${venue.postcode}`}
                </div>
              )}

              {/* Judge names — judges sell entries */}
              {uniqueJudges.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-sm">
                  <User className="size-4 text-muted-foreground/60" />
                  <span className="text-muted-foreground">Judge:</span>
                  <span className="font-serif font-medium">{uniqueJudges.join(', ')}</span>
                </div>
              )}

              {/* Title sponsor inline */}
              {titleSponsors.length > 0 && (
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground/50">
                    {titleSponsors[0].customTitle ?? 'Sponsored by'}
                  </span>
                  {titleSponsors[0].sponsor.logoUrl ? (
                    <SponsorLogo
                      src={titleSponsors[0].sponsor.logoUrl}
                      alt={titleSponsors[0].sponsor.name}
                      href={titleSponsors[0].sponsor.website}
                      className="h-7"
                    />
                  ) : (
                    <span className="font-serif text-sm font-medium text-foreground">
                      {titleSponsors[0].sponsor.name}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* CTA buttons — primary prominent, secondary compact */}
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              {isOpen && (
                <Button size="lg" className="h-12 w-full text-base shadow-sm sm:w-auto" asChild>
                  <Link href={`/shows/${showSlug}/enter`}>
                    <Ticket className="size-5" />
                    Enter This Show
                  </Link>
                </Button>
              )}
              <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-initial">
                {hasResults && (
                  <Button
                    variant={isOpen ? 'outline' : 'default'}
                    asChild
                  >
                    <Link href={`/shows/${showSlug}/results`}>
                      <Trophy className="size-4" />
                      {show.status === 'in_progress' ? 'Live Results' : 'Results'}
                    </Link>
                  </Button>
                )}
                {(show.showClasses?.length ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    disabled={generatingSchedule}
                    onClick={async () => {
                      setGeneratingSchedule(true);
                      try {
                        const res = await fetch(`/api/schedule/${show.id}`);
                        if (!res.ok) throw new Error('Failed to generate schedule');
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${sanitizeFilename(show.name)}-Schedule.pdf`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      } catch {
                        if (show.scheduleUrl) {
                          window.open(show.scheduleUrl, '_blank');
                        } else {
                          alert('Unable to generate schedule. Please try again.');
                        }
                      } finally {
                        setGeneratingSchedule(false);
                      }
                    }}
                  >
                    {generatingSchedule ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    {generatingSchedule ? 'Generating...' : 'Schedule'}
                  </Button>
                )}
                <ShowShareDropdown
                  showName={show.name}
                  showType={showTypeLabels[show.showType] ?? show.showType}
                  showDate={format(parseISO(show.startDate), 'd MMMM yyyy')}
                  organisationName={show.organisation?.name ?? ''}
                  venueName={show.venue?.name}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Description — editorial treatment */}
          {show.description && (
            <div className="mt-5 border-l-2 border-gold/30 pl-4 sm:pl-5">
              <p className={`max-w-2xl leading-relaxed text-muted-foreground ${!descExpanded ? 'line-clamp-3 sm:line-clamp-none' : ''}`}>
                {show.description}
              </p>
              {show.description.length > 120 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-1 text-xs font-medium text-primary hover:underline sm:hidden"
                >
                  {descExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Content ──────────────────────────── */}
      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-12 lg:px-6">
        {/* Live entry stats + countdown */}
        {show.status !== 'draft' && show.status !== 'published' && (
          <div className="mb-4 sm:mb-8">
            <LiveEntryStats showId={show.id} />
          </div>
        )}

        {/* Info cards row */}
        <div className={`grid grid-cols-1 gap-5 ${venue ? 'sm:grid-cols-2' : ''}`}>
          {/* Show information */}
          <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
            <h2 className="gold-rule font-serif text-sm font-semibold text-foreground">
              Show Details
            </h2>
            <dl className="mt-5 space-y-2.5 text-sm">
              <InfoRow label="Type" value={showTypeLabels[show.showType] ?? show.showType} />
              <InfoRow label="Scope" value={show.showScope.replace(/_/g, ' ')} capitalize />
              {show.kcLicenceNo && <InfoRow label="RKC Licence" value={show.kcLicenceNo} />}
              {show.entryCloseDate && (
                <InfoRow
                  label="Entries Close"
                  value={format(new Date(show.entryCloseDate), 'dd MMM yyyy, HH:mm')}
                />
              )}
              {breeds.length > 0 && <InfoRow label="Breeds" value={String(breeds.length)} />}
              {show.showClasses && show.showClasses.length > 0 && (
                <InfoRow label="Total Classes" value={String(show.showClasses.length)} />
              )}
              {show.firstEntryFee != null && show.firstEntryFee > 0 && (
                <InfoRow label="Entry Fee" value={formatCurrency(show.firstEntryFee)} />
              )}
              {show.subsequentEntryFee != null &&
                show.subsequentEntryFee > 0 &&
                show.subsequentEntryFee !== show.firstEntryFee && (
                  <InfoRow label="Subsequent Entry" value={formatCurrency(show.subsequentEntryFee)} />
                )}
              {show.secretaryEmail && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Secretary</dt>
                  <dd>
                    <a
                      href={`mailto:${show.secretaryEmail}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {show.secretaryName ?? show.secretaryEmail}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Venue card */}
          {venue && (
            <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
              <h2 className="gold-rule font-serif text-sm font-semibold text-foreground">
                Venue
              </h2>
              <div className="mt-5 space-y-3">
                <div>
                  <p className="font-semibold">{venue.name}</p>
                  {venue.address && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{venue.address}</p>
                  )}
                  {venue.postcode && (
                    <p className="text-sm text-muted-foreground">{venue.postcode}</p>
                  )}
                </div>
                {venue.lat && venue.lng && (
                  <VenueMap lat={venue.lat} lng={venue.lng} name={venue.name} />
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    venue.lat && venue.lng ? `${venue.lat},${venue.lng}` : venue.postcode ?? venue.name
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 py-1.5 text-sm text-primary hover:underline"
                >
                  <MapPin className="size-3.5" />
                  Get directions
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ─── Our Partners ───────────────────────── */}
        {showSponsors && showSponsors.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gold/20" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/70">
                Our Partners
              </h2>
              <div className="h-px flex-1 bg-gold/20" />
            </div>

            <div className="mt-5 rounded-xl border border-gold/20 bg-gradient-to-b from-amber-50/50 to-transparent p-5 sm:p-8">
              {/* Title sponsors — prominent */}
              {titleSponsors.length > 0 && (
                <div className="text-center">
                  {titleSponsors.map((ts) => (
                    <div key={ts.id}>
                      {ts.customTitle && (
                        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground/60">
                          {ts.customTitle}
                        </p>
                      )}
                      <div className="mt-3 flex justify-center">
                        {ts.sponsor.logoUrl ? (
                          <SponsorLogo
                            src={ts.sponsor.logoUrl}
                            alt={ts.sponsor.name}
                            href={ts.sponsor.website}
                            className="h-14 sm:h-16"
                          />
                        ) : (
                          <span className="font-serif text-xl font-bold">{ts.sponsor.name}</span>
                        )}
                      </div>
                      {ts.specialPrizes && (
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          {ts.specialPrizes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Show-tier sponsors */}
              {showTierSponsors.length > 0 && (
                <>
                  {titleSponsors.length > 0 && <div className="my-5 h-px bg-gold/10" />}
                  <div className="flex flex-wrap items-center justify-center gap-8">
                    {showTierSponsors.map((ss) => (
                      <div key={ss.id} className="flex flex-col items-center gap-2 text-center">
                        {ss.sponsor.logoUrl ? (
                          <SponsorLogo
                            src={ss.sponsor.logoUrl}
                            alt={ss.sponsor.name}
                            href={ss.sponsor.website}
                            className="h-10"
                          />
                        ) : (
                          <span className="font-serif text-sm font-medium">{ss.sponsor.name}</span>
                        )}
                        {ss.customTitle && (
                          <span className="text-xs uppercase tracking-wider text-muted-foreground/60">
                            {ss.customTitle}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Other sponsors */}
              {otherSponsors.length > 0 && (
                <>
                  {(titleSponsors.length > 0 || showTierSponsors.length > 0) && (
                    <div className="my-5 h-px bg-gold/10" />
                  )}
                  <p className="text-center text-xs text-muted-foreground/60">
                    Also supported by{' '}
                    <span className="text-foreground/70">
                      {otherSponsors.map((s) => s.sponsor.name).join(' \u00b7 ')}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Classification ─────────────────────── */}
        {breeds.length > 0 && (
          <div className="mt-10">
            <h2 className="gold-rule font-serif text-lg font-bold">
              {breeds.length === 1 ? 'Classification' : `Breeds (${breeds.length})`}
            </h2>

            <div className="mt-5 space-y-3">
              {breeds.map(([breedName, { classes }], i) => {
                const judgeInfo = breedJudgeMap.get(breedName) ?? allBreedsJudge;
                return (
                  <BreedSection
                    key={breedName}
                    breedName={breedName}
                    classes={
                      classes as Array<
                        ClassItem & { sex: 'dog' | 'bitch' | null; entryFee: number }
                      >
                    }
                    judgeName={judgeInfo?.judgeName}
                    ringName={judgeInfo?.ringName}
                    classSponsorMap={classSponsorMap}
                    defaultOpen={breeds.length <= 2 || i === 0}
                  />
                );
              })}
            </div>

            {/* Class type legend — shown once below all breeds */}
            <div className="mt-3 flex flex-wrap gap-3 px-1 text-xs text-muted-foreground/60">
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-400" /> Age</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /> Achievement</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" /> Junior Handler</span>
            </div>

            {isOpen && (
              <div className="mt-8 text-center">
                <Button size="lg" className="shadow-sm" asChild>
                  <Link href={`/shows/${showSlug}/enter`}>
                    <Ticket className="size-4" />
                    Enter This Show
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Bottom spacer for sticky bar */}
        {isOpen && <div className="h-20 sm:hidden" />}
      </div>

      {/* ─── Sticky mobile CTA bar ──────────────── */}
      {isOpen && showStickyBar && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pr-16 backdrop-blur-lg sm:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button size="lg" className="h-12 w-full text-base shadow-lg" asChild>
            <Link href={`/shows/${showSlug}/enter`}>
              <Ticket className="size-5" />
              Enter This Show
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
