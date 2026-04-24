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
  Sparkles,
  ShieldCheck,
  Instagram,
  Download,
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

/* ─── Preview banner ─────────────────────────────── */

function PreviewBanner({ realHref }: { realHref: string }) {
  return (
    <div className="sticky top-[4.5rem] z-50 border-b border-amber-400/40 bg-amber-100/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs sm:px-4 sm:text-sm lg:px-6">
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-900">
          <Sparkles className="size-3.5" />
          Design preview — no live actions, your data is read-only
        </span>
        <Link href={realHref} className="inline-flex items-center gap-1 font-semibold text-amber-900 underline-offset-4 hover:underline">
          View live page
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
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

function JudgeCard({ judge }: { judge: JudgeData }) {
  const [open, setOpen] = useState(false);
  const initials = getInitials(judge.name);
  return (
    <article className="group overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4 p-5 sm:p-6">
        {judge.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={judge.photoUrl}
            alt={judge.name}
            className="size-16 shrink-0 rounded-full object-cover ring-2 ring-amber-200 sm:size-20"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-amber-100 to-stone-100 font-serif text-xl font-bold text-amber-900 ring-2 ring-amber-300/60 sm:size-20 sm:text-2xl"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg font-bold leading-tight text-stone-900 sm:text-xl">{judge.name}</h3>
          {judge.affix && (
            <p className="text-sm italic text-amber-700">({judge.affix})</p>
          )}
          <p className="mt-0.5 text-sm text-stone-600">{judge.role}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {judge.jepLevel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="size-3" />
                JEP {judge.jepLevel}
              </span>
            )}
            {judge.kcNumber && (
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                RKC · {judge.kcNumber}
              </span>
            )}
          </div>
        </div>
      </div>
      {judge.breeds.length > 0 && (
        <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-3 sm:px-6">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Judging</p>
          <p className="text-sm text-stone-700">{judge.breeds.join(' · ')}</p>
        </div>
      )}
      <div className="border-t border-stone-100 px-5 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900"
        >
          {open ? 'Hide bio' : 'Read bio'}
          <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        </button>
        {open && (
          <p className="mt-3 text-sm italic leading-relaxed text-stone-600">
            {judge.bio ?? 'Bio coming soon. Judges will be invited to add a short biography so exhibitors can learn more about their appointments.'}
          </p>
        )}
      </div>
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

  /* ─── Breed aggregation ─── */
  const breedGroups = useMemo(() => {
    if (!show) return [];
    const m = new Map<string, { classes: number; judgeName?: string }>();
    for (const sc of (show.showClasses ?? [])) {
      const name = (sc as { breed?: { name?: string } }).breed?.name ?? 'Classes';
      if (!m.has(name)) m.set(name, { classes: 0 });
      m.get(name)!.classes += 1;
    }
    for (const ja of (show.judgeAssignments ?? [])) {
      const bname = (ja as { breed?: { name?: string } }).breed?.name;
      const jname = (ja as { judge?: { name?: string } }).judge?.name;
      if (bname && jname && m.has(bname) && !m.get(bname)!.judgeName) {
        m.get(bname)!.judgeName = jname;
      }
    }
    return Array.from(m.entries()).map(([breed, v]) => ({ breed, ...v }));
  }, [show]);

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
      <PreviewBanner realHref={liveHref} />

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
          className="h-40 w-full object-cover sm:h-56 lg:h-72"
        />
      )}
      <header className="relative overflow-hidden bg-gradient-to-br from-amber-100/80 via-amber-50/60 to-stone-50">
        {/* Subtle paper texture via radial highlight */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(250,204,21,0.15),transparent_55%)]" />
        {/* Gold accent lines */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:pb-20 lg:pt-20">
          {/* Club crest — the club IS the brand */}
          <div className="flex flex-col items-center text-center">
            {org?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={org.name}
                className="h-28 w-auto object-contain drop-shadow-sm sm:h-36 lg:h-40"
              />
            ) : (
              <div className="flex size-28 items-center justify-center rounded-full bg-white font-serif text-3xl font-bold text-amber-900 shadow-md ring-2 ring-amber-300/60 sm:size-36 sm:text-4xl">
                {getInitials(org?.name ?? '?')}
              </div>
            )}
            <h2 className="mt-5 max-w-2xl font-serif text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
              {org?.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-stone-600 sm:text-xs">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-amber-700" />
                RKC Registered
              </span>
              <span className="text-stone-300">·</span>
              <span>Established 1985</span>
              <span className="text-stone-300">·</span>
              <span>Breed Specialist</span>
            </div>
          </div>

          {/* Ornamental divider — club presents this show */}
          <div className="mx-auto mt-10 flex max-w-sm items-center gap-3 sm:mt-12">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/50" />
            <span className="font-serif text-xs italic tracking-widest text-amber-800">presents</span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/50" />
          </div>

          {/* Show type chip */}
          <div className="mt-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900">
              <Crown className="size-3" />
              {showType}
            </span>
          </div>

          {/* Show name — the event itself */}
          <h1 className="mt-4 text-center font-serif text-4xl font-bold leading-[1.05] text-stone-900 sm:text-5xl lg:text-6xl">
            {show.name}
          </h1>

          {/* Date block — editorial treatment */}
          <div className="mt-10 flex flex-wrap items-end justify-center gap-x-8 gap-y-4 text-left">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">The Occasion</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-serif text-5xl font-bold leading-none text-stone-900 sm:text-6xl">{dayNum}</span>
                <div className="flex flex-col">
                  <span className="font-serif text-lg font-semibold text-stone-900">{dayName}</span>
                  <span className="text-sm text-stone-500">{monthYear}</span>
                </div>
              </div>
            </div>

            {venue && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">The Venue</p>
                <div className="mt-1 flex items-start gap-2">
                  <MapPin className="mt-1 size-4 shrink-0 text-stone-400" />
                  <div>
                    <p className="font-serif text-base font-semibold text-stone-900">{venue.name}</p>
                    <p className="text-sm text-stone-500">{venue.postcode ?? venue.address ?? ''}</p>
                  </div>
                </div>
              </div>
            )}

            {(showAny.showOpenTime || showAny.startTime) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">The Rhythm</p>
                <div className="mt-1 space-y-0.5 text-sm text-stone-700">
                  {showAny.showOpenTime && <p><span className="text-stone-400">Doors</span> {showAny.showOpenTime}</p>}
                  {showAny.startTime && <p><span className="text-stone-400">Judging</span> {showAny.startTime}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Countdown — only when entries open */}
          {isOpen && entryCloseDate && (
            <div className="mt-10 rounded-2xl border border-amber-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800">Entries Close</p>
                  <p className="mt-0.5 text-sm text-stone-600">{format(entryCloseDate, 'EEEE d MMMM · HH:mm')}</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
                  <HeroCountdown target={entryCloseDate} />
                </div>
              </div>
            </div>
          )}

          {/* Live entry pulse */}
          {showHasEntries && totalDogs > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-amber-200/60 pt-6">
              <Stat label="Dogs Entered" value={totalDogs} highlight />
              <Stat label="Exhibitors" value={totalExhibitors} />
              <Stat label="Classes" value={totalClasses} />
              <Stat label="Breeds" value={breedGroups.length} />
              {topBreeds.length > 0 && (
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">Most Entered</p>
                  <p className="mt-1 text-sm text-stone-700">
                    {topBreeds.map((b) => `${b.breedName} (${b.dogCount})`).join(' · ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {titleSponsor && (
            <div className="mt-6 flex items-center gap-3 border-t border-amber-200/60 pt-6">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">In association with</span>
              {titleSponsor.sponsor.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={titleSponsor.sponsor.logoUrl} alt={titleSponsor.sponsor.name} className="h-8 object-contain" />
              ) : (
                <span className="font-serif text-sm font-semibold text-stone-900">{titleSponsor.sponsor.name}</span>
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
              <JudgeCard key={j.id} judge={j} />
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
              <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-5 py-3 text-xs text-stone-500 sm:px-6">
                <span className="inline-flex items-center gap-1"><Info className="size-3" /> Card processing fee applies at checkout</span>
                <span>All prices in GBP</span>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── Prize & Trophy story ──────────────── */}
      {(trophyList.length > 0 || showAny.scheduleData?.prizeMoney || showAny.scheduleData?.awardsDescription) && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="The silverware" title="Prizes & Trophies" />
          {showAny.scheduleData?.awardsDescription && (
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-stone-700">{showAny.scheduleData.awardsDescription}</p>
          )}
          {showAny.scheduleData?.prizeMoney && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
              <PoundSterling className="size-4" />
              {showAny.scheduleData.prizeMoney}
            </div>
          )}
          {trophyList.length > 0 && (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {trophyList.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-gradient-to-br from-white to-amber-50/40 p-4">
                  <Trophy className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="font-serif text-sm font-bold text-stone-900">{t.trophyName}</p>
                    <p className="text-xs text-stone-600">{t.className}</p>
                    <p className="mt-1 text-[11px] italic text-stone-500">Presented by {t.sponsorName}</p>
                  </div>
                </div>
              ))}
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
                <a
                  key={breed}
                  href={`${liveHref}#breed-${breed.toLowerCase().replace(/\s+/g, '-')}`}
                  className="group flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif font-semibold text-stone-900">{breed}</p>
                    <p className="text-xs text-stone-500">
                      {classes} {classes === 1 ? 'class' : 'classes'}
                      {judgeName ? ` · ${judgeName}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Venue ─────────────────────────────── */}
      {venue && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Where" title="The Venue" />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-2xl border bg-stone-100">
              {venue.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={venue.imageUrl} alt={venue.name} className="aspect-[16/10] w-full object-cover" />
              ) : (
                <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-stone-100 to-amber-50/50">
                  <MapPin className="size-10 text-stone-300" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-stone-900">{venue.name}</h3>
              <address className="mt-2 whitespace-pre-line not-italic leading-relaxed text-stone-700">
                {[venue.address, venue.postcode].filter(Boolean).join('\n')}
              </address>
              <div className="mt-5 flex flex-wrap gap-2">
                {venue.lat && venue.lng && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`}
                      target="_blank"
                      rel="noopener"
                    >
                      <MapPin className="size-4" />
                      Get directions
                    </a>
                  </Button>
                )}
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

      {/* ──────────────────────────── Show Pass concept ─────────────────── */}
      <section className="border-y bg-gradient-to-br from-amber-50 via-white to-amber-50/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900">
                <Sparkles className="size-3" />
                Coming soon
              </span>
              <h2 className="mt-4 font-serif text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">Every show, a Show Pass.</h2>
              <p className="mt-4 max-w-lg text-stone-700">
                Auto-generated marketing graphics for every show on Remi — printable posters for your training halls,
                a judge-announcement image for Facebook, and a ready-to-post Instagram story. One tap to download, shared straight from your show page.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" disabled>
                  <Download className="size-4" />
                  Download Show Pass
                </Button>
                <Button size="lg" variant="outline" disabled>
                  <Instagram className="size-4" />
                  Instagram story
                </Button>
              </div>
              <p className="mt-3 text-xs italic text-stone-500">Mockup only — not yet functional</p>
            </div>

            {/* Mock poster visual */}
            <div className="relative">
              <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-stone-100 p-6 shadow-2xl ring-1 ring-amber-200/60">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.15),transparent_50%)]" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800">
                    <Crown className="size-3" />
                    {showType}
                  </div>
                  <h3 className="mt-3 font-serif text-2xl font-bold leading-tight text-stone-900">{show.name}</h3>
                  <p className="mt-1 text-xs italic text-stone-600">Hosted by {org?.name}</p>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="font-serif text-5xl font-bold leading-none text-stone-900">{dayNum}</span>
                    <div className="pb-1 text-xs text-stone-600">
                      <p className="font-semibold">{dayName}</p>
                      <p>{monthYear}</p>
                    </div>
                  </div>
                  {venue && <p className="mt-4 text-xs text-stone-700">{venue.name}</p>}
                  {judges.length > 0 && (
                    <div className="mt-4 text-xs text-stone-700">
                      <p className="font-semibold uppercase tracking-wider text-[9px] text-amber-800">Judges</p>
                      <p>{judges.slice(0, 3).map((j) => j.name).join(' · ')}</p>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between border-t border-amber-300/40 pt-3">
                    <div className="flex size-8 items-center justify-center rounded bg-stone-900 font-serif text-[10px] font-bold text-amber-300">R</div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-amber-800">Enter at</p>
                      <p className="font-mono text-[10px] text-stone-900">remishowmanager.co.uk</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-stone-500">Mock preview — Show Pass A4 poster</p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── Club spotlight ─────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <SectionHeading eyebrow="About the hosts" title={org?.name ?? 'The Club'} />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border bg-gradient-to-br from-amber-50/50 to-white p-6 sm:p-8">
            {org?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt={org.name} className="h-20 object-contain" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-amber-200/60 font-serif text-2xl font-bold text-amber-900">
                {getInitials(org?.name ?? '?')}
              </div>
            )}
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Established</dt>
                <dd className="font-semibold text-stone-900">1985</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Registration</dt>
                <dd className="font-semibold text-stone-900">RKC Approved</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Shows hosted</dt>
                <dd className="font-semibold text-stone-900">2+ this year</dd>
              </div>
              {showAny.scheduleData?.futureShowDates && (
                <div className="border-t pt-3">
                  <dt className="mb-1 text-stone-500">Upcoming</dt>
                  <dd className="whitespace-pre-wrap text-xs text-stone-700">{showAny.scheduleData.futureShowDates}</dd>
                </div>
              )}
            </dl>
            <p className="mt-6 text-xs italic text-stone-500">Placeholder data — real club profiles to follow</p>
          </div>
          <div className="space-y-4">
            <p className="leading-relaxed text-stone-700">
              {show.description ?? `${org?.name} has been at the heart of its dog-show community for decades — running shows, mentoring exhibitors, and championing responsible breeding. Today, that work continues with every well-run show on the card.`}
            </p>
            <div className="rounded-xl border bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Other shows by this club</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span className="text-stone-700">Autumn Open Show</span>
                  <span className="text-xs text-stone-500">Placeholder</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span className="text-stone-700">Winter Championship Show</span>
                  <span className="text-xs text-stone-500">Placeholder</span>
                </div>
              </div>
              <p className="mt-3 text-xs italic text-stone-500">When club pages ship, this will list every upcoming and past show.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── FAQ (mocked) ──────────────────────── */}
      <section className="border-t bg-stone-50/60">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <SectionHeading eyebrow="Before you enter" title="Frequently Asked" />
          <div className="mt-8 space-y-3">
            <FAQItem q="Do I need to print anything on the day?" a="No — just turn up. Ring numbers will be at the ring or available at the secretary's table. Your confirmation email is all you need." />
            <FAQItem q="Can I enter more than one dog?" a="Yes. Each dog is entered separately but all combined into a single payment at checkout. The subsequent-entry fee applies to each additional class for the same dog." />
            <FAQItem q="Are postal entries accepted?" a={showAny.acceptsPostalEntries ? 'Yes. Contact the secretary for the address. Online is faster.' : 'Online only — it\'s faster, gives instant confirmation and reduces admin for the club.'} />
            <FAQItem q="What if I need to withdraw?" a="Contact the secretary before entries close. Full refunds are available until close; after that, please see the show T&Cs." />
            <FAQItem q="Is the venue wheelchair accessible?" a="Step-free access, on-site parking, and accessible toilets. Contact the secretary for specific requirements." />
            <FAQItem q="When are results published?" a="Live to this page throughout the day as each class is judged. No waiting for a newsletter." />
          </div>
          <p className="mt-6 text-xs italic text-stone-500">FAQ content is currently illustrative — we&apos;ll add a proper editable FAQ section per show.</p>
        </div>
      </section>

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
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-stone-500 sm:px-6 lg:px-8">
          <p>Powered by <Link href="/" className="font-semibold text-stone-700 hover:text-stone-900">Remi</Link> — show management, reimagined.</p>
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

function SectionHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-700">{eyebrow}</p>
      )}
      <h2 className="mt-1 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">{title}</h2>
      <div className="mt-3 h-px w-16 bg-gradient-to-r from-amber-400 to-transparent" />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">{label}</p>
      <p className={cn('mt-1 font-serif text-3xl font-bold leading-none', highlight ? 'text-amber-700' : 'text-stone-900')}>
        {value}
      </p>
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
        ) : value == null || value === 0 ? (
          <span className="text-sm text-stone-400">—</span>
        ) : (
          <>
            <p className="font-serif text-lg font-bold text-stone-900">{formatCurrency(value)}</p>
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

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-xl border bg-white"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-serif text-base font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <ChevronRight className={cn('size-4 shrink-0 text-stone-400 transition-transform', open && 'rotate-90')} />
      </summary>
      <div className="border-t px-5 py-4 text-sm leading-relaxed text-stone-700">{a}</div>
    </details>
  );
}
