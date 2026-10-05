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
