'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInSeconds, differenceInDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  ChevronRight,
  Ticket,
  Trophy,
  Crown,
  FileText,
  CalendarPlus,
  ShieldCheck,
  X,
  Info,
  PoundSterling,
  ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { showTypeLabels } from '@/lib/show-types';
import { formatCurrency } from '@/lib/date-utils';
import { ShowShareDropdown } from '@/components/show/show-share-dropdown';
import { cn } from '@/lib/utils';

/* ─── Decorative components ─────────────────────── */

function RosetteWatermark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 opacity-[0.06] sm:top-14"
      width="340"
      height="340"
    >
      <g fill="currentColor" className="text-amber-800">
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * 360) / 16;
          return (
            <ellipse
              key={i}
              cx="100"
              cy="60"
              rx="12"
              ry="34"
              transform={`rotate(${angle} 100 100)`}
            />
          );
        })}
        <circle cx="100" cy="100" r="22" />
        <circle cx="100" cy="100" r="14" fill="#fbf7ef" />
      </g>
    </svg>
  );
}

function ClubMedallion({ logoUrl, initials }: { logoUrl?: string | null; initials: string }) {
  return (
    <div className="relative">
      {/* Decorative outer gold ring */}
      <div aria-hidden="true" className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-500/70 to-amber-600 p-[2px] shadow-[0_4px_30px_rgba(217,119,6,0.15)]">
        <div className="size-full rounded-full bg-[#fbf7ef]" />
      </div>
      {/* Inner medallion */}
      <div className="relative flex size-36 items-center justify-center rounded-full bg-white p-4 shadow-inner ring-1 ring-amber-100 sm:size-44 sm:p-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-full object-contain" />
        ) : (
          <span className="font-serif text-4xl font-bold text-amber-900 sm:text-5xl">{initials}</span>
        )}
      </div>
      {/* Corner dots — certificate-style */}
      <span aria-hidden="true" className="absolute -left-3 top-1/2 -translate-y-1/2 text-amber-500/40">◆</span>
      <span aria-hidden="true" className="absolute -right-3 top-1/2 -translate-y-1/2 text-amber-500/40">◆</span>
    </div>
  );
}

function DividerDiamond() {
  return (
    <span aria-hidden="true" className="text-[8px] text-amber-500/60">◆</span>
  );
}

function OrnamentalDivider({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('mx-auto flex max-w-md items-center gap-3', className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/40 to-amber-500/70" />
      <span aria-hidden="true" className="text-amber-600">◆</span>
      {label && (
        <span className="font-serif text-[11px] italic tracking-[0.35em] text-amber-800">
          {label}
        </span>
      )}
      <span aria-hidden="true" className="text-amber-600">◆</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-500/40 to-amber-500/70" />
    </div>
  );
}

function EditorialStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="px-2 sm:px-4">
      <p className={cn('font-serif text-4xl font-bold leading-none sm:text-5xl', highlight ? 'text-amber-700' : 'text-stone-900')}>
        {value}
      </p>
      <p className="mt-1.5 font-serif text-[10px] uppercase tracking-[0.3em] text-stone-500">{label}</p>
    </div>
  );
}

/* ─── Utility: initials from a name ─────────────── */

function getInitials(name: string) {
  const parts = name
    .replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof|Mx)\.?\s+/i, '')
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Live countdown (ticking) ───────────────────── */

function useCountdown(target: Date | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const secs = Math.max(0, differenceInSeconds(target, new Date()));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h, m, s, totalSecs: secs };
}

function CountdownTicker({ target, variant = 'hero' }: { target: Date; variant?: 'hero' | 'bar' }) {
  const c = useCountdown(target);
  if (!c) return null;
  const urgent = c.d <= 3;
  const veryUrgent = c.totalSecs <= 86400;
  const tone = veryUrgent
    ? 'text-red-600'
    : urgent
      ? 'text-amber-600'
      : variant === 'hero'
        ? 'text-stone-900'
        : 'text-stone-700';
  if (variant === 'bar') {
    return (
      <span className={cn('font-mono text-xs tabular-nums font-semibold', tone)}>
        {c.d > 0 ? `${c.d}d ` : ''}
        {String(c.h).padStart(2, '0')}:{String(c.m).padStart(2, '0')}:{String(c.s).padStart(2, '0')}
      </span>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <CountdownPart label="days" value={c.d} tone={tone} />
      <span className={cn('font-serif text-2xl', tone)}>:</span>
      <CountdownPart label="hrs" value={c.h} tone={tone} />
      <span className={cn('font-serif text-2xl', tone)}>:</span>
      <CountdownPart label="min" value={c.m} tone={tone} />
      <span className={cn('font-serif text-2xl', tone)}>:</span>
      <CountdownPart label="sec" value={c.s} tone={tone} />
    </div>
  );
}

function CountdownPart({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn('font-serif text-3xl font-bold tabular-nums sm:text-4xl', tone)}>{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] font-medium uppercase tracking-widest text-stone-500">{label}</span>
    </div>
  );
}

/* ─── Judge card with initials-badge fallback ────── */

type JudgeData = {
  id: string;
  name: string;
  affix: string | null;
  role: string;
  breeds: string[];
  photoUrl?: string | null;
  bio?: string | null;
  jepLevel?: string | null;
  kcNumber?: string | null;
};

function JudgeCard({ judge, classCount }: { judge: JudgeData; classCount?: number }) {
  const initials = getInitials(judge.name);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-b from-white to-amber-50/30 shadow-sm transition-shadow hover:shadow-md">
      {/* Certificate-style corner marks */}
      <span aria-hidden="true" className="absolute left-3 top-3 text-[8px] text-amber-500/50">◆</span>
      <span aria-hidden="true" className="absolute right-3 top-3 text-[8px] text-amber-500/50">◆</span>

      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-8 text-center sm:pt-10">
        {/* Medallion */}
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-500/80 to-amber-600 p-[2px]">
            <div className="size-full rounded-full bg-white" />
          </div>
          {judge.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={judge.photoUrl}
              alt={judge.name}
              className="relative size-20 rounded-full object-cover sm:size-24"
            />
          ) : (
            <div
              aria-hidden="true"
              className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-amber-100 font-serif text-2xl font-bold text-amber-900 sm:size-24 sm:text-3xl"
            >
              {initials}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-serif text-lg font-bold leading-tight text-stone-900 sm:text-xl">{judge.name}</h3>
          {judge.affix && (
            <p className="mt-0.5 text-sm italic text-amber-700">({judge.affix})</p>
          )}
          <OrnamentalDivider className="mt-3" />
          <p className="mt-3 font-serif text-sm italic text-stone-700">{judge.role}</p>
          {classCount !== undefined && classCount > 0 && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              {classCount} {classCount === 1 ? 'Class' : 'Classes'}
            </p>
          )}
        </div>
      </div>

      {(judge.jepLevel || judge.kcNumber) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-amber-200/50 bg-amber-50/40 px-5 py-2.5">
          {judge.jepLevel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="size-3" />
              JEP {judge.jepLevel}
            </span>
          )}
          {judge.kcNumber && (
            <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">
              RKC · {judge.kcNumber}
            </span>
          )}
        </div>
      )}

      {judge.breeds.length > 0 && judge.breeds.length <= 5 && (
        <div className="border-t border-amber-200/50 px-5 py-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Judging</p>
          <p className="mt-1 font-serif text-sm italic text-stone-700">{judge.breeds.join(' · ')}</p>
        </div>
      )}
    </article>
  );
}

/* ─── Main ───────────────────────────────────────── */

export function ShowPreviewClient() {
  const params = useParams();
  const idOrSlug = params.id as string;
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [widgetDismissed, setWidgetDismissed] = useState(false);

  const { data: show, isLoading } = trpc.shows.getById.useQuery({ id: idOrSlug });
  const { data: showSponsors } = trpc.shows.getShowSponsors.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show?.id }
  );
  const showHasEntries =
    !!show && ['entries_open', 'entries_closed', 'in_progress', 'completed'].includes(show.status);
  const { data: publicStats } = trpc.shows.getPublicStats.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show?.id && showHasEntries, refetchInterval: 60_000 }
  );
  const { data: breedEntryStats } = trpc.shows.getBreedEntryStats.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show?.id && showHasEntries, refetchInterval: 60_000 }
  );

  useEffect(() => {
    if (widgetDismissed) return;
    const threshold = window.innerHeight * 0.6;
    function onScroll() {
      setWidgetVisible(window.scrollY > threshold);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [widgetDismissed]);

  const slug = show?.slug ?? idOrSlug;
  const liveHref = `/shows/${slug}`;

  /* ─── Judge aggregation (mirror of live page) ─── */
  const judges = useMemo<JudgeData[]>(() => {
    if (!show) return [];
    const classes = show.showClasses ?? [];
    const assignments = show.judgeAssignments ?? [];
    const hasJH = classes.some((sc: { classDefinition?: { type?: string } }) => sc.classDefinition?.type === 'junior_handler');
    const juniorBreedSet = new Set<string>();
    const breedBreedSet = new Set<string>();
    for (const sc of classes) {
      const b = (sc as { breed?: { name?: string } }).breed?.name;
      if (!b) continue;
      if ((sc as { classDefinition?: { type?: string } }).classDefinition?.type === 'junior_handler') juniorBreedSet.add(b);
      else breedBreedSet.add(b);
    }
    type Agg = {
      id: string;
      name: string;
      affix: string | null;
      photoUrl: string | null;
      bio: string | null;
      jepLevel: string | null;
      kcNumber: string | null;
      breeds: Set<string>;
      sexes: Set<string>;
      hasNullSex: boolean;
    };
    const m = new Map<string, Agg>();
    for (const ja of assignments) {
      const j = (ja as { judge?: Record<string, unknown> }).judge;
      if (!j || !j.id || !j.name) continue;
      const jid = j.id as string;
      if (!m.has(jid)) {
        m.set(jid, {
          id: jid,
          name: j.name as string,
          affix: (j.kennelClubAffix as string | null) ?? null,
          photoUrl: (j.photoUrl as string | null) ?? null,
          bio: (j.bio as string | null) ?? null,
          jepLevel: (j.jepLevel as string | null) ?? null,
          kcNumber: (j.kcNumber as string | null) ?? null,
          breeds: new Set(),
          sexes: new Set(),
          hasNullSex: false,
        });
      }
      const agg = m.get(jid)!;
      const bname = (ja as { breed?: { name?: string } }).breed?.name;
      if (bname) agg.breeds.add(bname);
      const sex = (ja as { sex?: string }).sex;
      if (sex) agg.sexes.add(sex);
      else agg.hasNullSex = true;
    }
    return Array.from(m.values()).map((agg): JudgeData => {
      const breedArr = Array.from(agg.breeds).sort();
      const onlyJh = breedArr.length > 0 && breedArr.every((b) => juniorBreedSet.has(b) && !breedBreedSet.has(b));
      const isJH = onlyJh || (hasJH && agg.hasNullSex && agg.sexes.size === 0);
      let role: string;
      if (isJH) role = 'Junior Handling';
      else if (agg.sexes.has('dog') && agg.sexes.has('bitch')) role = 'Dogs & Bitches';
      else if (agg.sexes.has('dog')) role = 'Dogs';
      else if (agg.sexes.has('bitch')) role = 'Bitches';
      else if (breedArr.length > 0) role = breedArr.length === 1 ? breedArr[0] : `${breedArr.length} breeds`;
      else role = 'Breed Classes';
      return {
        id: agg.id,
        name: agg.name,
        affix: agg.affix,
        role,
        breeds: breedArr,
        photoUrl: agg.photoUrl,
        bio: agg.bio,
        jepLevel: agg.jepLevel,
        kcNumber: agg.kcNumber,
      };
    });
  }, [show]);

  /* ─── Class sponsor / trophy lookup ─── */
  const trophyList = useMemo(() => {
    if (!showSponsors) return [];
    const items: { className: string; trophyName: string; sponsorName: string }[] = [];
    for (const ss of showSponsors) {
      for (const cs of ss.classSponsorships) {
        if (cs.trophyName && cs.showClass) {
          items.push({
            className: cs.showClass.classDefinition?.name ?? 'Class',
            trophyName: cs.trophyName,
            sponsorName: ss.sponsor.name,
          });
        }
      }
    }
    return items.slice(0, 8);
  }, [showSponsors]);

  /* Most entered breeds (must run before early return) */
  const topBreeds = useMemo(() => {
    return [...(breedEntryStats ?? [])].sort((a, b) => b.dogCount - a.dogCount).slice(0, 3);
  }, [breedEntryStats]);

  /* Resolve a fallback breed name for single-breed shows where individual classes
     may not carry a breed FK. */
  const singleBreedName = useMemo(() => {
    if (!show) return null;
    const isSingleBreed = (show as { showScope?: string }).showScope === 'single_breed';
    if (!isSingleBreed) return null;
    const scWithBreed = (show.showClasses ?? []).find(
      (sc): sc is typeof sc & { breed: { name: string } } =>
        !!(sc as { breed?: { name?: string } | null }).breed?.name
    );
    if (scWithBreed) return scWithBreed.breed.name;
    const jaWithBreed = (show.judgeAssignments ?? []).find(
      (ja): ja is typeof ja & { breed: { name: string } } =>
        !!(ja as { breed?: { name?: string } | null }).breed?.name
    );
    return jaWithBreed?.breed.name ?? null;
  }, [show]);

  /* ─── Breed aggregation ─── */
  const breedGroups = useMemo(() => {
    if (!show) return [] as { breed: string; classes: number; isJH: boolean; judgeName?: string }[];

    const m = new Map<string, { classes: number; isJH: boolean; judgeName?: string }>();
    for (const sc of (show.showClasses ?? [])) {
      const scAny = sc as { breed?: { name?: string } | null; classDefinition?: { type?: string } };
      const isJH = scAny.classDefinition?.type === 'junior_handler';
      const breedName = scAny.breed?.name;
      let groupName: string;
      if (isJH) groupName = 'Junior Handling';
      else if (breedName) groupName = breedName;
      else if (singleBreedName) groupName = singleBreedName;
      else groupName = 'Breed Classes';

      if (!m.has(groupName)) m.set(groupName, { classes: 0, isJH });
      const entry = m.get(groupName)!;
      entry.classes += 1;
    }

    // Attach judges: use the pre-aggregated `judges` list with its resolved roles
    for (const [groupName, entry] of m) {
      if (entry.isJH) {
        const jh = judges.find((j) => j.role === 'Junior Handling');
        if (jh) entry.judgeName = jh.name;
      } else {
        // Prefer a judge explicitly tied to this breed, otherwise the main breed judge
        // (Dogs & Bitches / Dogs / Bitches) for a single-breed show
        const breedJudge = judges.find((j) => j.breeds.includes(groupName));
        const mainJudge = judges.find((j) => ['Dogs & Bitches', 'Dogs', 'Bitches'].includes(j.role));
        entry.judgeName = breedJudge?.name ?? mainJudge?.name;
      }
    }

    // Sort: main breed(s) first, Junior Handling last
    return Array.from(m.entries())
      .map(([breed, v]) => ({ breed, ...v }))
      .sort((a, b) => {
        if (a.isJH !== b.isJH) return a.isJH ? 1 : -1;
        return a.breed.localeCompare(b.breed);
      });
  }, [show, judges, singleBreedName]);

  /* Derive total class counts per judge for display */
  const judgeClassCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of breedGroups) {
      if (g.judgeName) {
        map.set(g.judgeName, (map.get(g.judgeName) ?? 0) + g.classes);
      }
    }
    return map;
  }, [breedGroups]);

  if (isLoading || !show) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-white">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="h-4 w-24 animate-pulse rounded bg-stone-200" />
          <div className="mt-4 h-12 w-3/4 animate-pulse rounded bg-stone-200" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200/80" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const showAny = show as unknown as {
    bannerImageUrl?: string | null;
    firstEntryFee?: number | null;
    subsequentEntryFee?: number | null;
    nfcEntryFee?: number | null;
    juniorHandlerFee?: number | null;
    endTime?: string | null;
    startTime?: string | null;
    showOpenTime?: string | null;
    entriesOpenDate?: string | null;
    entryCloseDate?: string | null;
    acceptsPostalEntries?: boolean;
    kcLicenceNo?: string | null;
    scheduleData?: {
      prizeMoney?: string;
      awardsDescription?: string;
      catering?: string;
      benchingRemovalTime?: string;
      wetWeatherAccommodation?: string;
      isBenched?: boolean;
      indoorOutdoor?: string;
      acceptsNfc?: boolean;
      futureShowDates?: string;
      additionalNotes?: string;
    };
  };

  const org = show.organisation;
  const venue = show.venue;
  const isOpen = show.status === 'entries_open';
  const entryCloseDate = showAny.entryCloseDate ? new Date(showAny.entryCloseDate) : null;
  const daysToClose = entryCloseDate ? differenceInDays(entryCloseDate, new Date()) : null;
  const showDate = format(parseISO(show.startDate), 'EEEE d MMMM yyyy');
  const dayName = format(parseISO(show.startDate), 'EEEE');
  const dayNum = format(parseISO(show.startDate), 'd');
  const monthYear = format(parseISO(show.startDate), 'MMMM yyyy');
  const showType = showTypeLabels[show.showType] ?? show.showType;
  const totalDogs = publicStats?.totalDogs ?? 0;
  const totalExhibitors = publicStats?.totalExhibitors ?? 0;
  const totalClasses = (show.showClasses ?? []).length;
  const titleSponsor = showSponsors?.find((s) => s.tier === 'title');

  return (
    <div className="min-h-screen bg-white">
      {/* ──────────────────────────── Breadcrumb ──────────────────────────── */}
      <nav aria-label="Breadcrumb" className="border-b bg-stone-50/50">
        <ol className="mx-auto flex max-w-6xl items-center gap-1.5 px-3 py-2.5 text-xs sm:px-4 sm:text-sm lg:px-6">
          <li>
            <Link href="/shows" className="text-stone-500 hover:text-stone-800">Shows</Link>
          </li>
          <ChevronRight className="size-3 text-stone-400" />
          <li className="truncate">
            <span className="text-stone-500 hover:text-stone-800">{org?.name ?? 'Club'}</span>
          </li>
          <ChevronRight className="size-3 text-stone-400" />
          <li className="truncate font-medium text-stone-900">{show.name}</li>
        </ol>
      </nav>

      {/* ──────────────────────────── Hero ─────────────────────────────────── */}
      {showAny.bannerImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={showAny.bannerImageUrl}
          alt={`${show.name} banner`}
          className="h-44 w-full object-cover sm:h-60 lg:h-80"
        />
      )}
      <header className="relative overflow-hidden bg-[#fbf7ef]">
        {/* Layered background — warm cream + rosette watermark + radial highlight */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-amber-50/50 via-white/30 to-amber-50/30" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(217,119,6,0.08),transparent_55%)]" />
        <RosetteWatermark />
        {/* Gold hairlines */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
        <div className="absolute inset-x-0 top-[2px] h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent" />

        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-24">
          {/* Remi hallmark — silversmith-style stamp, subtle but present */}
          <Link
            href="/"
            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-white/70 px-2.5 py-1 font-serif text-[10px] uppercase tracking-[0.2em] text-primary backdrop-blur-sm transition-colors hover:border-primary hover:bg-white sm:right-6 sm:top-6"
            aria-label="Listed on Remi"
          >
            <span aria-hidden="true" className="text-[8px] text-primary/70">◆</span>
            <span className="font-semibold">Remi</span>
          </Link>

          {/* Tiny notice label — heritage programme feel */}
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.4em] text-amber-800/70">
            Notice of Show
          </p>

          {/* Club crest — on an ornamented medallion */}
          <div className="mt-6 flex flex-col items-center">
            <ClubMedallion logoUrl={org?.logoUrl} initials={getInitials(org?.name ?? '?')} />
            <h2 className="mt-7 max-w-2xl text-center font-serif text-2xl font-bold uppercase leading-tight tracking-[0.05em] text-stone-900 sm:text-3xl lg:text-[2rem]">
              {org?.name}
            </h2>
            {(org as { kcRegNumber?: string | null } | null | undefined)?.kcRegNumber && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-stone-600 sm:text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-amber-700" />
                  RKC Registered
                </span>
              </div>
            )}
          </div>

          {/* Ornate 'presents' divider */}
          <OrnamentalDivider label="presents" className="mt-10 sm:mt-12" />

          {/* Show type */}
          <div className="mt-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-50 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-900">
              <Crown className="size-3" />
              {showType}
            </span>
          </div>

          {/* Show name — the event itself */}
          <h1 className="mt-5 text-center font-serif text-[2.5rem] font-bold leading-[1.02] text-stone-900 sm:text-5xl lg:text-6xl">
            {show.name}
          </h1>

          {/* Thin rule + year */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-amber-500/50" />
            <span className="font-serif text-xs italic tracking-[0.3em] text-stone-500">
              {format(parseISO(show.startDate), 'yyyy')}
            </span>
            <span className="h-px w-12 bg-amber-500/50" />
          </div>

          {/* Editorial date / venue / rhythm */}
          <div className="mt-10 grid gap-6 text-center sm:mt-12 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-10">
            {/* Date column */}
            <div className="flex flex-col items-center">
              <span className="font-serif text-[11px] uppercase tracking-[0.3em] text-stone-500">{dayName}</span>
              <span className="mt-1 font-serif text-7xl font-bold leading-none text-stone-900 sm:text-[5.5rem]">{dayNum}</span>
              <span className="mt-1 font-serif text-sm italic tracking-[0.15em] text-stone-600">{monthYear}</span>
            </div>

            {/* Center: venue */}
            {venue && (
              <div className="border-y border-amber-500/20 py-4 sm:border-x sm:border-y-0 sm:px-10">
                <p className="font-serif text-[10px] uppercase tracking-[0.3em] text-amber-800/70">At</p>
                <p className="mt-1.5 font-serif text-lg font-bold leading-tight text-stone-900 sm:text-xl">{venue.name}</p>
                <p className="mt-0.5 text-sm text-stone-600">{venue.postcode ?? venue.address ?? ''}</p>
              </div>
            )}

            {/* Right: rhythm */}
            {(showAny.showOpenTime || showAny.startTime) && (
              <div className="flex flex-col items-center gap-1 text-sm text-stone-700">
                {showAny.showOpenTime && (
                  <div>
                    <p className="font-serif text-[10px] uppercase tracking-[0.3em] text-stone-500">Doors</p>
                    <p className="mt-0.5 font-serif text-lg font-semibold text-stone-900">{showAny.showOpenTime}</p>
                  </div>
                )}
                {showAny.startTime && (
                  <div className="mt-2">
                    <p className="font-serif text-[10px] uppercase tracking-[0.3em] text-stone-500">Judging</p>
                    <p className="mt-0.5 font-serif text-lg font-semibold text-stone-900">{showAny.startTime}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Countdown — elegant, inline */}
          {isOpen && entryCloseDate && (
            <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <p className="font-serif text-[10px] uppercase tracking-[0.3em] text-amber-800/80">
                Entries close in
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-white/70 px-4 py-2 shadow-sm ring-1 ring-amber-100 backdrop-blur-sm">
                <HeroCountdown target={entryCloseDate} />
              </div>
              <p className="hidden text-xs text-stone-500 sm:block">{format(entryCloseDate, 'EEE d MMM · HH:mm')}</p>
            </div>
          )}

          {/* Stats — editorial row with hairline separators */}
          {showHasEntries && totalDogs > 0 && (
            <div className="mt-10 sm:mt-12">
              <div className="mx-auto grid max-w-3xl grid-cols-2 gap-y-4 divide-amber-500/20 text-center sm:grid-cols-4 sm:divide-x">
                <EditorialStat label="Dogs" value={totalDogs} highlight />
                <EditorialStat label="Exhibitors" value={totalExhibitors} />
                <EditorialStat label="Classes" value={totalClasses} />
                <EditorialStat label="Breeds" value={breedGroups.length} />
              </div>
              {topBreeds.length > 0 && (
                <p className="mt-5 text-center text-xs italic text-stone-600">
                  Leading the card:{' '}
                  {topBreeds.map((b, i) => (
                    <span key={b.breedName}>
                      {i > 0 && <span className="text-amber-500"> · </span>}
                      <span className="font-semibold not-italic text-stone-800">{b.breedName}</span>
                      <span className="text-stone-500"> ({b.dogCount})</span>
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}

          {titleSponsor && (
            <div className="mt-12 flex flex-col items-center gap-2 border-t border-amber-500/20 pt-8">
              <span className="font-serif text-[10px] uppercase tracking-[0.3em] text-amber-800/80">In association with</span>
              {titleSponsor.sponsor.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={titleSponsor.sponsor.logoUrl} alt={titleSponsor.sponsor.name} className="h-10 object-contain" />
              ) : (
                <span className="font-serif text-base font-semibold text-stone-900">{titleSponsor.sponsor.name}</span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ──────────────────────────── Sticky action bar ──────────────────── */}
      <div className="sticky top-[calc(4.5rem+2.5rem)] z-40 border-b bg-white/95 shadow-sm backdrop-blur-md sm:top-[calc(4.5rem+2.75rem)]">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4 lg:px-6">
          {isOpen ? (
            <Button className="h-12 flex-1 px-5 text-base font-semibold shadow-lg shadow-primary/30 sm:h-11 sm:flex-initial sm:shrink-0 sm:px-5" asChild>
              <Link href={liveHref}>
                <Ticket className="size-5 sm:size-4" />
                Enter This Show
              </Link>
            </Button>
          ) : (
            <div className="flex-1 text-sm font-medium text-stone-600 sm:flex-initial">{
              show.status === 'completed' ? 'Show complete' : show.status === 'cancelled' ? 'Cancelled' : 'Entries closed'
            }</div>
          )}

          {isOpen && entryCloseDate && (
            <div className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 sm:inline-flex">
              <Clock className="size-3.5 text-amber-700" />
              <span className="text-xs font-semibold text-amber-900">
                Closes in <CountdownTicker target={entryCloseDate} variant="bar" />
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener">
                <FileText className="size-4" />
                <span className="hidden sm:inline">Schedule</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <a href={`/api/shows/${show.id}/calendar`}>
                <CalendarPlus className="size-4" />
                <span className="hidden sm:inline">Add to Calendar</span>
              </a>
            </Button>
            <ShowShareDropdown
              showName={show.name}
              showType={showType}
              showDate={showDate}
              organisationName={org?.name ?? ''}
              venueName={venue?.name}
            />
          </div>
        </div>
      </div>

      {/* ──────────────────────────── Meet the Judges ────────────────────── */}
      {judges.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Officiating" title="Meet the Judges" />
          <p className="mt-3 max-w-2xl text-stone-600">
            {judges.length === 1
              ? 'A single appointment for this show — your breed entrusted to an experienced judge.'
              : `${judges.length} judges bring breed-specific expertise to the ring.`}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {judges.map((j) => (
              <JudgeCard key={j.id} judge={j} classCount={judgeClassCounts.get(j.name)} />
            ))}
          </div>
        </section>
      )}

      {/* ──────────────────────────── Entry fees (transparent) ───────────── */}
      <section className="border-y bg-gradient-to-b from-amber-50/40 to-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Transparent pricing" title="Entry Fees" />
          <p className="mt-3 max-w-2xl text-stone-600">
            No surprises at checkout. Every fee is listed here — and all your entries combine into a single payment at the end.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
            <dl className="divide-y">
              <FeeRow label="First entry" sub="Per dog, first class" value={showAny.firstEntryFee} />
              <FeeRow
                label="Subsequent entries"
                sub="Same dog, additional classes"
                value={showAny.subsequentEntryFee ?? showAny.firstEntryFee}
                note={showAny.subsequentEntryFee == null || showAny.subsequentEntryFee === showAny.firstEntryFee ? 'Same rate' : undefined}
              />
              <FeeRow
                label="NFC entries"
                sub="Not for competition — socialise and support"
                value={showAny.nfcEntryFee}
                available={showAny.scheduleData?.acceptsNfc ?? false}
              />
              <FeeRow
                label="Junior Handler"
                sub="Handling classes for under-18s"
                value={showAny.juniorHandlerFee}
              />
              <FeeRow
                label="Postal entries"
                sub="Paper form via post"
                available={showAny.acceptsPostalEntries ?? false}
                custom={showAny.acceptsPostalEntries ? 'Accepted — same rates' : 'Online only'}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3.5 text-sm font-medium text-stone-800 sm:px-6">
                <span className="inline-flex items-center gap-1.5"><Info className="size-4 text-amber-700" /> A card processing fee is added at checkout</span>
                <span className="text-xs text-stone-600">All prices in GBP</span>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── Prize & Trophy story ──────────────── */}
      {(trophyList.length > 0 || showAny.scheduleData?.prizeMoney || showAny.scheduleData?.awardsDescription) && (
        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="The silverware" title="Awards & Prizes" />

          {/* Awards description — clean readable card, NOT stylised */}
          {showAny.scheduleData?.awardsDescription && (
            <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-7">
              <div className="flex items-center gap-2 border-b border-amber-200/60 pb-3">
                <Trophy className="size-5 text-amber-600" />
                <h3 className="font-serif text-lg font-bold text-stone-900">On offer</h3>
              </div>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-stone-800">
                {showAny.scheduleData.awardsDescription}
              </p>
              {showAny.scheduleData.prizeMoney && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-900">
                  <PoundSterling className="size-4" />
                  {showAny.scheduleData.prizeMoney}
                </div>
              )}
            </div>
          )}

          {/* Prize money only (when no description) */}
          {!showAny.scheduleData?.awardsDescription && showAny.scheduleData?.prizeMoney && (
            <div className="mt-6 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-50 px-5 py-2 font-serif text-sm font-semibold text-amber-900">
                <PoundSterling className="size-4" />
                {showAny.scheduleData.prizeMoney}
              </div>
            </div>
          )}

          {/* Honour roll of sponsored trophies — only when we actually have some */}
          {trophyList.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-300/60 bg-gradient-to-b from-[#fbf7ef] to-white p-6 shadow-sm sm:p-8">
              <p className="text-center font-serif text-[11px] uppercase italic tracking-[0.35em] text-amber-800">
                ◆ Trophy Honour Roll ◆
              </p>
              <ul className="mt-5 divide-y divide-amber-200/60">
                {trophyList.map((t, i) => (
                  <li key={i} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base font-bold leading-tight text-stone-900">{t.trophyName}</p>
                      <p className="mt-0.5 font-serif text-sm italic text-stone-600">For the {t.className}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <Trophy className="size-3.5 text-amber-600" />
                      <span className="text-stone-500">presented by</span>
                      <span className="font-serif font-semibold text-stone-800">{t.sponsorName}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ──────────────────────────── Classes ───────────────────────────── */}
      {breedGroups.length > 0 && (
        <section className="border-y bg-stone-50/60">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <SectionHeading eyebrow="The card" title={breedGroups.length === 1 ? 'Classes on Offer' : `${breedGroups.length} Breeds`} />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {breedGroups.map(({ breed, classes, judgeName }) => (
                <div
                  key={breed}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-3"
                >
                  <p className="truncate font-serif font-semibold text-stone-900">{breed}</p>
                  <p className="text-xs text-stone-500">
                    {classes} {classes === 1 ? 'class' : 'classes'}
                    {judgeName ? ` · ${judgeName}` : ''}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs italic text-stone-500">
              Full class list available in the{' '}
              <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">
                schedule PDF
              </a>
              .
            </p>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Venue ─────────────────────────────── */}
      {venue && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Where" title="The Venue" />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              {venue.imageUrl && (
                <div className="overflow-hidden rounded-2xl border bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={venue.imageUrl} alt={venue.name} className="aspect-[16/10] w-full object-cover" />
                </div>
              )}
              {venue.lat && venue.lng ? (
                <div className="overflow-hidden rounded-2xl border bg-stone-100">
                  <iframe
                    title={`Map of ${venue.name}`}
                    width="100%"
                    height="320"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${venue.lat},${venue.lng}&z=14&output=embed`}
                    allowFullScreen
                  />
                </div>
              ) : venue.postcode ? (
                <div className="overflow-hidden rounded-2xl border bg-stone-100">
                  <iframe
                    title={`Map of ${venue.name}`}
                    width="100%"
                    height="320"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(venue.postcode)}&z=14&output=embed`}
                    allowFullScreen
                  />
                </div>
              ) : null}
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-stone-900">{venue.name}</h3>
              <address className="mt-2 whitespace-pre-line not-italic leading-relaxed text-stone-700">
                {[venue.address, venue.postcode].filter(Boolean).join('\n')}
              </address>
              <div className="mt-5 flex flex-wrap gap-2">
                {(venue.lat && venue.lng) || venue.postcode ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={
                        venue.lat && venue.lng
                          ? `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`
                          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venue.postcode ?? '')}`
                      }
                      target="_blank"
                      rel="noopener"
                    >
                      <MapPin className="size-4" />
                      Get directions
                    </a>
                  </Button>
                ) : null}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <Facility label="Parking" value="Free on-site" />
                <Facility label="Accessibility" value="Step-free access" />
                <Facility label="Catering" value={showAny.scheduleData?.catering ?? 'Refreshments available'} />
                <Facility label="Weather" value={showAny.scheduleData?.wetWeatherAccommodation ?? 'Indoor/outdoor'} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Additional notes (if present) ─────── */}
      {showAny.scheduleData?.additionalNotes && (
        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Please note" title="From the organisers" />
          <div className="mt-6 rounded-2xl border-l-4 border-amber-500 bg-amber-50/50 p-6 sm:p-7">
            <p className="whitespace-pre-line leading-relaxed text-stone-800">
              {showAny.scheduleData.additionalNotes}
            </p>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Future shows (if present) ─────────── */}
      {showAny.scheduleData?.futureShowDates && (
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <SectionHeading eyebrow="Save the date" title={`More from ${org?.name ?? 'this club'}`} />
          <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
            <p className="whitespace-pre-line leading-relaxed text-stone-700">
              {showAny.scheduleData.futureShowDates}
            </p>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Footer CTA ────────────────────────── */}
      {isOpen && (
        <section className="border-t bg-gradient-to-br from-amber-100 via-amber-50 to-stone-50">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
            <Crown className="mx-auto size-8 text-amber-700" />
            <h2 className="mt-4 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">Ready for the ring?</h2>
            <p className="mx-auto mt-3 max-w-xl text-stone-700">
              {totalDogs > 0 ? `Join ${totalDogs} dog${totalDogs === 1 ? '' : 's'} already entered. ` : ''}
              Entries take two minutes on your phone.
            </p>
            <div className="mt-8">
              <Button size="lg" className="h-14 px-8 text-base font-bold shadow-lg shadow-primary/30" asChild>
                <Link href={liveHref}>
                  <Ticket className="size-5" />
                  Enter This Show
                </Link>
              </Button>
            </div>
            {entryCloseDate && (
              <p className="mt-4 text-xs text-stone-500">
                Entries close <strong className="text-stone-700">{format(entryCloseDate, 'EEEE d MMMM · HH:mm')}</strong>
                {daysToClose !== null && daysToClose <= 7 && (
                  <span className="ml-1 font-semibold text-amber-700">({daysToClose}d left)</span>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ──────────────────────────── Footer ────────────────────────────── */}
      <footer className="border-t bg-[#fbf7ef]">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 sm:py-16 lg:px-8">
          <OrnamentalDivider className="mb-8" />
          <Link href="/" className="inline-block transition-opacity hover:opacity-80" aria-label="Remi">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/remi-horizontal.png" alt="Remi" className="mx-auto h-14 w-auto sm:h-16" />
          </Link>
          <p className="mt-4 font-serif text-sm italic text-stone-600">Show management, reimagined.</p>
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-stone-500">
            <Link href="/shows" className="hover:text-primary">Find a show</Link>
            <DividerDiamond />
            <Link href="/about" className="hover:text-primary">About Remi</Link>
            <DividerDiamond />
            <Link href="/terms" className="hover:text-primary">Terms</Link>
          </div>
          <p className="mt-6 text-[11px] text-stone-400">
            &copy; {new Date().getFullYear()} Remi · Lovingly built for the UK dog-show community.
          </p>
        </div>
      </footer>

      {/* ──────────────────────────── Mobile slide-up widget (dismissable) ── */}
      {isOpen && !widgetDismissed && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-2xl shadow-stone-900/20 backdrop-blur-lg transition-transform duration-300 ease-out motion-reduce:transition-none sm:hidden',
            widgetVisible ? 'translate-y-0' : 'translate-y-full'
          )}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => setWidgetDismissed(true)}
            aria-label="Dismiss entry widget"
            className="absolute -top-8 right-3 flex size-7 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-stone-200"
          >
            <X className="size-3.5 text-stone-600" />
          </button>
          <div className="flex items-center gap-3 px-4 pt-3">
            <div className="min-w-0 flex-1">
              {showAny.firstEntryFee != null && showAny.firstEntryFee > 0 ? (
                <>
                  <p className="font-serif text-xl font-bold text-primary">{formatCurrency(showAny.firstEntryFee)}</p>
                  <p className="text-xs text-stone-500">entry fee</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-stone-900">Enter This Show</p>
              )}
              {entryCloseDate && daysToClose !== null && daysToClose <= 14 && (
                <p className={cn('mt-0.5 text-[11px] font-semibold', daysToClose <= 3 ? 'text-red-600' : 'text-amber-700')}>
                  Closes in {daysToClose === 0 ? 'today' : `${daysToClose}d`}
                </p>
              )}
            </div>
            <Button className="h-12 shrink-0 px-6 text-base font-semibold shadow-lg shadow-primary/30" asChild>
              <Link href={liveHref}>
                <Ticket className="size-5" />
                Enter Now
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small composable building blocks ────────────── */

function SectionHeading({ eyebrow, title, centered }: { eyebrow?: string; title: string; centered?: boolean }) {
  return (
    <div className={cn(centered && 'text-center')}>
      {eyebrow && (
        <p className="font-serif text-[11px] uppercase italic tracking-[0.3em] text-amber-800">{eyebrow}</p>
      )}
      <h2 className="mt-2 font-serif text-3xl font-bold leading-tight text-stone-900 sm:text-[2.25rem]">{title}</h2>
      <div className={cn('mt-3 flex items-center gap-2', centered && 'justify-center')}>
        <span className="h-px w-10 bg-amber-500/60" />
        <span aria-hidden="true" className="text-[10px] text-amber-500">◆</span>
        <span className="h-px w-10 bg-amber-500/30" />
      </div>
    </div>
  );
}

function HeroCountdown({ target }: { target: Date }) {
  const c = useCountdown(target);
  if (!c) return null;
  return (
    <div className="flex items-baseline gap-1 font-mono tabular-nums text-stone-900">
      {c.d > 0 && (
        <>
          <span className="font-serif text-2xl font-bold sm:text-3xl">{c.d}</span>
          <span className="mr-1.5 text-[10px] uppercase tracking-wider text-stone-500">days</span>
        </>
      )}
      <span className="font-serif text-2xl font-bold sm:text-3xl">{String(c.h).padStart(2, '0')}</span>
      <span className="text-amber-600">:</span>
      <span className="font-serif text-2xl font-bold sm:text-3xl">{String(c.m).padStart(2, '0')}</span>
      <span className="text-amber-600">:</span>
      <span className="font-serif text-2xl font-bold sm:text-3xl">{String(c.s).padStart(2, '0')}</span>
    </div>
  );
}

function FeeRow({
  label,
  sub,
  value,
  note,
  available,
  custom,
}: {
  label: string;
  sub?: string;
  value?: number | null;
  note?: string;
  available?: boolean;
  custom?: string;
}) {
  const unavailable = available === false;
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-4 sm:px-6', unavailable && 'opacity-60')}>
      <div className="min-w-0">
        <dt className="font-serif text-base font-semibold text-stone-900">{label}</dt>
        {sub && <p className="text-xs text-stone-500">{sub}</p>}
      </div>
      <dd className="shrink-0 text-right">
        {custom ? (
          <span className="text-sm text-stone-600">{custom}</span>
        ) : unavailable ? (
          <span className="text-sm italic text-stone-400">Not offered</span>
        ) : (
          <>
            <p className="font-serif text-lg font-bold text-stone-900">{formatCurrency(value ?? 0)}</p>
            {note && <p className="text-[10px] text-stone-500">{note}</p>}
          </>
        )}
      </dd>
    </div>
  );
}

function Facility({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-0.5 font-medium text-stone-800">{value}</p>
    </div>
  );
}

