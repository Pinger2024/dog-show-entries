'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  CalendarDays,
  MapPin,
  Building2,
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
  ListChecks,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

const showTypeMeta: Record<string, { accent: string; bg: string }> = {
  companion:    { accent: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  primary:      { accent: 'bg-sky-500',     bg: 'bg-sky-50 text-sky-700' },
  limited:      { accent: 'bg-amber-500',   bg: 'bg-amber-50 text-amber-700' },
  open:         { accent: 'bg-violet-500',   bg: 'bg-violet-50 text-violet-700' },
  premier_open: { accent: 'bg-rose-500',     bg: 'bg-rose-50 text-rose-700' },
  championship: { accent: 'bg-indigo-600',   bg: 'bg-indigo-50 text-indigo-700' },
};

/* ─── Venue map ─────────────────────────────────────── */

function VenueMap({ lat, lng, name }: { lat: string; lng: string; name: string }) {
  const q = encodeURIComponent(`${name}, ${lat},${lng}`);
  return (
    <div className="overflow-hidden rounded-lg border">
      <iframe
        title={`Map of ${name}`}
        width="100%"
        height="220"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''}&q=${lat},${lng}&zoom=14`}
        allowFullScreen
      />
    </div>
  );
}

/* ─── Breed accordion ──────────────────────────────── */

function BreedSection({
  breedName,
  classes,
  judgeName,
  ringName,
  defaultOpen,
}: {
  breedName: string;
  classes: { id: string; classDefinition: { name: string; description: string | null; type: string }; entryFee: number }[];
  judgeName?: string | null;
  ringName?: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fee = classes[0]?.entryFee ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/30 sm:gap-3 sm:px-4"
      >
        <Dog className="size-5 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm">{breedName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {classes.length} class{classes.length !== 1 ? 'es' : ''}
          </span>
          {judgeName && (
            <span className="ml-2 text-xs text-muted-foreground">
              · Judge: {judgeName}
            </span>
          )}
        </div>
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {formatFee(fee)}/class
        </span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {open && (
        <div className="border-t border-dashed px-4 py-2">
          {(judgeName || ringName) && (
            <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {judgeName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" /> {judgeName}
                </span>
              )}
              {ringName && (
                <span className="flex items-center gap-1">
                  Ring: {ringName}
                </span>
              )}
              <span>{formatFee(fee)} per class</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
            {classes.map((sc) => (
              <div
                key={sc.id}
                className="flex items-center gap-1.5 py-1 text-xs"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${
                  sc.classDefinition.type === 'age'
                    ? 'bg-sky-400'
                    : sc.classDefinition.type === 'achievement'
                      ? 'bg-amber-400'
                      : 'bg-violet-400'
                }`} />
                <span className="text-muted-foreground">{sc.classDefinition.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 border-t border-dashed pt-2 text-[10px] text-muted-foreground/70">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-400" /> Age</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /> Achievement</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────── */

export default function ShowDetailPage() {
  const params = useParams();
  const showId = params.id as string;

  const { data: show, isLoading } = trpc.shows.getById.useQuery({
    id: showId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary/40" />
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

  const isOpen = show.status === 'entries_open';
  const hasResults = show.status === 'in_progress' || show.status === 'completed';
  const meta = showTypeMeta[show.showType];

  /* Group classes by breed */
  const breedMap = new Map<string, typeof show.showClasses>();
  for (const sc of show.showClasses ?? []) {
    const name = sc.breed?.name ?? 'Any Breed';
    if (!breedMap.has(name)) breedMap.set(name, []);
    breedMap.get(name)!.push(sc);
  }
  const breeds = Array.from(breedMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  /* Build breed → judge/ring lookup from judge assignments */
  const breedJudgeMap = new Map<string, { judgeName: string; ringName?: string }>();
  for (const ja of show.judgeAssignments ?? []) {
    if (ja.breed) {
      breedJudgeMap.set(ja.breed.name, {
        judgeName: ja.judge?.name ?? '',
        ringName: ja.ring?.name ?? undefined,
      });
    }
  }

  const showAny = show as typeof show & { startTime?: string | null; endTime?: string | null };

  return (
    <div className="min-h-screen">
      {/* ─── Hero header ──────────────────────── */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/[0.06] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-3 pb-8 pt-6 sm:px-4 sm:pt-10 lg:px-6">
          <Link
            href="/shows"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            All shows
          </Link>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={`text-[11px] font-semibold uppercase tracking-wide ${meta?.bg ?? ''}`}
                >
                  {showTypeLabels[show.showType] ?? show.showType}
                </Badge>
                {isOpen && (
                  <Badge className="bg-emerald-600 text-[11px]">
                    <Ticket className="mr-1 size-3" />
                    Entries Open
                  </Badge>
                )}
                {!isOpen && (
                  <Badge variant="outline" className="text-[11px]">
                    {show.status.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 font-serif text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">
                {show.name}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
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
                    {showAny.endTime && ` – ${showAny.endTime}`}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                {show.venue && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-muted-foreground/60" />
                    {show.venue.name}
                    {(show.venue as typeof show.venue & { postcode?: string }).postcode &&
                      `, ${(show.venue as typeof show.venue & { postcode?: string }).postcode}`}
                  </span>
                )}
                {show.organisation && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="size-4 text-muted-foreground/60" />
                    {show.organisation.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              {isOpen && (
                <Button size="lg" className="h-11 w-full shadow-sm sm:w-auto" asChild>
                  <Link href={`/shows/${showId}/enter`}>
                    <Ticket className="size-4" />
                    Enter This Show
                  </Link>
                </Button>
              )}
              {hasResults && (
                <Button size="lg" variant={isOpen ? 'outline' : 'default'} className="h-11 w-full shadow-sm sm:w-auto" asChild>
                  <Link href={`/shows/${showId}/results`}>
                    <Trophy className="size-4" />
                    {show.status === 'in_progress' ? 'Live Results' : 'View Results'}
                  </Link>
                </Button>
              )}
              {show.scheduleUrl && (
                <Button size="lg" variant="outline" className="h-11 w-full shadow-sm sm:w-auto" asChild>
                  <a href={show.scheduleUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="size-4" />
                    Schedule PDF
                  </a>
                </Button>
              )}
            </div>
          </div>

          {show.description && (
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              {show.description}
            </p>
          )}
        </div>
      </div>

      {/* ─── Content ──────────────────────────── */}
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8 lg:px-6">
        {/* Info cards row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {/* Show information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Show Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{showTypeLabels[show.showType] ?? show.showType}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">Scope</span>
                <span className="font-medium capitalize">{show.showScope.replace(/_/g, ' ')}</span>
              </div>
              {show.kcLicenceNo && (
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-muted-foreground">KC Licence</span>
                  <span className="font-medium">{show.kcLicenceNo}</span>
                </div>
              )}
              {show.entryCloseDate && (
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-muted-foreground">Entries Close</span>
                  <span className="font-medium">
                    {format(new Date(show.entryCloseDate), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
              )}
              {breeds.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-muted-foreground">Breeds</span>
                  <span className="font-medium">{breeds.length}</span>
                </div>
              )}
              {show.showClasses && show.showClasses.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-muted-foreground">Total Classes</span>
                  <span className="font-medium">{show.showClasses.length}</span>
                </div>
              )}
              {show.judgeAssignments && show.judgeAssignments.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-muted-foreground">Judges</span>
                  <span className="font-medium">{show.judgeAssignments.length}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Venue card with map */}
          {show.venue && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Venue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-semibold">{show.venue.name}</p>
                  {(show.venue as typeof show.venue & { address?: string }).address && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {(show.venue as typeof show.venue & { address?: string }).address}
                    </p>
                  )}
                  {(show.venue as typeof show.venue & { postcode?: string }).postcode && (
                    <p className="text-sm text-muted-foreground">
                      {(show.venue as typeof show.venue & { postcode?: string }).postcode}
                    </p>
                  )}
                </div>
                {(() => {
                  const v = show.venue as typeof show.venue & { lat?: string | null; lng?: string | null };
                  return v.lat && v.lng ? (
                    <VenueMap lat={v.lat} lng={v.lng} name={show.venue.name} />
                  ) : null;
                })()}
                {(() => {
                  const v = show.venue as typeof show.venue & { lat?: string | null; lng?: string | null; postcode?: string | null };
                  const query = v.lat && v.lng
                    ? `${v.lat},${v.lng}`
                    : v.postcode ?? show.venue.name;
                  return (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <MapPin className="size-3.5" />
                      Get directions
                      <ExternalLink className="size-3" />
                    </a>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        <Separator className="my-8" />

        {/* ─── Breeds / Classes ─────────────────── */}
        {breeds.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">
              Breeds ({breeds.length})
            </h2>
            <div className="space-y-2">
              {breeds.map(([breedName, classes], i) => {
                const judgeInfo = breedJudgeMap.get(breedName);
                return (
                  <BreedSection
                    key={breedName}
                    breedName={breedName}
                    classes={classes as { id: string; classDefinition: { name: string; description: string | null; type: string }; entryFee: number }[]}
                    judgeName={judgeInfo?.judgeName}
                    ringName={judgeInfo?.ringName}
                    defaultOpen={i === 0}
                  />
                );
              })}
            </div>

            {isOpen && (
              <div className="mt-8 text-center">
                <Button size="lg" className="shadow-sm" asChild>
                  <Link href={`/shows/${showId}/enter`}>
                    <Ticket className="size-4" />
                    Enter This Show
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
