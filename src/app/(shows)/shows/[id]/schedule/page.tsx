'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Download,
  Gavel,
  Loader2,
  MapPin,
  PoundSterling,
  Ticket,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatCurrency } from '@/lib/date-utils';
import { showTypeLabels } from '@/lib/show-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ScheduleData } from '@/server/db/schema/shows';

/** Parse a date string as local (not UTC) — avoids off-by-one from ISO parsing */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const showScopeLabels: Record<string, string> = {
  general: 'All-Breed',
  single_breed: 'Single Breed',
};

export default function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: show, isLoading } = trpc.shows.getById.useQuery({ id });

  const breedGroups = useMemo(() => {
    if (!show?.showClasses) return [];
    const map = new Map<string, {
      groupSortOrder: number;
      judgeNames: string[];
      dogClasses: typeof show.showClasses;
      bitchClasses: typeof show.showClasses;
      combinedClasses: typeof show.showClasses;
    }>();

    for (const sc of show.showClasses) {
      const breedName = sc.breed?.name ?? 'Any Breed';
      if (!map.has(breedName)) {
        map.set(breedName, {
          groupSortOrder: sc.breed?.group?.sortOrder ?? 999,
          judgeNames: [],
          dogClasses: [],
          bitchClasses: [],
          combinedClasses: [],
        });
      }
      const group = map.get(breedName)!;
      const sex = sc.classDefinition?.sex;
      if (sex === 'dog') group.dogClasses.push(sc);
      else if (sex === 'bitch') group.bitchClasses.push(sc);
      else group.combinedClasses.push(sc);
    }

    // Attach judge names from assignments
    for (const ja of show.judgeAssignments ?? []) {
      const breedName = ja.breed?.name;
      const judgeName = ja.judge?.name;
      if (breedName && judgeName && map.has(breedName)) {
        const group = map.get(breedName)!;
        if (!group.judgeNames.includes(judgeName)) {
          group.judgeNames.push(judgeName);
        }
      } else if (!breedName && judgeName) {
        // All-breeds judge — add to every breed
        for (const group of map.values()) {
          if (!group.judgeNames.includes(judgeName)) {
            group.judgeNames.push(judgeName);
          }
        }
      }
    }

    return Array.from(map.entries())
      .sort(([a, aData], [b, bData]) => {
        if (aData.groupSortOrder !== bData.groupSortOrder)
          return aData.groupSortOrder - bData.groupSortOrder;
        return a.localeCompare(b);
      });
  }, [show?.showClasses, show?.judgeAssignments]);

  // Unique judges
  const judges = useMemo(() => {
    if (!show?.judgeAssignments) return [];
    const seen = new Map<string, string[]>();
    for (const ja of show.judgeAssignments) {
      const name = ja.judge?.name;
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, []);
      const breed = ja.breed?.name;
      if (breed) seen.get(name)!.push(breed);
    }
    return Array.from(seen.entries()).map(([name, breeds]) => ({ name, breeds }));
  }, [show?.judgeAssignments]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Show not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/shows">Browse Shows</Link>
        </Button>
      </div>
    );
  }

  const showAny = show as typeof show & {
    startTime?: string | null;
    showOpenTime?: string | null;
    onCallVet?: string | null;
    acceptsPostalEntries?: boolean;
    scheduleData?: ScheduleData | null;
    firstEntryFee?: number | null;
    subsequentEntryFee?: number | null;
    nfcEntryFee?: number | null;
    juniorHandlerFee?: number | null;
    postalCloseDate?: string | null;
  };
  const sd = showAny.scheduleData;
  const showPath = `/shows/${show.slug ?? show.id}`;

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-10 space-y-8 pb-20">
      {/* Back link */}
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href={showPath}>
          <ArrowLeft className="size-4" />
          Back to show
        </Link>
      </Button>

      {/* ── Header ── */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="secondary" className="text-xs">
            {showTypeLabels[show.showType] ?? show.showType}
          </Badge>
          {show.showScope && (
            <Badge variant="outline" className="text-xs">
              {showScopeLabels[show.showScope] ?? show.showScope}
            </Badge>
          )}
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          {show.name}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {show.organisation?.name}
        </p>
        {show.startDate && (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="size-4 text-muted-foreground" />
            {format(parseLocalDate(show.startDate), 'EEEE d MMMM yyyy')}
          </p>
        )}
        {show.venue && (
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {show.venue.name}
          </p>
        )}
      </div>

      {/* ── Timing ── */}
      {(showAny.showOpenTime || sd?.latestArrivalTime || showAny.startTime) && (
        <section>
          <SectionHeading icon={Clock} title="Timing" />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {showAny.showOpenTime && (
              <InfoCard label="Show Opens" value={showAny.showOpenTime} />
            )}
            {sd?.latestArrivalTime && (
              <InfoCard label="Dogs Received By" value={sd.latestArrivalTime} />
            )}
            {showAny.startTime && (
              <InfoCard label="Judging Commences" value={showAny.startTime} />
            )}
          </div>
        </section>
      )}

      {/* ── Entry Fees ── */}
      {(showAny.firstEntryFee != null || showAny.subsequentEntryFee != null) && (
        <section>
          <SectionHeading icon={PoundSterling} title="Entry Fees" />
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {showAny.firstEntryFee != null && (
              <InfoCard label="First Entry" value={formatCurrency(showAny.firstEntryFee)} />
            )}
            {showAny.subsequentEntryFee != null && (
              <InfoCard label="Subsequent" value={formatCurrency(showAny.subsequentEntryFee)} />
            )}
            {showAny.nfcEntryFee != null && showAny.nfcEntryFee > 0 && (
              <InfoCard label="NFC" value={formatCurrency(showAny.nfcEntryFee)} />
            )}
            {showAny.juniorHandlerFee != null && showAny.juniorHandlerFee > 0 && (
              <InfoCard label="Junior Handler" value={formatCurrency(showAny.juniorHandlerFee)} />
            )}
          </div>
          {show.entryCloseDate && (
            <p className="mt-2 text-xs text-muted-foreground">
              Entries close: {format(parseLocalDate(show.entryCloseDate), 'd MMMM yyyy')}
              {showAny.acceptsPostalEntries && showAny.postalCloseDate && (
                <> (postal: {format(parseLocalDate(showAny.postalCloseDate), 'd MMMM yyyy')})</>
              )}
            </p>
          )}
        </section>
      )}

      {/* ── Judges ── */}
      {judges.length > 0 && (
        <section>
          <SectionHeading icon={Gavel} title="Judges" />
          <div className="space-y-2">
            {judges.map((judge) => (
              <div key={judge.name} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Gavel className="size-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{judge.name}</p>
                  {judge.breeds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {judge.breeds.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Classes by Breed ── */}
      {breedGroups.length > 0 && (
        <section>
          <SectionHeading icon={Ticket} title="Classes" />
          <div className="space-y-6">
            {breedGroups.map(([breedName, group]) => (
              <div key={breedName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-base font-bold">{breedName}</h3>
                  {group.judgeNames.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Judge: {group.judgeNames.join(', ')}
                    </span>
                  )}
                </div>

                {/* Dog classes */}
                {group.dogClasses.length > 0 && (
                  <ClassList label="Dog Classes" classes={group.dogClasses} />
                )}

                {/* Bitch classes */}
                {group.bitchClasses.length > 0 && (
                  <ClassList label="Bitch Classes" classes={group.bitchClasses} />
                )}

                {/* Combined / unsexed classes */}
                {group.combinedClasses.length > 0 && (
                  <ClassList
                    label={group.dogClasses.length > 0 || group.bitchClasses.length > 0 ? 'Open to Dog & Bitch' : undefined}
                    classes={group.combinedClasses}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Officers ── */}
      {sd?.officers && sd.officers.length > 0 && (
        <section>
          <SectionHeading icon={Users} title="Officers" />
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {sd.officers.map((officer, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">{officer.position}</p>
                <p className="text-sm font-semibold">{officer.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── RKC Statements ── */}
      {sd?.customStatements && sd.customStatements.length > 0 && (
        <section>
          <SectionHeading icon={CalendarDays} title="Important Notices" />
          <div className="space-y-2">
            {sd.customStatements.map((statement, i) => (
              <p key={i} className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
                {statement}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── Additional Info ── */}
      {(sd?.catering || sd?.directions || sd?.additionalNotes) && (
        <section className="space-y-4">
          {sd?.directions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Directions</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">{sd.directions}</p>
            </div>
          )}
          {sd?.catering && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Catering</p>
              <p className="text-sm leading-relaxed">{sd.catering}</p>
            </div>
          )}
          {sd?.additionalNotes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Additional Information</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">{sd.additionalNotes}</p>
            </div>
          )}
        </section>
      )}

      {/* ── Download PDF + Enter ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center border-t pt-6">
        <Button asChild className="min-h-[2.75rem]">
          <Link href={`${showPath}/enter`}>
            <Ticket className="size-4" />
            Enter This Show
          </Link>
        </Button>
        <Button variant="outline" className="min-h-[2.75rem]" asChild>
          <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener noreferrer">
            <Download className="size-4" />
            Download PDF Schedule
          </a>
        </Button>
      </div>
    </div>
  );
}

/* ── Shared components ─────────────────────────── */

function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <h2 className="flex items-center gap-2 mb-3 font-serif text-lg font-bold">
      <Icon className="size-4 text-muted-foreground" />
      {title}
    </h2>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

function ClassList({ label, classes }: { label?: string; classes: { id: string; classNumber?: number | null; classDefinition?: { name?: string | null; description?: string | null } | null }[] }) {
  return (
    <div className="mb-3">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      )}
      <div className="space-y-1">
        {classes
          .sort((a, b) => (a.classNumber ?? 999) - (b.classNumber ?? 999))
          .map((cls) => (
            <div key={cls.id} className="flex items-baseline gap-2 py-1 text-sm">
              {cls.classNumber != null && (
                <span className="w-6 shrink-0 text-right text-xs font-bold text-muted-foreground">
                  {cls.classNumber}
                </span>
              )}
              <div className="min-w-0">
                <span className="font-medium">{cls.classDefinition?.name ?? 'Class'}</span>
                {cls.classDefinition?.description && (
                  <span className="ml-1.5 text-xs text-muted-foreground">— {cls.classDefinition.description}</span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
