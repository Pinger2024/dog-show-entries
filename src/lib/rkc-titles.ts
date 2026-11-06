import { normalizeName } from '@/lib/critique-match';

/**
 * One owner for the RKC Champion title rule — the dashboard's "RKC Title
 * Progress" and the championship box on the public dog page both ask this.
 *
 * Royal Kennel Club, "CCs and RCCs to count to Champion titles" (May 2023),
 * https://www.royalkennelclub.com/media-centre/2023/may/ccs-and-rccs-to-count-to-champion-titles/ :
 *   "Awarded three CCs under three different judges, one of which when the
 *    dog is over 12 months of age, or Awarded 2 CCs, with one being awarded
 *    when the dog is over 12 months of age, in addition to five RCCs awarded
 *    from 1 July 2023, with the awards coming from seven different judges"
 *
 * Until 5 Oct 2026 the rule was written twice and the copies disagreed: the
 * dashboard had 2 CCs + 5 RCCs (no 12-month rule), the public dog page had
 * "1 CC + 7 RCCs" (not an RKC rule). And both counted judges by their Remi id
 * only, so a judge typed in by the owner never counted (Paula Ingham's Bali,
 * 2 Oct 2026: 1 CC + 1 RCC, "0 unique judges").
 */

export const ALTERNATIVE_ROUTE_RCCS_FROM = '2023-07-01';

export type TitleAward = {
  kind: 'cc' | 'rcc';
  /** YYYY-MM-DD */
  date: string;
  /** The judge's name as recorded — Remi's judge record, or typed by the owner. */
  judgeName: string | null;
};

/** Two spellings of one judge's name are one judge ("Mrs J. Smith" / "mrs j smith"). */
export function judgeKey(name: string | null | undefined): string | null {
  const key = normalizeName(name ?? '');
  return key || null;
}

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type ChampionProgress = {
  classic: {
    ccs: number;
    /** Different judges who have awarded the dog a CC. */
    judges: number;
    /** False while no CC was won when the dog was over 12 months old. */
    hasCcOver12Months: boolean;
    met: boolean;
  };
  alternative: {
    ccs: number;
    /** RCCs awarded from 1 July 2023 — earlier ones don't count. */
    rccs: number;
    /** Different judges across those CCs and RCCs. */
    judges: number;
    met: boolean;
  };
  met: boolean;
  /** The route the dog is further along, by share of the awards it needs. */
  bestRoute: 'classic' | 'alternative';
};

export function championProgress(awards: TitleAward[], dateOfBirth: string): ChampionProgress {
  const twelveMonths = addMonths(dateOfBirth, 12);
  const ccs = awards.filter((a) => a.kind === 'cc');
  const rccs = awards.filter((a) => a.kind === 'rcc' && a.date >= ALTERNATIVE_ROUTE_RCCS_FROM);

  // Each judge who gave a CC → did any of their CCs come after 12 months of age?
  const ccJudges = new Map<string, boolean>();
  for (const cc of ccs) {
    const key = judgeKey(cc.judgeName);
    if (!key) continue; // no judge recorded — can't show it's a different judge
    ccJudges.set(key, (ccJudges.get(key) ?? false) || cc.date > twelveMonths);
  }
  const rccJudges = new Set(rccs.map((r) => judgeKey(r.judgeName)).filter((k): k is string => !!k));

  const hasCcOver12Months = ccs.some((cc) => cc.date > twelveMonths);
  const classicMet = ccJudges.size >= 3 && [...ccJudges.values()].some(Boolean);

  // Two CCs from two judges (one of them over 12 months) and five RCCs from
  // five more judges — seven different judges in all.
  const ccJudgeList = [...ccJudges.entries()];
  let alternativeMet = false;
  for (let i = 0; i < ccJudgeList.length && !alternativeMet; i++) {
    for (let j = i + 1; j < ccJudgeList.length && !alternativeMet; j++) {
      const [a, aOver12] = ccJudgeList[i]!;
      const [b, bOver12] = ccJudgeList[j]!;
      if (!aOver12 && !bOver12) continue;
      const others = [...rccJudges].filter((k) => k !== a && k !== b).length;
      if (others >= 5) alternativeMet = true;
    }
  }

  const altJudges = new Set([...ccJudges.keys(), ...rccJudges]).size;
  const classicShare = Math.min(ccs.length, 3) / 3;
  const alternativeShare = (Math.min(ccs.length, 2) + Math.min(rccs.length, 5)) / 7;

  return {
    classic: { ccs: ccs.length, judges: ccJudges.size, hasCcOver12Months, met: classicMet },
    alternative: { ccs: ccs.length, rccs: rccs.length, judges: altJudges, met: alternativeMet },
    met: classicMet || alternativeMet,
    bestRoute: classicMet || classicShare >= alternativeShare ? 'classic' : 'alternative',
  };
}

/* ─── Show Certificate of Excellence (ShCEx) ─────────────────────────────── */

/**
 * Royal Kennel Club, "Certificate types" (fetched 2 Oct 2026),
 * https://www.royalkennelclub.com/events-and-activities/dog-showing/already-competing-in-dog-showing/certificate-types/
 * and the claim form https://www.royalkennelclub.com/forms/show-certificate-of-excellence/ :
 *   50 points at general and group open shows, the dog aged 18 months and
 *   over, points won from 1 January 2018, at least 5 of them "won in group
 *   competition at show(s) judged on the group system".
 *   Best of Breed 1 · group placings (multi-group shows) 1st 4, 2nd 3,
 *   3rd 2, 4th 1 · Best in Show 5 / Reserve 3 on the group system;
 *   9 / 7 at a general open show not on the group system; 5 / 4 at a group
 *   open show not on the group system. Class wins earn nothing.
 * (It replaced the Show Certificate of Merit, which closed on 31 Dec 2018.
 * Until 5 Oct 2026 Remi counted "1 point per class first at open shows".)
 */
export const SHCEX_POINTS_NEEDED = 50;
export const SHCEX_GROUP_POINTS_NEEDED = 5;
export const SHCEX_POINTS_FROM = '2018-01-01';

export type ShowKind = {
  showType: 'open' | 'premier_open' | 'championship' | 'limited' | 'companion' | 'primary' | null;
  showScope: 'general' | 'group' | 'single_breed' | null;
};

/**
 * The choices the owner picks from when adding a result by hand — one list
 * for the form and the server, so they can't disagree about what a show is.
 */
export const EXTERNAL_SHOW_KINDS = [
  { value: 'open_general', label: 'All-breed open show', showType: 'open', showScope: 'general' },
  { value: 'premier_open', label: 'Premier open show', showType: 'premier_open', showScope: 'general' },
  { value: 'open_group', label: 'Group open show (one group, e.g. Pastoral)', showType: 'open', showScope: 'group' },
  { value: 'open_breed', label: 'Breed club open show', showType: 'open', showScope: 'single_breed' },
  { value: 'championship', label: 'Championship show', showType: 'championship', showScope: 'general' },
] as const;

export type ExternalShowKindValue = (typeof EXTERNAL_SHOW_KINDS)[number]['value'];

export function externalShowKind(value: string): ShowKind | null {
  const kind = EXTERNAL_SHOW_KINDS.find((k) => k.value === value);
  return kind ? { showType: kind.showType, showScope: kind.showScope } : null;
}

export function externalShowKindValue(kind: ShowKind): ExternalShowKindValue | null {
  return EXTERNAL_SHOW_KINDS.find((k) => k.showType === kind.showType && k.showScope === kind.showScope)?.value ?? null;
}

/** An award that can earn ShCEx points, with what the rule needs to know. */
export type ShcexAward = ShowKind & {
  kind: 'bob' | 'group' | 'bis' | 'rbis';
  date: string;
  /** Group placings: 1–4. */
  groupPlace?: number | null;
  /** BIS / RBIS: was it judged on the group system (from the group winners)? */
  groupSystem?: boolean | null;
};

/** Award types that can earn ShCEx points. */
export const SHCEX_AWARD_KIND: Readonly<Record<string, ShcexAward['kind']>> = {
  best_of_breed: 'bob',
  group_placement: 'group',
  best_in_show: 'bis',
  reserve_best_in_show: 'rbis',
};

/**
 * A result the owner added by hand that can't be counted yet because it's
 * missing the show type / group place — the dashboard asks them to fill it in.
 */
export function externalResultNeedsInfo(
  type: string,
  date: string,
  details: {
    showType?: string | null;
    showScope?: string | null;
    groupPlace?: number | null;
    groupSystem?: boolean | null;
  } | null,
): boolean {
  const kind = SHCEX_AWARD_KIND[type];
  if (!kind) return false;
  return !!shcexMissingInfo({
    kind,
    date,
    showType: (details?.showType ?? null) as ShowKind['showType'],
    showScope: (details?.showScope ?? null) as ShowKind['showScope'],
    groupPlace: details?.groupPlace ?? null,
    groupSystem: details?.groupSystem ?? null,
  });
}

/** What the owner still has to tell Remi before this award can be counted. */
export function shcexMissingInfo(a: ShcexAward): 'show_type' | 'group_place' | 'group_system' | null {
  if (!a.showType) return 'show_type';
  if (a.kind === 'group' && !a.groupPlace) return 'group_place';
  if ((a.kind === 'bis' || a.kind === 'rbis') && a.showScope !== 'single_breed' && a.groupSystem == null) {
    return 'group_system';
  }
  return null;
}

/** Points one award earns (0 when it can't count), and whether they're group-competition points. */
export function shcexPoints(a: ShcexAward, dateOfBirth: string): { points: number; group: boolean } {
  const none = { points: 0, group: false };
  if (shcexMissingInfo(a)) return none;
  const openShow = a.showType === 'open' || a.showType === 'premier_open';
  const generalOrGroup = a.showScope === 'general' || a.showScope === 'group';
  if (!openShow || !generalOrGroup) return none;
  if (a.date < SHCEX_POINTS_FROM) return none;
  if (a.date < addMonths(dateOfBirth, 18)) return none;

  switch (a.kind) {
    case 'bob':
      return { points: 1, group: false };
    case 'group': {
      if (a.showScope !== 'general') return none; // group placings: multi-group shows only
      const points = [0, 4, 3, 2, 1][a.groupPlace ?? 0] ?? 0;
      return { points, group: points > 0 };
    }
    case 'bis':
      if (a.groupSystem) return { points: 5, group: true };
      return { points: a.showScope === 'general' ? 9 : 5, group: false };
    case 'rbis':
      if (a.groupSystem) return { points: 3, group: true };
      return { points: a.showScope === 'general' ? 7 : 4, group: false };
  }
}

export type ShcexProgress = {
  points: number;
  groupPoints: number;
  met: boolean;
  /** Awards that could count but are missing the show type / group place. */
  needInfo: number;
  /** Best of Breed points counted from a group placing or Best in Show, where the owner didn't enter the BOB. */
  impliedBobs: number;
};

/**
 * The awards a dog must have won on the way to the ones entered. It is only placed
 * in the group, or made Best (or Reserve) in Show, after winning its breed — Best
 * of Breed, or Best AVNSC / Best Imported Register, 1 point each — and on the
 * group system Best in Show and Reserve are chosen from the group winners. The
 * RKC counts every award at a show (unlike the Junior Warrant, there's no
 * one-award-per-show rule), so those points were won even when the owner entered
 * only the top award.
 *
 * Mandy, 5 Oct 2026, for Paula's Bali: Group 2nd at Eston & Barnaby is the
 * Best of Breed point plus 3 — "they must have won best of breed".
 *
 * Counted once per show day, and never when that day already has the award
 * entered — so entering the Best of Breed as well can't count it twice.
 */
function awardsOnTheWay(awards: ShcexAward[]): ShcexAward[] {
  const days = new Map<string, ShcexAward[]>();
  for (const a of awards) days.set(a.date, [...(days.get(a.date) ?? []), a]);

  const implied: ShcexAward[] = [];
  for (const [date, day] of days) {
    const top = day.find((a) => (a.kind === 'group' || a.kind === 'bis' || a.kind === 'rbis') && !shcexMissingInfo(a));
    if (!top) continue;
    const show = { showType: top.showType, showScope: top.showScope };
    if (!day.some((a) => a.kind === 'bob')) {
      implied.push({ ...show, kind: 'bob', date, groupPlace: null, groupSystem: null });
    }
    const bestOnGroupSystem = day.some(
      (a) => (a.kind === 'bis' || a.kind === 'rbis') && a.groupSystem === true && a.showScope === 'general',
    );
    if (bestOnGroupSystem && !day.some((a) => a.kind === 'group')) {
      implied.push({ ...show, kind: 'group', date, groupPlace: 1, groupSystem: null });
    }
  }
  return implied;
}

export function shcexProgress(awards: ShcexAward[], dateOfBirth: string): ShcexProgress {
  let points = 0;
  let groupPoints = 0;
  let needInfo = 0;
  let impliedBobs = 0;
  for (const a of awardsOnTheWay(awards)) {
    const p = shcexPoints(a, dateOfBirth);
    points += p.points;
    if (p.group) groupPoints += p.points;
    if (a.kind === 'bob' && p.points > 0) impliedBobs++;
  }
  for (const a of awards) {
    if (shcexMissingInfo(a)) {
      needInfo++;
      continue;
    }
    const p = shcexPoints(a, dateOfBirth);
    points += p.points;
    if (p.group) groupPoints += p.points;
  }
  return {
    points,
    groupPoints,
    met: points >= SHCEX_POINTS_NEEDED && groupPoints >= SHCEX_GROUP_POINTS_NEEDED,
    needInfo,
    impliedBobs,
  };
}
