'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  ChevronLeft,
  Ticket,
  Trophy,
  Crown,
  Award,
  Flag,
  FileText,
  CalendarPlus,
  ShieldCheck,
  X,
  Info,
  PoundSterling,
  CreditCard,
  Check,
  Lock,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import {
  buildClassLabelMap,
  getClassLabel,
  svDisplayAge,
  isSpecialAwardClass,
  isJuniorHandler,
} from '@/lib/class-labels';
import { Button } from '@/components/ui/button';
import { displayShowTypeLabel } from '@/lib/show-types';
import { formatCurrency, formatCloseTimeUK } from '@/lib/date-utils';
import { buildRegionalFeeDisplay, buildRegionalSpecialClassFees } from '@/lib/regional-fee-calc';
import { ShareKitDialog } from '@/components/show/share-kit-dialog';
import { ShareKitCard } from '@/components/show/share-kit';
import { cn } from '@/lib/utils';
import { captureReferralSource } from '@/lib/referral-source';
import { useCountdown } from '@/components/show-experience/use-countdown';
import { useInView, useStuckReveal } from '@/components/show-experience/use-in-view';
import {
  Eyebrow,
  SecLabel,
  Pulse,
  Chip,
  SEButton,
  SECard,
  HoneyBanner,
  CountdownCells,
  SEDarkPanel,
  Wordmark,
} from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';

/* ─── Local keyframes ────────────────────────────────
 * A couple of one-off animations that don't belong in the shared kit
 * (kit.tsx/globals.css are owned by a parallel workstream) — scoped here
 * with an `se-` prefix so they can't collide with anything global. Both
 * respect `prefers-reduced-motion` themselves so callers don't have to. */
function LocalKeyframes() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        @keyframes se-hero-glow-drift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(8px, 6px); }
        }
        .se-hero-glow-drift {
          animation: se-hero-glow-drift 30s ease-in-out infinite alternate;
        }
      }
    `}</style>
  );
}

type PreviewShowClass = {
  id: string;
  classNumber: number | null;
  sortOrder?: number | null;
  sex?: string | null;
  svCoatType?: 'stock' | 'long_stock' | null;
  classDefinition?: { type?: string | null; name?: string | null } | null;
};

/** Human-readable class name for the public classification list, matching the
 *  schedule/catalogue conventions: Special Award → "Special Award X",
 *  SV age classes → age + sex + coat, RKC → name + Dog/Bitch, JH → its name. */
function formatPublicClassName(sc: PreviewShowClass): string {
  const cd = sc.classDefinition;
  const sexLabel = sc.sex === 'dog' ? 'Dog' : sc.sex === 'bitch' ? 'Bitch' : '';
  if (isSpecialAwardClass(sc)) {
    const base = (cd?.name ?? '').replace(/^Special Award Class\s*-\s*/, 'Special Award ');
    return sc.sex == null ? `${base} Dog or Bitch` : `${base} ${sexLabel}`.trim();
  }
  if (cd?.type === 'sv_age' || sc.svCoatType) {
    const age = svDisplayAge(cd?.name);
    const coat = sc.svCoatType === 'stock'
      ? ' · Stock Coat'
      : sc.svCoatType === 'long_stock'
        ? ' · Long Stock Coat'
        : '';
    return `${age}${sexLabel ? ` ${sexLabel}` : ''}${coat}`;
  }
  if (isJuniorHandler(sc)) {
    // The label already carries "JHA"/"JHB" — strip any duplicate prefix from
    // the name so the chip doesn't read "JHA JHA Handling (6-11)".
    return (cd?.name ?? 'Junior Handling').replace(/^JH[A-Z]\s+/i, '');
  }
  return `${cd?.name ?? 'Class'}${sexLabel ? ` ${sexLabel}` : ''}`;
}

/** Splits a JH class name's trailing "(age range)" parenthetical into a name
 *  + subline pair for the classification paper-tile treatment — falls back
 *  to the whole name with no subline when it carries no age range. */
function splitJhAgeRange(name: string): { label: string; sub?: string } {
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { label: m[1], sub: m[2] } : { label: name };
}

/* ─── Decorative components ─────────────────────── */

function ClubMedallion({ logoUrl, initials }: { logoUrl?: string | null; initials: string }) {
  return (
    <div className="relative shrink-0 w-fit rounded-full ring-2 ring-se-fresh/[.55]">
      <div className="flex size-[84px] items-center justify-center rounded-full bg-se-surface p-3 shadow-[0_8px_28px_rgba(0,0,0,0.3)]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-3xl font-extrabold text-se-green">{initials}</span>
        )}
      </div>
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

/* ─── Live countdown (ticking, sticky-bar chip) ──── */
/* useCountdown lives in @/components/show-experience/use-countdown — extracted
 * for reuse by the Show Experience kit. The hero countdown now uses the kit's
 * <CountdownCells dark /> directly; this narrower ticker only feeds the
 * sticky action bar's inline "Closes in HH:MM:SS" chip. Takes the shared
 * countdown tick as a prop (see ShowPreviewClient's single useCountdown call)
 * rather than running its own 1s interval. */

function CountdownTicker({
  countdown,
}: {
  countdown: { d: number; h: number; m: number; s: number; totalSecs: number } | null;
}) {
  const c = countdown;
  if (!c) return null;
  const veryUrgent = c.totalSecs <= 86400;
  const urgent = c.d <= 3;
  const tone = veryUrgent ? 'text-red-600' : urgent ? 'text-se-honey-deep' : 'text-se-ink';
  return (
    <span className={cn('font-semibold tabular-nums', tone)}>
      {c.d > 0 ? `${c.d}d ` : ''}
      {String(c.h).padStart(2, '0')}:{String(c.m).padStart(2, '0')}:{String(c.s).padStart(2, '0')}
    </span>
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

/** Judge bio — clamped to ~4 lines with a Read more/less toggle when long. */
function JudgeBio({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = bio.length > 220;
  return (
    <div className="mt-3 border-t border-se-line pt-3">
      <p className={cn('text-pretty text-[12.5px] leading-[1.5] text-se-ink2', !expanded && isLong && 'line-clamp-4')}>
        {bio}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] font-semibold text-se-fresh-deep"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** Photo, or initials-fallback circle, shared by JudgeCard and JudgeRowD.
 *  `sizeClassName` must be a literal Tailwind size-* class (not built from a
 *  numeric prop) so the JIT scanner picks it up. */
function JudgeAvatar({ judge, sizeClassName }: { judge: JudgeData; sizeClassName: string }) {
  const initials = getInitials(judge.name);
  return judge.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={judge.photoUrl}
      alt={judge.name}
      className={cn(sizeClassName, 'shrink-0 rounded-full object-cover')}
    />
  ) : (
    <div
      aria-hidden="true"
      className={cn(
        sizeClassName,
        'flex shrink-0 items-center justify-center rounded-full border border-se-fresh-line bg-se-fresh-soft text-lg font-semibold text-se-fresh-deep'
      )}
    >
      {initials}
    </div>
  );
}

/** Name/affix + role/classCount text block shared by JudgeCard and
 *  JudgeRowD. `as` picks the name element (h3 for JudgeCard's heading vs a
 *  plain p for JudgeRowD's denser row) — callers supply the wrapping
 *  min-w-0 flex-1 container since JudgeRowD adds a bio line after this. */
function JudgeHeader({
  judge,
  classCount,
  as: NameTag = 'p',
}: {
  judge: JudgeData;
  classCount?: number;
  as?: 'h3' | 'p';
}) {
  return (
    <>
      <NameTag className={cn(SE_H, 'font-semibold', 'truncate text-[19px] leading-[1.1] text-se-ink')}>
        {judge.name}{' '}
        {judge.affix && <span className="text-sm font-normal italic text-se-ink3">({judge.affix})</span>}
      </NameTag>
      <p className="mt-0.5 text-[12.5px] text-se-ink2">
        {judge.role}
        {classCount !== undefined && classCount > 0
          ? ` · ${classCount} ${classCount === 1 ? 'class' : 'classes'}`
          : ''}
      </p>
    </>
  );
}

function JudgeCard({ judge, classCount }: { judge: JudgeData; classCount?: number }) {
  return (
    <SECard className="px-[18px] py-4">
      <div className="flex items-center gap-3">
        <JudgeAvatar judge={judge} sizeClassName="size-[52px]" />
        <div className="min-w-0 flex-1">
          <JudgeHeader judge={judge} classCount={classCount} as="h3" />
        </div>
      </div>

      {(judge.jepLevel || judge.kcNumber) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-se-line pt-3">
          {judge.jepLevel && (
            <Chip tone="fresh">
              <ShieldCheck className="size-3" />
              JEP {judge.jepLevel}
            </Chip>
          )}
          {judge.kcNumber && <Chip>RKC · {judge.kcNumber}</Chip>}
        </div>
      )}

      {judge.breeds.length > 0 && judge.breeds.length <= 5 && (
        <p className="mt-3 border-t border-se-line pt-3 text-[12.5px] italic text-se-ink2">
          {judge.breeds.join(' · ')}
        </p>
      )}

      {judge.bio && <JudgeBio bio={judge.bio} />}
    </SECard>
  );
}

/** Desktop (lg+) judge row — a denser horizontal layout for the 2-col judges
 *  grid in the desktop composition, vs JudgeCard's vertical mobile layout. */
function JudgeRowD({ judge, classCount }: { judge: JudgeData; classCount?: number }) {
  return (
    <div className="flex items-center gap-[13px] py-3.5">
      <JudgeAvatar judge={judge} sizeClassName="size-[54px]" />
      <div className="min-w-0 flex-1">
        <JudgeHeader judge={judge} classCount={classCount} as="p" />
        {judge.bio && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.5] text-se-ink2">{judge.bio}</p>
        )}
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────── */

export function ShowPreviewClient() {
  const params = useParams();
  const idOrSlug = params.id as string;
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [widgetDismissed, setWidgetDismissed] = useState(false);

  // Capture ?src=<channel> from share URLs into sessionStorage so it survives
  // the trip through the Enter flow and lands on the order row at checkout.
  useEffect(() => {
    captureReferralSource(idOrSlug);
  }, [idOrSlug]);

  // iOS rubber-band overscroll backstop (#17). Any in-document paint (fixed
  // or absolute, however positioned) still sits behind the sticky/
  // backdrop-blur site Header at rest, because this page's own container
  // starts below the header — there's no DOM position that's "above the
  // header" without also being "above the document". Safari fills the
  // elastic overscroll reveal with the <html> element's own canvas
  // background color, which paints outside the document entirely (never
  // behind anything in it) — so that's the actual lever. Scoped to this
  // page only, cleaned up on unmount. Trade-off accepted: the bottom
  // rubber-band also shows se-deep, not just the top.
  useEffect(() => {
    document.documentElement.classList.add('se-canvas-deep');
    return () => document.documentElement.classList.remove('se-canvas-deep');
  }, []);

  const { data: show, isLoading } = trpc.shows.getById.useQuery({ id: idOrSlug });
  const { data: showSponsors } = trpc.shows.getShowSponsors.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show?.id }
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
  // Where the big "Enter This Show" CTAs point. (This file used to be a
  // /preview mockup where enterHref pointed back at the real show page; now
  // that this IS the live show page, we need the actual entry flow.)
  const enterHref = `/shows/${slug}/enter`;

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
      isSac: boolean;
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
          isSac: false,
        });
      }
      const agg = m.get(jid)!;
      const bname = (ja as { breed?: { name?: string } }).breed?.name;
      if (bname) agg.breeds.add(bname);
      const sex = (ja as { sex?: string }).sex;
      if (sex) agg.sexes.add(sex);
      else agg.hasNullSex = true;
      // SAC judge assignments are marked with isSpecialAwardsClassesJudge
      // — without this check, the SAC judge (whose assignments have no
      // breed and no sex) falls through to the Junior Handling bucket.
      if ((ja as { isSpecialAwardsClassesJudge?: boolean }).isSpecialAwardsClassesJudge) {
        agg.isSac = true;
      }
    }
    return Array.from(m.values()).map((agg): JudgeData => {
      const breedArr = Array.from(agg.breeds).sort();
      const onlyJh = breedArr.length > 0 && breedArr.every((b) => juniorBreedSet.has(b) && !breedBreedSet.has(b));
      const isJH = !agg.isSac && (onlyJh || (hasJH && agg.hasNullSex && agg.sexes.size === 0));
      let role: string;
      if (agg.isSac) role = 'Special Awards Classes';
      else if (isJH) role = 'Junior Handling';
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
    type Group = {
      breed: string;
      classes: number;
      classList: { id: string; label: string; name: string }[];
      isJH: boolean;
      isSac: boolean;
      judgeName?: string;
    };
    if (!show) return [] as Group[];

    const allClasses = (show.showClasses ?? []) as PreviewShowClass[];
    // Single source of truth for the per-class label (RKC number, SV 1a/1b,
    // JHA, SAC letter) — shared with the schedule + catalogue.
    const labelMap = buildClassLabelMap(allClasses, show.showRuleset);

    const m = new Map<string, { rows: PreviewShowClass[]; isJH: boolean; isSac: boolean; judgeName?: string }>();
    for (const sc of allClasses) {
      const breedName = (sc as { breed?: { name?: string } | null }).breed?.name;
      const isJH = sc.classDefinition?.type === 'junior_handler';
      // SAC classes have classDefinition.type === 'special' + a "Special Award
      // Class" name — bucketed separately so they don't vanish into the main
      // count (Amanda 2026-05-27).
      const isSac = isSpecialAwardClass(sc);
      let groupName: string;
      if (isJH) groupName = 'Junior Handling';
      else if (isSac) groupName = 'Special Award Classes';
      else if (breedName) groupName = breedName;
      else if (singleBreedName) groupName = singleBreedName;
      else groupName = 'Breed Classes';

      if (!m.has(groupName)) m.set(groupName, { rows: [], isJH, isSac });
      m.get(groupName)!.rows.push(sc);
    }

    // Attach judges: use the pre-aggregated `judges` list with its resolved roles
    for (const [groupName, entry] of m) {
      if (entry.isSac) {
        const sac = judges.find((j) => j.role === 'Special Awards Classes');
        if (sac) entry.judgeName = sac.name;
      } else if (entry.isJH) {
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

    // Sort: main breed(s) first, then Special Awards, then Junior Handling.
    return Array.from(m.entries())
      .map(([breed, v]): Group => ({
        breed,
        classes: v.rows.length,
        // The full classification, in canonical order, ready to render on-page.
        // Sort by the label's number then letter (so SV reads 1a, 1b, 2a, 2b
        // like the schedule does — not by raw sortOrder); fall back to sortOrder
        // for labels with no number (JH "JHA", SAC "A").
        classList: [...v.rows]
          .map((sc) => ({
            id: sc.id,
            label: getClassLabel(sc, labelMap),
            name: formatPublicClassName(sc),
            sortOrder: sc.sortOrder ?? 0,
          }))
          .sort((a, b) => {
            const pa = a.label.match(/^(\d+)([a-z]?)$/i);
            const pb = b.label.match(/^(\d+)([a-z]?)$/i);
            if (pa && pb) {
              const diff = Number(pa[1]) - Number(pb[1]);
              return diff !== 0 ? diff : (pa[2] || '').localeCompare(pb[2] || '');
            }
            return a.sortOrder - b.sortOrder;
          })
          .map(({ id, label, name }) => ({ id, label, name })),
        isJH: v.isJH,
        isSac: v.isSac,
        judgeName: v.judgeName,
      }))
      .sort((a, b) => {
        const rank = (g: Group) => (g.isJH ? 2 : g.isSac ? 1 : 0);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.breed.localeCompare(b.breed);
      });
  }, [show, judges, singleBreedName]);

  /* Per-class fee groups — surfaces "Special Award classes £3",
   * "Baby Puppy classes £4" etc. in the public Entry Fees panel
   * when the secretary set a class fee override (Amanda 2026-05-27).
   * Mirrors the same grouping the schedule PDF uses. */
  const perClassFeeGroups = useMemo(() => {
    const showAny = show as { firstEntryFee?: number | null; showClasses?: Array<{ entryFee?: number | null; classDefinition?: { name?: string; type?: string } }> } | null;
    const firstFee = showAny?.firstEntryFee;
    if (!showAny || firstFee == null) return [] as Array<{ label: string; fee: number }>;
    const seen = new Map<string, { label: string; fee: number }>();
    for (const sc of showAny.showClasses ?? []) {
      if (sc.entryFee == null) continue;
      if (sc.entryFee === firstFee) continue;
      if (sc.classDefinition?.type === 'junior_handler') continue;
      const rawName = sc.classDefinition?.name?.trim() ?? '';
      if (!rawName) continue;
      const groupName = rawName.startsWith('Special Award Class') ? 'Special Award' : rawName;
      const key = `${groupName}|${sc.entryFee}`;
      if (seen.has(key)) continue;
      seen.set(key, { label: `${groupName} classes`, fee: sc.entryFee });
    }
    return Array.from(seen.values()).sort((a, b) => a.fee - b.fee || a.label.localeCompare(b.label));
  }, [show]);

  /* Regional (SV/WUSV) fee config → the same fee levels the schedule PDF and
   * checkout resolve, plus flat-priced special classes (Baby Puppy £10 —
   * Mandy 2026-07-10), so the public panel can't promise a price the till
   * doesn't charge. */
  const regionalCfg =
    show?.showRuleset === 'wusv' ? show.regionalFeeConfig ?? null : null;
  const regionalFees = useMemo(() => {
    if (!regionalCfg) return null;
    return {
      ...buildRegionalFeeDisplay(regionalCfg),
      firstTimeEnabled: !!regionalCfg.firstTimeEnabled,
      firstTimeFeePence: regionalCfg.firstTimeFeePence ?? 0,
      specialClasses: buildRegionalSpecialClassFees(
        (show?.showClasses ?? []).map((sc) => ({
          className: sc.classDefinition?.name,
          classType: sc.classDefinition?.type,
          entryFee: sc.entryFee ?? null,
        })),
        regionalCfg.tiers,
      ),
    };
  }, [show, regionalCfg]);

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

  // Single shared countdown tick for the whole page — CountdownCells (mobile
  // hero + desktop rail) and CountdownTicker (sticky bar) all read from this
  // one hook instead of each running their own 1s interval. Must be called
  // unconditionally before the loading early-return below (Rules of Hooks),
  // so entryCloseDate is derived here rather than from the later `showAny`
  // cast — same underlying field either way.
  const entryCloseDateRaw = (show as { entryCloseDate?: string | null } | null | undefined)?.entryCloseDate;
  const entryCloseDate = entryCloseDateRaw ? new Date(entryCloseDateRaw) : null;
  const countdown = useCountdown(entryCloseDate);

  // Mobile section entrances (#6) — one useInView per lg:hidden section, kept
  // unconditional per Rules of Hooks even though the sections themselves are
  // conditionally rendered below. The sticky action bar's "just stuck" reveal
  // (#12) is a sibling concern, same IntersectionObserver family.
  const ctaCardInView = useInView<HTMLElement>();
  const judgesInView = useInView<HTMLElement>();
  const classificationInView = useInView<HTMLElement>();
  const theDayInView = useInView<HTMLElement>();
  const shareKitInView = useInView<HTMLDivElement>();
  const stickyBar = useStuckReveal<HTMLDivElement>(72); // top-[4.5rem] = 72px

  if (isLoading || !show) {
    return (
      <div className="show-exp min-h-screen bg-se-paper">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="h-4 w-24 animate-pulse rounded bg-se-line2" />
          <div className="mt-4 h-12 w-3/4 animate-pulse rounded bg-se-line2" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-se-line2/70" />
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
    multiDogThreshold?: number | null;
    multiDogPackagePence?: number | null;
    showRuleset?: 'rkc' | 'wusv';
    endTime?: string | null;
    startTime?: string | null;
    showOpenTime?: string | null;
    entriesOpenDate?: string | null;
    entryCloseDate?: string | null;
    acceptsPostalEntries?: boolean;
    kcLicenceNo?: string | null;
    hasPublishedResults?: boolean;
    discountGroups?: Array<{
      label: string;
      firstEntryFeePence: number;
      multiDogPackagePence: number | null;
    }>;
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
      directions?: string;
      what3words?: string;
    };
  };

  const org = show.organisation;
  const venue = show.venue;
  // entryCloseDate is derived earlier (before the loading early-return) so
  // the shared useCountdown() call above can use it.
  const closeDatePast = entryCloseDate ? entryCloseDate.getTime() < Date.now() : false;
  // "Open" requires status=entries_open AND the close date not yet passed.
  // Show DB status can lag for a few minutes after the cron flips it, so
  // gating on the close date catches the window where the page would
  // otherwise still offer entry past the deadline.
  const isOpen = show.status === 'entries_open' && !closeDatePast;
  const daysToClose = entryCloseDate ? differenceInDays(entryCloseDate, new Date()) : null;
  const showDate = format(parseISO(show.startDate), 'EEEE d MMMM yyyy');
  const showYear = format(parseISO(show.startDate), 'yyyy');
  const showType = displayShowTypeLabel(show.showType, show.showRuleset);
  const totalClasses = (show.showClasses ?? []).length;
  const breedCount = breedGroups.filter((g) => !g.isJH && !g.isSac).length;
  // Main show sponsors — Title and Show tiers both head the page.
  // Class / Prize / Advertiser tiers stay off the public page per
  // Amanda 2026-05-28 (keep the hero about the headline backers).
  const mainSponsors = (showSponsors ?? []).filter(
    (s) => s.tier === 'title' || s.tier === 'show',
  );
  // RKC registration branding never applies to SV/WUSV regional shows
  // (project_regional_kc_cleanup — strip all RKC/KC leaks from regional
  // surfaces).
  const kcRegNumber =
    show.showRuleset !== 'wusv'
      ? (org as { kcRegNumber?: string | null } | null | undefined)?.kcRegNumber
      : null;
  const what3words = showAny.scheduleData?.what3words?.replace(/^\/+/, '');

  // Desktop right-rail quick facts — only cells backed by real data.
  const quickFacts: Array<[string, string]> = [
    ['Date', format(parseISO(show.startDate), 'EEE d MMM')],
  ];
  if (showAny.startTime) quickFacts.push(['Judging', showAny.startTime]);
  if (venue) quickFacts.push(['Venue', venue.name]);
  if (showAny.showOpenTime) quickFacts.push(['Doors', showAny.showOpenTime]);

  return (
    <div className="show-exp min-h-screen bg-se-paper text-se-ink">
      <LocalKeyframes />
      {/* ──────────────────────────── Banner (if set) ─────────────────────── */}
      {showAny.bannerImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={showAny.bannerImageUrl}
          alt={`${show.name} banner`}
          className="h-44 w-full object-cover sm:h-60 lg:h-80"
        />
      )}

      {/* ──────────────────────────── Hero (mobile/tablet) ─────────────────── */}
      {/* glow={false}: the kit's own glow blob is static (no exposed hook to
          animate it without editing kit.tsx, which is owned elsewhere) — we
          render an equivalent one ourselves with the slow drift (#5) added. */}
      <SEDarkPanel as="header" angle={172} glow={false} className="lg:hidden">
        <div
          aria-hidden="true"
          className="se-hero-glow-drift pointer-events-none absolute -right-[90px] -top-[70px] size-[260px] rounded-full opacity-[0.28]"
          style={{ background: 'radial-gradient(circle, #5bb579, transparent 68%)' }}
        />
        <div className="mx-auto max-w-4xl px-5 pb-[22px] sm:px-6">
          {/* Top row: back-link + wordmark (isolated row — sharing lives in
              the sticky bar + "Spread the word" section, not here). */}
          <div className="flex items-center justify-between pb-4 pt-2">
            <Link
              href="/shows"
              className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-se-cream/[.66] transition-colors hover:text-se-cream"
            >
              <ChevronLeft className="size-[18px]" />
              Shows
            </Link>
            <Link href="/" aria-label="Remi">
              <Wordmark className="text-se-cream" />
            </Link>
          </div>

          {/* Crest row — club crest beside the venue name, mirroring desktop */}
          <div className="mt-3.5 flex items-end gap-3.5">
            <ClubMedallion logoUrl={org?.logoUrl} initials={getInitials(org?.name ?? '?')} />
            {venue && (
              <div className="pb-0.5">
                <p className="text-[12.5px] text-se-cream/80">{venue.name}</p>
              </div>
            )}
          </div>

          <h1 className={cn(SE_H, 'mt-4 max-w-2xl text-balance text-[37px] leading-[1.02] text-se-cream')}>
            {org?.name}
          </h1>
          <p className={cn(SE_H, 'font-medium', 'mt-2 text-lg italic text-se-fresh')}>
            {show.name} {showYear}
          </p>
          <p className="mt-2 text-[13px] text-se-cream/[.82]">
            {showDate}
            {venue ? ` · ${venue.name}` : ''}
          </p>

          {/* Chip row */}
          <div className="mt-4 flex flex-wrap gap-[7px]">
            {isOpen && (
              <Chip tone="onDark">
                <Pulse /> Entries open
              </Chip>
            )}
            <Chip tone="onDark">
              <Award className="size-3" /> {showType}
            </Chip>
            {singleBreedName && <Chip tone="onDark">{singleBreedName}</Chip>}
            {kcRegNumber && (
              <Chip tone="onDark">
                <ShieldCheck className="size-3" /> RKC Registered
              </Chip>
            )}
          </div>

          {/* Sponsors — Title/Show tiers only (Amanda 2026-05-28) */}
          {mainSponsors.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-3 border-t border-se-cream/15 pt-5 text-center">
              <Eyebrow className="text-se-fresh/80">
                {mainSponsors.length === 1 ? 'In association with' : 'Proudly sponsored by'}
              </Eyebrow>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
                {mainSponsors.map((s) => (
                  <div key={s.id} className="flex items-center">
                    {s.sponsor.logoUrl ? (
                      <span className="flex h-9 items-center rounded-lg bg-se-cream/95 px-2.5 sm:h-10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.sponsor.logoUrl} alt={s.sponsor.name} className="h-6 object-contain sm:h-7" />
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-se-cream">{s.sponsor.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entries-close banner — always paired with the absolute date next
              to the countdown (Amanda 2026-05-27: "22 days" alone confused a
              BAGSD user because the actual date wasn't visible). */}
          {isOpen && entryCloseDate && (
            <HoneyBanner
              // HoneyBanner's `label` prop is typed `string` and just gets
              // interpolated as `{label}` inside an <Eyebrow> — a ReactNode
              // renders there fine at runtime. kit.tsx is owned by a parallel
              // workstream so the type isn't being widened here; this cast is
              // the narrow, contained workaround for the under-24h Pulse dot
              // (#3) rather than duplicating HoneyBanner's markup.
              label={
                (
                  <span className="inline-flex items-center gap-[7px]">
                    Entries close
                    {countdown && countdown.totalSecs < 86400 && <Pulse />}
                  </span>
                ) as unknown as string
              }
              date={`${format(entryCloseDate, 'EEE d MMM')} · ${formatCloseTimeUK(entryCloseDate)}`}
              className="mt-[18px]"
            >
              <CountdownCells countdown={countdown} dark />
            </HoneyBanner>
          )}
        </div>
      </SEDarkPanel>

      {/* ──────────────────────────── Hero (desktop, lg+) ───────────────────
          Keeps the site's real <Header/> (rendered by the (shows) layout)
          above this — no duplicate back-link/wordmark row here. */}
      <div className="relative hidden h-[260px] overflow-hidden bg-[linear-gradient(120deg,#20452c,#152e1d)] lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(105deg,#152e1d_12%,rgba(21,46,29,0.72)_40%,rgba(21,46,29,0.1)_100%)]"
        />
        <div className="absolute left-11 top-1/2 max-w-xl -translate-y-1/2">
          <div className="flex items-center gap-3.5">
            <div className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-se-surface p-3 ring-[3px] ring-se-cream">
              {org?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logoUrl} alt="" className="size-full object-contain" />
              ) : (
                <span className="text-2xl font-extrabold text-se-green">{getInitials(org?.name ?? '?')}</span>
              )}
            </div>
            {venue && <p className="text-[13px] text-se-cream/85">{venue.name}</p>}
          </div>
          <h1 className={cn(SE_H, 'mt-4 text-balance text-[2.875rem] leading-none text-se-cream')}>{org?.name}</h1>
          <p className="mt-2 text-xl font-medium italic text-se-fresh">
            {show.name} {showYear}
          </p>
        </div>
      </div>

      {/* ─── LIVE RESULTS banner — appears as soon as ANY class has been
           published, regardless of whether the show is formally
           "in_progress". Drops to a calmer tone once the show is completed
           so the pulsing dot doesn't carry on weeks later. ── */}
      {(showAny.hasPublishedResults || show.status === 'in_progress') && (
        <Link
          href={`/shows/${slug}/results`}
          className={cn(
            'block text-se-cream shadow-md transition-opacity hover:opacity-95',
            show.status === 'completed' ? 'bg-se-ink2' : 'bg-gradient-to-r from-red-600 via-red-500 to-red-600'
          )}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-3 py-3 sm:gap-4 sm:py-3.5">
            {show.status !== 'completed' && (
              <span className="relative flex size-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-white" />
              </span>
            )}
            <span className="text-sm font-bold uppercase tracking-[0.2em] sm:text-base sm:tracking-[0.25em]">
              {show.status === 'completed' ? 'Results Available' : 'Live Results'}
            </span>
            <span className="hidden text-xs font-medium opacity-90 sm:inline">
              {show.status === 'completed'
                ? 'See who took the top prizes →'
                : "See who's winning right now →"}
            </span>
            <span className="text-xs font-semibold sm:hidden">View →</span>
          </div>
        </Link>
      )}

      {/* ──────────────────────────── Sticky action bar ──────────────────── */}
      {/* Zero-height sentinel just above the bar — useStuckReveal watches it
          leave the viewport (past the bar's own top-[4.5rem] offset) to know
          the exact moment the bar starts sticking, then fires the one-shot
          "just stuck" entrance below (#12). */}
      <div ref={stickyBar.sentinelRef} aria-hidden="true" />
      <div
        className={cn(
          'sticky top-[4.5rem] z-40 border-b border-se-line bg-se-surface/95 shadow-sm backdrop-blur-md',
          stickyBar.stuck && 'animate-in fade-in slide-in-from-top-2 duration-200'
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4 lg:px-6">
          {isOpen ? (
            <SEButton
              asChild
              variant="fresh"
              className="h-12 flex-1 px-5 text-base sm:h-11 sm:flex-initial sm:shrink-0 sm:px-5"
            >
              <Link href={enterHref}>
                <Ticket className="size-5 sm:size-4" />
                Enter This Show
              </Link>
            </SEButton>
          ) : show.status === 'in_progress' || show.status === 'completed' || showAny.hasPublishedResults ? (
            <Button
              className={cn(
                'h-12 flex-1 px-5 text-base font-semibold shadow-lg sm:h-11 sm:flex-initial sm:shrink-0 sm:px-5 text-white',
                show.status === 'completed'
                  ? 'bg-se-ink2 hover:bg-se-ink2/90 shadow-se-ink2/30'
                  : 'bg-red-600 hover:bg-red-700 shadow-red-600/30'
              )}
              asChild
            >
              <Link href={`/shows/${slug}/results`}>
                <Trophy className="size-5 sm:size-4" />
                {show.status === 'completed' ? 'View Results' : 'View Live Results'}
              </Link>
            </Button>
          ) : (
            <div className="flex-1 text-sm font-medium text-se-ink2 sm:flex-initial">{
              show.status === 'cancelled'
                ? 'Cancelled'
                : show.status === 'draft' || show.status === 'published'
                  ? 'Entries opening soon'
                  : 'Entries closed'
            }</div>
          )}

          {isOpen && entryCloseDate && (
            <div className="hidden items-center gap-1.5 rounded-full bg-se-honey-soft px-3 py-1.5 sm:inline-flex">
              <Clock className="size-3.5 text-se-honey-deep" />
              <span className="text-xs font-semibold text-se-honey-ink">
                Closes in <CountdownTicker countdown={countdown} />
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 border-se-line2 text-se-ink2 hover:bg-se-paper2" asChild>
              <a
                href={`/api/schedule/${show.id}`}
                target="_blank"
                rel="noopener"
                aria-label="View the show schedule (PDF) — no account needed"
              >
                <FileText className="size-4" />
                {/* Always show the word — the icon alone wasn't obvious enough
                    (Mandy 2026-06-14: "not everyone will know the sign means
                    schedule"). */}
                <span>Schedule</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-se-line2 text-se-ink2 hover:bg-se-paper2" asChild>
              <a href={`/api/shows/${show.id}/calendar`}>
                <CalendarPlus className="size-4" />
                <span className="hidden sm:inline">Add to Calendar</span>
              </a>
            </Button>
            <ShareKitDialog
              showId={show.id}
              showName={show.name}
              showType={showType}
              showDate={showDate}
              organisationName={org?.name ?? ''}
              venueName={venue?.name}
              entryCloseDate={show.entryCloseDate ?? null}
              shareUrl={
                typeof window !== 'undefined'
                  ? `${window.location.origin}/shows/${slug}`
                  : `https://remishowmanager.co.uk/shows/${slug}`
              }
              onShare={(channel) => {
                fetch('/api/share-events', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ showId: show.id, channel }),
                  keepalive: true,
                }).catch(() => {});
              }}
            />
          </div>
        </div>
      </div>

      {/* Reassurance strip — the schedule is public, but the page never said so,
          and exhibitors were phoning to ask "do I need to log in to see the
          schedule?" (Mandy 2026-06-13). */}
      {show.status !== 'cancelled' && (
        <div className="border-b border-se-line bg-se-paper2/70">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2.5 text-center text-xs text-se-ink2 sm:px-6 lg:px-8">
            <FileText className="size-3.5 shrink-0 text-se-ink3" />
            <span>You don&apos;t need an account to read the schedule — only to enter.</span>
            <a
              href={`/api/schedule/${show.id}`}
              target="_blank"
              rel="noopener"
              className="font-semibold text-se-fresh-deep underline-offset-2 hover:underline"
            >
              View the schedule (PDF) →
            </a>
          </div>
        </div>
      )}

      {/* ══════════════════════════ Body (paper) ═══════════════════════════ */}
      <div className="relative z-10 -mt-0.5 rounded-t-[22px] bg-se-paper">
        {/* ──────────────────────────── Desktop (lg+) two-column layout ──────
            Replaces the CTA card / judges / classification / the-day mobile
            sections below with the approved desktop composition: left column
            (chips, description, judges, classification, at-the-show) + a
            344px right rail (entries-close + quick facts + CTA, then the
            ShareKit card). */}
        <div className="hidden gap-10 px-11 py-[34px] lg:flex lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {isOpen && (
                <Chip tone="fresh">
                  <Pulse /> Entries open
                </Chip>
              )}
              <Chip>
                <Award className="size-3" /> {showType}
              </Chip>
              {singleBreedName && <Chip>{singleBreedName}</Chip>}
              {showAny.kcLicenceNo && (
                <Chip>{showAny.showRuleset === 'wusv' ? 'WUSV' : 'RKC'} licensed · {showAny.kcLicenceNo}</Chip>
              )}
            </div>

            {show.description && (
              <p className={cn(SE_H, 'font-medium', 'mt-[22px] max-w-[620px] text-xl leading-[1.5] text-se-ink2 text-pretty')}>
                {show.description}
              </p>
            )}

            {judges.length > 0 && (
              <div className="mt-[34px] max-w-[680px]">
                <SecLabel
                  right={<span className="text-xs font-semibold text-se-fresh-deep">{totalClasses} classes</span>}
                >
                  Your judges
                </SecLabel>
                <div className="grid grid-cols-2 gap-3.5">
                  {judges.map((j) => (
                    <SECard key={j.id} className="px-[18px] py-1">
                      <JudgeRowD judge={j} classCount={judgeClassCounts.get(j.name)} />
                    </SECard>
                  ))}
                </div>
              </div>
            )}

            {breedGroups.length > 0 && (
              <div className="mt-8 max-w-3xl">
                <SecLabel>Classification</SecLabel>
                <SECard className="pt-4 px-5 pb-[18px]">
                  <div className="columns-2 gap-x-8">
                    {breedGroups.map(({ breed, classes, classList, judgeName }) => (
                      <div key={breed} className="break-inside-avoid pb-4">
                        <p className={cn(SE_H, 'font-semibold', 'mb-1.5 text-base text-se-ink')}>
                          {breed}{' '}
                          <span className="text-xs font-normal text-se-ink3">
                            {classes} {classes === 1 ? 'class' : 'classes'}
                            {judgeName ? ` · ${judgeName}` : ''}
                          </span>
                        </p>
                        {classList.map((c) => (
                          <div key={c.id} className="flex gap-2 py-0.5 text-[13px] text-se-ink2">
                            {c.label && (
                              <span className={cn(SE_H, 'font-semibold', 'min-w-[16px] shrink-0 text-se-fresh-deep')}>
                                {c.label}
                              </span>
                            )}
                            <span>{c.name}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </SECard>
              </div>
            )}

            {(showAny.scheduleData?.catering || showAny.scheduleData?.wetWeatherAccommodation) && (
              <div className="mt-8 max-w-3xl">
                <SecLabel>At the show</SecLabel>
                <SECard className="p-5">
                  <div className="grid grid-cols-3 gap-4">
                    {showAny.scheduleData?.catering && (
                      <Facility label="Catering" value={showAny.scheduleData.catering} />
                    )}
                    {showAny.scheduleData?.wetWeatherAccommodation && (
                      <Facility label="Weather" value={showAny.scheduleData.wetWeatherAccommodation} />
                    )}
                  </div>
                </SECard>
              </div>
            )}
          </div>

          {/* Right rail — 344px, hidden below lg (handled by the parent flex) */}
          <div className="flex w-[344px] shrink-0 flex-col gap-4">
            <SECard className="overflow-hidden">
              {isOpen && entryCloseDate && (
                <div className="flex items-center justify-between bg-se-honey px-[18px] py-[13px]">
                  <div>
                    <Eyebrow className="inline-flex items-center gap-[7px] text-[rgba(74,48,6,0.7)]">
                      Entries close
                      {countdown && countdown.totalSecs < 86400 && <Pulse />}
                    </Eyebrow>
                    <p className={cn(SE_H, 'font-semibold', 'mt-0.5 whitespace-nowrap text-[16px] text-se-honey-ink')}>
                      {format(entryCloseDate, 'EEE d MMM')}
                    </p>
                  </div>
                  <CountdownCells countdown={countdown} dark />
                </div>
              )}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {quickFacts.map(([k, v]) => (
                    <div key={k} className="rounded-[10px] bg-se-paper px-3 py-2.5">
                      <Eyebrow>{k}</Eyebrow>
                      <p className={cn(SE_H, 'font-semibold', 'mt-[3px] truncate text-sm text-se-ink')}>{v}</p>
                    </div>
                  ))}
                </div>

                {isOpen ? (
                  <>
                    <SEButton asChild variant="fresh" full className="mt-3.5">
                      <Link href={enterHref}>
                        <Ticket className="size-[17px]" />
                        Enter
                        {showAny.firstEntryFee != null ? ` · from ${formatCurrency(showAny.firstEntryFee)}` : ''}
                      </Link>
                    </SEButton>
                    <SEButton asChild variant="ghost" size="sm" full className="mt-2">
                      <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener">
                        <FileText className="size-[15px]" />
                        Schedule (PDF)
                      </a>
                    </SEButton>
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-se-line pt-3">
                      {TRUST_BULLETS.filter((b) => !b.requiresPostal || showAny.acceptsPostalEntries).map((b) => (
                        <TrustRow key={b.shortLabel} icon={b.icon} compact>
                          {b.shortLabel}
                        </TrustRow>
                      ))}
                    </div>
                  </>
                ) : show.status === 'in_progress' || show.status === 'completed' || showAny.hasPublishedResults ? (
                  <SEButton asChild variant={show.status === 'completed' ? 'primary' : 'fresh'} full className="mt-3.5">
                    <Link href={`/shows/${slug}/results`}>
                      <Trophy className="size-[17px]" />
                      {show.status === 'completed' ? 'View Results' : 'View Live Results'}
                    </Link>
                  </SEButton>
                ) : (
                  <p className="mt-3.5 text-center text-sm font-medium text-se-ink2">
                    {show.status === 'cancelled'
                      ? 'This show has been cancelled.'
                      : show.status === 'draft' || show.status === 'published'
                        ? 'Entries are opening soon.'
                        : 'Entries for this show have closed.'}
                  </p>
                )}
              </div>
            </SECard>

            {show.status !== 'cancelled' && (
              <ShareKitCard
                showId={show.id}
                showName={show.name}
                showType={showType}
                showDate={showDate}
                organisationName={org?.name ?? ''}
                venueName={venue?.name}
                entryCloseDate={show.entryCloseDate ?? null}
                shareUrl={
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/shows/${slug}`
                    : `https://remishowmanager.co.uk/shows/${slug}`
                }
                onShare={(channel) => {
                  fetch('/api/share-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ showId: show.id, channel }),
                    keepalive: true,
                  }).catch(() => {});
                }}
                className="mx-0 max-w-none px-0 py-0 sm:px-0 sm:py-0"
              />
            )}
          </div>
        </div>

        {/* ──────────────────────────── Mobile/shared section flow ───────────
            One padded container (design green-live Page/Sec rhythm) — each
            section below just adds mt-[22px] instead of carrying its own
            mx-auto/max-w/px/py. */}
        <div className="mx-auto max-w-4xl px-4 pt-[18px]">
        {/* ──────────────────────────── CTA card (mobile/tablet) ────────────── */}
        <section
          ref={ctaCardInView.ref}
          className={cn(
            'lg:hidden transition-all duration-[240ms] ease-out motion-reduce:transition-none',
            ctaCardInView.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          )}
        >
          {isOpen ? (
            <SECard className="p-4">
              <SEButton asChild variant="fresh" full>
                <Link href={enterHref}>
                  <Flag className="size-[18px]" />
                  Enter this show
                  {showAny.firstEntryFee != null ? ` · from ${formatCurrency(showAny.firstEntryFee)}` : ''}
                </Link>
              </SEButton>
              <SEButton asChild variant="ghost" size="sm" full className="mt-2">
                <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener">
                  <FileText className="size-[15px]" />
                  Read the full schedule (PDF)
                </a>
              </SEButton>
              <div className="mt-3.5 flex flex-col gap-2 border-t border-se-line pt-[13px]">
                {TRUST_BULLETS.filter((b) => !b.requiresPostal || showAny.acceptsPostalEntries).map((b) => (
                  <TrustRow key={b.label} icon={b.icon}>
                    {b.label}
                  </TrustRow>
                ))}
              </div>
            </SECard>
          ) : show.status === 'in_progress' || show.status === 'completed' || showAny.hasPublishedResults ? (
            <SECard className="p-4">
              <SEButton asChild variant={show.status === 'completed' ? 'primary' : 'fresh'} full>
                <Link href={`/shows/${slug}/results`}>
                  <Trophy className="size-[18px]" />
                  {show.status === 'completed' ? 'View Results' : 'View Live Results'}
                </Link>
              </SEButton>
              <SEButton asChild variant="ghost" size="sm" full className="mt-2">
                <a href={`/api/schedule/${show.id}`} target="_blank" rel="noopener">
                  <FileText className="size-[15px]" />
                  Read the full schedule (PDF)
                </a>
              </SEButton>
            </SECard>
          ) : (
            <SECard className="p-4 text-center text-sm font-medium text-se-ink2">
              {show.status === 'cancelled'
                ? 'This show has been cancelled.'
                : show.status === 'draft' || show.status === 'published'
                  ? 'Entries are opening soon.'
                  : 'Entries for this show have closed.'}
            </SECard>
          )}
        </section>

        {/* ──────────────────────────── Your judges (mobile/tablet) ─────────── */}
        {judges.length > 0 && (
          <section
            ref={judgesInView.ref}
            className={cn(
              'mt-[22px] lg:hidden transition-all duration-[240ms] ease-out motion-reduce:transition-none',
              judgesInView.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}
          >
            <SecLabel>Your judges</SecLabel>
            <p className="text-sm text-se-ink2">
              {judges.length === 1
                ? 'A single appointment for this show — your breed entrusted to an experienced judge.'
                : `${judges.length} judges bring breed-specific expertise to the ring.`}
            </p>
            <div className="mt-5 flex flex-col gap-[10px]">
              {judges.map((j) => (
                <JudgeCard key={j.id} judge={j} classCount={judgeClassCounts.get(j.name)} />
              ))}
            </div>
          </section>
        )}

        {/* ──────────────────────────── What's at stake ─────────────────────── */}
        {(showAny.scheduleData?.prizeMoney || showAny.scheduleData?.awardsDescription) && (
          <section className="mt-[22px]">
            <SecLabel>What&apos;s at stake</SecLabel>
            <SECard className="p-4">
              <div className="flex items-center gap-2">
                <Trophy className="size-5 text-se-honey-deep" />
                <h3 className={cn(SE_H, 'font-semibold', 'text-base text-se-ink')}>On offer</h3>
              </div>
              {showAny.scheduleData?.awardsDescription && (
                <p className="mt-3 whitespace-pre-line text-pretty text-[15px] leading-relaxed text-se-ink2">
                  {showAny.scheduleData.awardsDescription}
                </p>
              )}
              {showAny.scheduleData?.prizeMoney && (
                <div
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full bg-se-honey-soft px-4 py-1.5 text-sm font-semibold text-se-honey-ink',
                    showAny.scheduleData?.awardsDescription ? 'mt-4' : 'mt-1'
                  )}
                >
                  <PoundSterling className="size-4" />
                  {showAny.scheduleData.prizeMoney}
                </div>
              )}
            </SECard>
          </section>
        )}

        {/* ──────────────────────────── Classification (mobile/tablet) ──────── */}
        {breedGroups.length > 0 && (
          <section
            ref={classificationInView.ref}
            className={cn(
              'mt-[22px] lg:hidden transition-all duration-[240ms] ease-out motion-reduce:transition-none',
              classificationInView.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}
          >
            <SecLabel
              right={
                <span className="text-xs font-semibold text-se-fresh-deep">
                  {totalClasses} {totalClasses === 1 ? 'class' : 'classes'}
                  {breedCount > 1 ? ` · ${breedCount} breeds` : ''}
                </span>
              }
            >
              Classification
            </SecLabel>
            <div className="grid gap-3 lg:grid-cols-2">
              {breedGroups.map(({ breed, classes, classList, judgeName, isJH }) => (
                <SECard key={breed} className="px-[18px] pb-4 pt-[14px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className={cn(SE_H, 'font-semibold', 'text-[16.5px] text-se-ink')}>{breed}</p>
                    <p className="text-xs text-se-ink3">
                      {classes} {classes === 1 ? 'class' : 'classes'}
                      {judgeName ? ` · ${judgeName}` : ''}
                    </p>
                  </div>
                  {/* The full classification on the page — so exhibitors don't
                      have to open the PDF to see the classes (Mandy 2026-06-14). */}
                  <div className={cn('mt-2 grid', isJH ? 'grid-cols-2 gap-2' : 'grid-cols-1 gap-x-4 sm:grid-cols-2')}>
                    {isJH
                      ? classList.map((c) => {
                          const { label, sub } = splitJhAgeRange(c.name);
                          return (
                            <div key={c.id} className="rounded-[11px] bg-se-paper px-3 py-[9px]">
                              <p className="text-[12.5px] font-semibold text-se-ink">{label}</p>
                              {sub && <p className="text-[11.5px] text-se-ink3">{sub}</p>}
                            </div>
                          );
                        })
                      : classList.map((c) => (
                          <div key={c.id} className="flex items-baseline gap-2 py-1 text-[13px] text-se-ink2">
                            {c.label && (
                              <span className={cn(SE_H, 'font-semibold', 'min-w-[14px] shrink-0 text-se-fresh-deep')}>
                                {c.label}
                              </span>
                            )}
                            <span className="min-w-0">{c.name}</span>
                          </div>
                        ))}
                  </div>
                </SECard>
              ))}
            </div>
            <p className="mt-5 text-center text-sm text-se-ink2">
              Prefer the full document?{' '}
              <a
                href={`/api/schedule/${show.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center font-semibold text-se-fresh-deep underline-offset-2 hover:underline"
              >
                View the schedule (PDF) →
              </a>
            </p>
          </section>
        )}

        {/* ──────────────────────────── The day (mobile/tablet) ─────────────── */}
        {/* Doors/Judging are covered by the desktop rail's quick-facts grid. */}
        {(showAny.showOpenTime || showAny.startTime) && (
          <section
            ref={theDayInView.ref}
            className={cn(
              'mt-[22px] lg:hidden transition-all duration-[240ms] ease-out motion-reduce:transition-none',
              theDayInView.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}
          >
            <SecLabel>The day</SecLabel>
            <SECard className="grid grid-cols-1 divide-y divide-se-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {showAny.showOpenTime && (
                <div className="px-3 py-[13px]">
                  <Eyebrow>Doors</Eyebrow>
                  <p className={cn(SE_H, 'font-semibold', 'mt-[3px] text-[17px] text-se-ink')}>{showAny.showOpenTime}</p>
                </div>
              )}
              {showAny.startTime && (
                <div className="px-3 py-[13px]">
                  <Eyebrow>Judging</Eyebrow>
                  <p className={cn(SE_H, 'font-semibold', 'mt-[3px] text-[17px] text-se-ink')}>{showAny.startTime}</p>
                </div>
              )}
            </SECard>
          </section>
        )}

        {/* ──────────────────────────── Entry fees ──────────────────────────── */}
        <section className="mt-[22px]">
          <SecLabel right={<span className="text-xs text-se-ink3">one payment</span>}>Entry fees</SecLabel>
          <p className="text-sm text-se-ink2">
            No surprises at checkout. Every fee is listed here — and all your entries combine into a single payment at the end.
          </p>
          <SECard className="mt-5 overflow-hidden">
            <dl className="divide-y divide-se-line">
            <div className="divide-y divide-se-line px-[18px] py-1">
              {showAny.showRuleset === 'wusv' ? (
                <>
                  {/* Regional shows with a fee config price per dog with a
                       "3 or more dogs" package, one row per fee level —
                       resolved by the same helper as the schedule PDF and
                       checkout, so the three can't disagree. Flat-priced
                       special classes (Baby Puppy) get their own row. Legacy
                       regionals without a config keep the old flat rows. */}
                  {regionalFees ? (
                    <>
                      {regionalFees.levels.map((lvl) => (
                        <FeeRow
                          key={lvl.label}
                          label={regionalFees.levels.length > 1 ? lvl.label : 'Entry fee'}
                          sub={
                            regionalFees.capped
                              ? `Per dog — or ${lvl.threePlusPence === 0 ? 'free' : formatCurrency(lvl.threePlusPence)} for 3 or more dogs`
                              : 'Per dog'
                          }
                          value={lvl.perDogPence}
                          custom={lvl.perDogPence === 0 ? 'Free' : undefined}
                        />
                      ))}
                      {regionalFees.firstTimeEnabled && (
                        <FeeRow
                          label="First-time exhibitor"
                          sub="Your first dog, if you've never shown before"
                          value={regionalFees.firstTimeFeePence}
                          custom={regionalFees.firstTimeFeePence === 0 ? 'Free' : undefined}
                        />
                      )}
                      {regionalFees.specialClasses.map((g) => (
                        <FeeRow
                          key={`${g.label}-${g.fee}`}
                          label={g.label}
                          sub="Per dog"
                          value={g.fee}
                          custom={g.fee === 0 ? 'Free' : undefined}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <FeeRow label="Per dog, per class" sub="Standard rate" value={showAny.firstEntryFee} />
                      {(showAny.discountGroups ?? []).map((g) => (
                        <FeeRow
                          key={g.label}
                          label={`${g.label} rate`}
                          sub={`Per dog, per class — claim at checkout`}
                          value={g.firstEntryFeePence}
                        />
                      ))}
                      {showAny.multiDogThreshold != null && showAny.multiDogPackagePence != null && (
                        <FeeRow
                          label={`${showAny.multiDogThreshold}+ dog package`}
                          sub={`Flat package price when entering ${showAny.multiDogThreshold} or more dogs`}
                          value={showAny.multiDogPackagePence}
                        />
                      )}
                      {(showAny.discountGroups ?? [])
                        .filter((g) => g.multiDogPackagePence != null)
                        .map((g) => (
                          <FeeRow
                            key={`${g.label}-pkg`}
                            label={`${g.label} ${showAny.multiDogThreshold ?? 3}+ dog package`}
                            sub="Members get a reduced package price"
                            value={g.multiDogPackagePence!}
                          />
                        ))}
                    </>
                  )}
                  {(showAny.juniorHandlerFee == null || showAny.juniorHandlerFee === 0) ? (
                    <FeeRow label="Junior Handling" sub="Handling classes for under-18s" custom="Free" />
                  ) : (
                    <FeeRow label="Junior Handling" sub="Handling classes for under-18s" value={showAny.juniorHandlerFee} />
                  )}
                  <FeeRow
                    label="Postal entries"
                    sub="Paper form via post"
                    available={showAny.acceptsPostalEntries ?? false}
                    custom={showAny.acceptsPostalEntries ? 'Accepted — same rates' : 'Online only'}
                  />
                </>
              ) : (
                <>
                  <FeeRow label="First entry" sub="Per dog, first class" value={showAny.firstEntryFee} />
                  <FeeRow
                    label="Subsequent entries"
                    sub="Same dog, additional classes"
                    value={showAny.subsequentEntryFee ?? showAny.firstEntryFee}
                    note={showAny.subsequentEntryFee == null || showAny.subsequentEntryFee === showAny.firstEntryFee ? 'Same rate' : undefined}
                  />
                  {/* Member/discount-group rates + multi-dog package — these
                       appear on the schedule, so they must appear here too.
                       Mirrors the SV branch above and the schedule's order. */}
                  {(showAny.discountGroups ?? []).map((g) => (
                    <FeeRow
                      key={g.label}
                      label={`${g.label} (first entry)`}
                      sub="Reduced first-entry rate — claim at checkout"
                      value={g.firstEntryFeePence}
                    />
                  ))}
                  {showAny.multiDogThreshold != null && showAny.multiDogPackagePence != null && (
                    <FeeRow
                      label={`${showAny.multiDogThreshold}+ dog package`}
                      sub={`Flat package price when entering ${showAny.multiDogThreshold} or more dogs`}
                      value={showAny.multiDogPackagePence}
                    />
                  )}
                  {(showAny.discountGroups ?? [])
                    .filter((g) => g.multiDogPackagePence != null)
                    .map((g) => (
                      <FeeRow
                        key={`${g.label}-pkg`}
                        label={`${g.label} ${showAny.multiDogThreshold ?? 3}+ dog package`}
                        sub="Members get a reduced package price"
                        value={g.multiDogPackagePence!}
                      />
                    ))}
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
                  {perClassFeeGroups.map((g) => (
                    <FeeRow
                      key={`${g.label}-${g.fee}`}
                      label={g.label}
                      sub="Per-class fee override"
                      value={g.fee}
                    />
                  ))}
                  <FeeRow
                    label="Postal entries"
                    sub="Paper form via post"
                    available={showAny.acceptsPostalEntries ?? false}
                    custom={showAny.acceptsPostalEntries ? 'Accepted — same rates' : 'Online only'}
                  />
                </>
              )}
            </div>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-se-honey-soft px-5 py-3.5 text-sm font-medium text-se-honey-ink sm:px-6">
                <span className="inline-flex items-center gap-1.5"><Info className="size-4 text-se-honey-deep" /> A card processing fee is added at checkout</span>
                <span className="text-xs text-se-ink2">All prices in GBP</span>
              </div>
            </dl>
          </SECard>
        </section>

        {/* ──────────────────────────── Getting there ────────────────────────── */}
        {venue && (
          <section className="mt-[22px]">
            <SecLabel>Getting there</SecLabel>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                {venue.imageUrl && (
                  <div className="overflow-hidden rounded-[18px] border border-se-line bg-se-paper2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={venue.imageUrl} alt={venue.name} className="aspect-[16/10] w-full object-cover" />
                  </div>
                )}
                {venue.lat && venue.lng ? (
                  <div className="overflow-hidden rounded-[18px] border border-se-line bg-se-paper2">
                    <iframe
                      title={`Map of ${venue.name}`}
                      width="100%"
                      height="280"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps?q=${venue.lat},${venue.lng}&z=14&output=embed`}
                      allowFullScreen
                    />
                  </div>
                ) : venue.postcode ? (
                  <div className="overflow-hidden rounded-[18px] border border-se-line bg-se-paper2">
                    <iframe
                      title={`Map of ${venue.name}`}
                      width="100%"
                      height="280"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(venue.postcode)}&z=14&output=embed`}
                      allowFullScreen
                    />
                  </div>
                ) : null}
              </div>
              <SECard className="p-5">
                <h3 className={cn(SE_H, 'font-bold', 'text-xl text-se-ink')}>{venue.name}</h3>
                <address className="mt-1.5 whitespace-pre-line text-sm not-italic leading-relaxed text-se-ink2">
                  {[venue.address, venue.postcode].filter(Boolean).join('\n')}
                </address>
                {((venue.lat && venue.lng) || venue.postcode) && (
                  <div className="mt-4">
                    <SEButton asChild variant="ghost" size="sm">
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
                    </SEButton>
                  </div>
                )}
                {showAny.scheduleData?.directions && (
                  <div className="mt-4 border-t border-se-line pt-4">
                    <Eyebrow>Directions</Eyebrow>
                    <p className="mt-1 whitespace-pre-line text-pretty text-sm leading-relaxed text-se-ink2">
                      {showAny.scheduleData.directions}
                    </p>
                  </div>
                )}
                {what3words && (
                  <a
                    href={`https://what3words.com/${what3words}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-se-fresh-deep underline-offset-2 hover:underline"
                  >
                    <MapPin className="size-3.5" />
                    {`///${what3words}`}
                  </a>
                )}
                {/* Desktop covers Catering/Weather in the "At the show" card
                    above (real-data-only there) — avoid repeating it at lg. */}
                <div className="mt-5 grid grid-cols-2 gap-2.5 lg:hidden">
                  <Facility label="Catering" value={showAny.scheduleData?.catering ?? 'Refreshments available'} />
                  <Facility label="Weather" value={showAny.scheduleData?.wetWeatherAccommodation ?? 'Indoor/outdoor'} />
                </div>
              </SECard>
            </div>
          </section>
        )}

        {/* ──────────────────────────── Additional notes (if present) ─────── */}
        {showAny.scheduleData?.additionalNotes && (
          <section className="mt-[22px]">
            <SecLabel>From the organisers</SecLabel>
            <SECard className="border-l-4 border-se-honey-deep p-5 sm:p-6">
              <p className="whitespace-pre-line text-pretty text-[15px] leading-relaxed text-se-ink2">
                {showAny.scheduleData.additionalNotes}
              </p>
            </SECard>
          </section>
        )}

        {/* ──────────────────────────── Future shows (if present) ─────────── */}
        {showAny.scheduleData?.futureShowDates && (
          <section className="mt-[22px]">
            <SecLabel>Save the date</SecLabel>
            <p className="mb-3 text-sm text-se-ink2">More from {org?.name ?? 'this club'}</p>
            <SECard className="p-5 sm:p-6">
              <p className="whitespace-pre-line text-pretty text-[15px] leading-relaxed text-se-ink2">
                {showAny.scheduleData.futureShowDates}
              </p>
            </SECard>
          </section>
        )}

        {/* ──────────────────────────── Share kit (mobile/tablet) ─────────────
            Desktop gets its own ShareKitCard instance as rail card #2. */}
        {show.status !== 'cancelled' && (
          <div
            ref={shareKitInView.ref}
            className={cn(
              'mt-[22px] lg:hidden transition-all duration-[240ms] ease-out motion-reduce:transition-none',
              shareKitInView.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}
          >
          <ShareKitCard
            id="share-invitation"
            className="px-0 py-0 sm:px-0 sm:py-0"
            showId={show.id}
            showName={show.name}
            showType={showType}
            showDate={showDate}
            organisationName={org?.name ?? ''}
            venueName={venue?.name}
            entryCloseDate={show.entryCloseDate ?? null}
            shareUrl={
              typeof window !== 'undefined'
                ? `${window.location.origin}/shows/${slug}`
                : `https://remishowmanager.co.uk/shows/${slug}`
            }
            onShare={(channel) => {
              // Fire-and-forget — never block the share UX.
              fetch('/api/share-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ showId: show.id, channel }),
                keepalive: true,
              }).catch(() => {});
            }}
          />
          </div>
        )}

        {/* ──────────────────────────── Footer CTA ────────────────────────── */}
        {isOpen && (
          <section className="mt-[22px] py-14 text-center sm:py-16">
            <Crown className="mx-auto size-7 text-se-honey-deep" />
            <h2 className="mt-3 text-balance text-[1.75rem] font-extrabold text-se-ink sm:text-3xl">Ready for the ring?</h2>
            <p className="mx-auto mt-2 max-w-xl text-se-ink2">Entries take two minutes on your phone.</p>
            <div className="mt-6">
              <SEButton asChild variant="fresh">
                <Link href={enterHref}>
                  <Flag className="size-5" />
                  Enter This Show
                </Link>
              </SEButton>
            </div>
            {entryCloseDate && (
              <p className="mt-4 text-xs text-se-ink3">
                Entries close <strong className="text-se-ink2">{format(entryCloseDate, 'EEEE d MMMM · HH:mm')}</strong>
                {daysToClose !== null && daysToClose <= 7 && (
                  <span className="ml-1 font-semibold text-se-honey-deep">({daysToClose}d left)</span>
                )}
              </p>
            )}
          </section>
        )}

        {/* ──────────────────────────── Page footer (wordmark) ───────────────
            Reduced to the design's literal footer — a centred wordmark +
            subline. Nav links/copyright are NOT repeated here: the global
            site <Footer/> (rendered by the (shows) layout) already provides
            that below. */}
        <div className="pt-6 pb-[30px] text-center">
          <Link href="/" aria-label="Remi" className="inline-flex transition-opacity hover:opacity-80">
            <Wordmark />
          </Link>
          <p className="mt-[5px] text-[11.5px] text-se-ink3">
            No account needed to read · entries in under two minutes
          </p>
        </div>
        </div>
      </div>

      {/* ──────────────────────────── Mobile slide-up widget (dismissable) ── */}
      {isOpen && !widgetDismissed && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 border-t border-se-line bg-se-surface/95 shadow-2xl shadow-black/20 backdrop-blur-lg transition-transform duration-300 ease-out motion-reduce:transition-none sm:hidden',
            widgetVisible ? 'translate-y-0' : 'translate-y-full'
          )}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => setWidgetDismissed(true)}
            aria-label="Dismiss entry widget"
            className="absolute -top-8 right-3 flex size-7 items-center justify-center rounded-full bg-se-surface shadow-md ring-1 ring-se-line"
          >
            <X className="size-3.5 text-se-ink2" />
          </button>
          <div className="flex items-center gap-3 px-4 pt-3">
            <div className="min-w-0 flex-1">
              {showAny.firstEntryFee != null && showAny.firstEntryFee > 0 ? (
                <>
                  <p className="text-xl font-extrabold text-se-green">{formatCurrency(showAny.firstEntryFee)}</p>
                  <p className="text-xs text-se-ink3">entry fee</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-se-ink">Enter This Show</p>
              )}
              {entryCloseDate && daysToClose !== null && daysToClose <= 14 && (
                <p className={cn('mt-0.5 text-[11px] font-semibold', daysToClose <= 3 ? 'text-red-600' : 'text-se-honey-deep')}>
                  Closes in {daysToClose === 0 ? 'today' : `${daysToClose}d`}
                </p>
              )}
            </div>
            <SEButton asChild variant="fresh" className="shrink-0 px-6">
              <Link href={enterHref}>
                <Ticket className="size-5" />
                Enter Now
              </Link>
            </SEButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small composable building blocks ────────────── */

/** Reassurance bullets shown under the Enter CTA — desktop rail uses the
 *  shorter `shortLabel` copy (denser card), mobile CTA uses the fuller
 *  `label`. `requiresPostal` bullets only render when the show accepts
 *  postal entries. */
const TRUST_BULLETS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortLabel: string;
  requiresPostal?: boolean;
}> = [
  {
    icon: CreditCard,
    label: 'Pay by card, or post a cheque — same fee',
    shortLabel: 'Card or cheque — same fee',
    requiresPostal: true,
  },
  { icon: Check, label: 'Instant confirmation by email', shortLabel: 'Instant email confirmation' },
  {
    icon: Lock,
    label: 'Your entry stays private until the catalogue',
    shortLabel: 'Entry private until the catalogue',
  },
];

/** `compact` gives the desktop rail's denser variant (text-xs/gap-2/icon 14);
 *  the default (mobile CTA card) stays 12.5px/gap-[9px]/icon 15. */
function TrustRow({
  icon: Icon,
  children,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center text-se-ink2', compact ? 'gap-2 text-xs' : 'gap-[9px] text-[12.5px]')}>
      <Icon className={cn('shrink-0 text-se-fresh-deep', compact ? 'size-3.5' : 'size-[15px]')} />
      {children}
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
    <div className={cn('flex items-center justify-between gap-3 py-[11px]', unavailable && 'opacity-60')}>
      <div className="min-w-0">
        <dt className="text-[13.5px] font-normal text-se-ink2">{label}</dt>
        {sub && <p className="mt-0.5 text-xs text-se-ink3">{sub}</p>}
      </div>
      <dd className="shrink-0 text-right">
        {custom ? (
          <span className="text-sm text-se-ink2">{custom}</span>
        ) : unavailable ? (
          <span className="text-sm italic text-se-ink3">Not offered</span>
        ) : (
          <>
            <p className={cn(SE_H, 'font-semibold', 'text-[15.5px] text-se-ink')}>{formatCurrency(value ?? 0)}</p>
            {note && <p className="text-[10px] text-se-ink3">{note}</p>}
          </>
        )}
      </dd>
    </div>
  );
}

function Facility({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-se-line bg-se-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-se-ink3">{label}</p>
      <p className="mt-0.5 font-medium text-se-ink">{value}</p>
    </div>
  );
}
