/**
 * Regional (SV/WUSV) entry-fee engine — mirrors the BRG / Scottish Progressive
 * GSD Group fee structure (Mandy 2026-07-02, project_regional_fee_structure).
 *
 * Regionals price differently from RKC shows: every dog is in exactly ONE class
 * (one-dog-one-class rule), so the fee is a sliding scale on the NUMBER OF
 * DISTINCT DOGS an exhibitor enters — not first-class vs subsequent-class of the
 * same dog. Each position on the scale has a standard rate AND a member rate.
 *
 * Rules (Mandy 2026-07-02):
 *  - Tiered per-dog scale, e.g. 1st £20, 2nd £20, 3rd £16, 4th-onwards £0. The
 *    LAST tier applies to its position and every dog beyond it.
 *  - Each tier carries a member rate (e.g. £17/£17/£11/£0) applied when the
 *    exhibitor ticks "BRG/League member" (self-declared, never validated here).
 *  - First-time exhibitor: the FIRST dog is charged the flat first-time rate
 *    (BRG = £0 — "one entry free"); the remaining dogs pay their normal tier
 *    position (2nd, 3rd, …).
 *  - Junior Handler: a flat fee (BRG = £0) that does NOT consume a dog position.
 *
 * This engine computes the ENTRY-FEE subtotal only. Catalogue, sundries,
 * discretionary donation and any platform fee are layered on at checkout.
 */
import { svDisplayAge } from './class-labels';

export type RegionalDogEntryInput = {
  /** Stable id used as the key in the per-entry breakdown (typically entry.id). */
  key: string;
  /** Standard = a dog in a competitive class (consumes a tier position).
   *  Junior Handler = a flat-fee handler entry (does not consume a position). */
  kind: 'standard' | 'junior_handler';
  /** Flat special-class fee in pence — a dog in a class the secretary priced
   *  away from the scale (e.g. Baby Puppy at £10). Charged this exact amount,
   *  excluded from the per-dog discount scale: it neither consumes a position
   *  nor gets member/first-time rates (Mandy 2026-07-10). Resolve via
   *  `regionalClassFlatFee`. */
  flatFeePence?: number | null;
};

export type RegionalFeeTier = {
  standardPence: number;
  memberPence: number;
};

export type RegionalFeeContext = {
  /** Ordered per-dog price schedule. The LAST tier applies to its own position
   *  and every dog beyond it — e.g. [t1,t2,t3,t4] means the 5th, 6th… dog all
   *  use t4. An empty schedule prices every dog at £0. */
  tiers: RegionalFeeTier[];
  /** Member rates apply — the exhibitor ticked "BRG/League member". */
  isMember: boolean;
  /** First-time exhibitor — the FIRST dog is charged firstTimeFeePence; the
   *  remaining dogs pay their normal tier position. */
  firstTimeExhibitor: boolean;
  /** The first-time exhibitor's first-dog fee. Null/undefined → £0. */
  firstTimeFeePence?: number | null;
  /** Junior Handler flat fee. Null/undefined → £0. */
  juniorHandlerFeePence?: number | null;
};

export type RegionalEntryFeeBreakdown = {
  key: string;
  /** Total fee for this entry. */
  fee: number;
  /** Per-class attribution for the entry_classes rows. Regional dogs sit in one
   *  class, so this is a single-element array. */
  perClassFees: number[];
  /** 1-based dog position on the tier scale; 0 for a Junior Handler entry. */
  position: number;
};

export type RegionalOrderFeeResult = {
  /** Entry-fee subtotal (excludes catalogue / sundries / donation / platform fee). */
  entriesTotal: number;
  perEntry: RegionalEntryFeeBreakdown[];
  /** Number of distinct paying dogs (positions consumed). */
  payingDogCount: number;
};

/** Price for the dog at 1-based `position` on the tier scale, honouring the
 *  member/standard column. The last tier applies to that position and beyond. */
function tierPrice(
  tiers: RegionalFeeTier[],
  position: number,
  isMember: boolean,
): number {
  if (tiers.length === 0) return 0;
  const idx = Math.min(position - 1, tiers.length - 1);
  const tier = tiers[idx]!;
  return isMember ? tier.memberPence : tier.standardPence;
}

export function computeRegionalOrderFees(
  entries: RegionalDogEntryInput[],
  ctx: RegionalFeeContext,
): RegionalOrderFeeResult {
  let position = 0;

  const perEntry: RegionalEntryFeeBreakdown[] = entries.map((entry) => {
    if (entry.kind === 'junior_handler') {
      const jh = ctx.juniorHandlerFeePence ?? 0;
      return { key: entry.key, fee: jh, perClassFees: [jh], position: 0 };
    }

    // Flat-priced special class (Baby Puppy) — charged as-is, outside the
    // per-dog scale, so it doesn't shift the other dogs' positions.
    if (entry.flatFeePence != null) {
      const flat = entry.flatFeePence;
      return { key: entry.key, fee: flat, perClassFees: [flat], position: 0 };
    }

    // Standard paying dog — consumes the next tier position.
    position += 1;
    // First-time exhibitor: only the FIRST dog gets the first-time rate; the
    // rest pay their normal tier position (Mandy 2026-07-05 — "one entry free",
    // so a first-timer with 3 dogs pays free + 2nd + 3rd, not all free).
    const fee =
      ctx.firstTimeExhibitor && position === 1
        ? ctx.firstTimeFeePence ?? 0
        : tierPrice(ctx.tiers, position, ctx.isMember);
    return { key: entry.key, fee, perClassFees: [fee], position };
  });

  const entriesTotal = perEntry.reduce((sum, e) => sum + e.fee, 0);
  return { entriesTotal, perEntry, payingDogCount: position };
}

export type RegionalFeeLevel = {
  /** "Non-member", or the membership's own label. */
  label: string;
  /** First-dog price at this level, in pence. */
  perDogPence: number;
  /** Total for three dogs — the "3 or more dogs" package price. Only
   *  meaningful when `capped` is true on the display result. */
  threePlusPence: number;
};

export type RegionalFeeDisplay = {
  levels: RegionalFeeLevel[];
  /** True when the scale frees the 4th dog on, so "3 or more dogs" reads as a
   *  flat package price. */
  capped: boolean;
};

/**
 * Resolve a regional fee config into display fee levels, EXACTLY the way
 * checkout resolves them (Mandy 2026-07-08 — the BRG model is a flat per-dog
 * rate with a "3 or more dogs" package, shown for each fee level):
 *  - Non-member → the config standard column
 *  - a membership WITH its own prices (option B) → those prices
 *  - a membership WITHOUT its own prices (option A) → the config member column
 * Shared by the schedule PDF and the public show page so the printed fees and
 * the till can't disagree.
 */
export function buildRegionalFeeDisplay(config: {
  tiers: RegionalFeeTier[];
  memberships?: { label: string; tiers?: RegionalFeeTier[] }[];
}): RegionalFeeDisplay {
  type Level = { label: string; tiers: RegionalFeeTier[]; member: boolean };
  const hasConfigMember = config.tiers.some((t) => t.memberPence !== t.standardPence);
  const levels: Level[] = [{ label: 'Non-member', tiers: config.tiers, member: false }];
  const explicit = config.memberships ?? [];
  if (explicit.length) {
    for (const m of explicit) {
      if (m.tiers && m.tiers.length) {
        levels.push({ label: m.label, tiers: m.tiers, member: false });
      } else if (hasConfigMember) {
        levels.push({ label: m.label, tiers: config.tiers, member: true });
      }
    }
  } else if (hasConfigMember) {
    levels.push({ label: 'Member', tiers: config.tiers, member: true });
  }

  const priceAt = (lvl: Level, position: number) => {
    if (!lvl.tiers.length) return 0;
    const t = lvl.tiers[Math.min(position - 1, lvl.tiers.length - 1)]!;
    return lvl.member ? t.memberPence : t.standardPence;
  };

  // "3 or more dogs" is a flat package only when the scale frees the 4th dog on.
  const capped =
    config.tiers.length >= 4 &&
    config.tiers[config.tiers.length - 1]!.standardPence === 0 &&
    config.tiers[config.tiers.length - 1]!.memberPence === 0;

  return {
    capped,
    levels: levels.map((lvl) => ({
      label: lvl.label,
      perDogPence: priceAt(lvl, 1),
      threePlusPence: priceAt(lvl, 1) + priceAt(lvl, 2) + priceAt(lvl, 3),
    })),
  };
}

/** The flat fee for the (single) class a regional dog entry sits in, or null
 *  when the class prices on the per-dog scale. One lookup shared by checkout
 *  and the enter-page preview so the two can't disagree. */
export function resolveClassFlatFee(
  classId: string | undefined,
  classes: ReadonlyMap<
    string,
    {
      entryFee: number | null;
      classDefinition?: { name: string | null; type: string | null } | null;
    }
  >,
  tiers: RegionalFeeTier[],
): number | null {
  const sc = classId ? classes.get(classId) : undefined;
  if (!sc) return null;
  return regionalClassFlatFee(
    {
      className: sc.classDefinition?.name,
      classType: sc.classDefinition?.type,
      entryFee: sc.entryFee,
    },
    tiers,
  );
}

export type RegionalSpecialClassFee = { label: string; fee: number };

/**
 * Distinct flat-priced special classes for the fee panels — one row per
 * (display name, fee), e.g. one "Baby Puppy £10" row from the four sex/coat
 * class variants. Shared by the schedule PDF and the public show page so
 * their rows can't drift (same pattern as `buildRegionalFeeDisplay`).
 */
export function buildRegionalSpecialClassFees(
  classes: ReadonlyArray<{
    className?: string | null;
    classType?: string | null;
    entryFee?: number | null;
  }>,
  tiers: RegionalFeeTier[],
): RegionalSpecialClassFee[] {
  const rows = new Map<string, RegionalSpecialClassFee>();
  for (const c of classes) {
    const flat = regionalClassFlatFee(
      { className: c.className, classType: c.classType, entryFee: c.entryFee ?? null },
      tiers,
    );
    if (flat == null) continue;
    const label = svDisplayAge(c.className);
    rows.set(`${label}|${flat}`, { label, fee: flat });
  }
  return Array.from(rows.values());
}

/**
 * The flat fee for a regional show class that the secretary has deliberately
 * priced away from the per-dog scale, or null when the class prices normally.
 *
 * Only Baby Puppy qualifies (Mandy 2026-07-10, North East £10 Baby Puppy):
 * it's the SV world's special reduced-fee class. The fee must differ from the
 * standard first-dog tier — a Baby Puppy left at the seeded default behaves
 * as an ordinary scale dog, so shows that never re-priced it are unaffected.
 * Junior Handler classes are excluded; they price via `juniorHandlerFeePence`.
 *
 * Shared by checkout (orders router), the enter-page fee preview and the
 * schedule's Fees box so all three surfaces agree.
 */
export function regionalClassFlatFee(
  cls: {
    className: string | null | undefined;
    classType?: string | null;
    entryFee: number | null | undefined;
  },
  tiers: RegionalFeeTier[],
): number | null {
  if (cls.classType === 'junior_handler') return null;
  if (cls.entryFee == null) return null;
  if (!/baby\s*puppy/i.test(cls.className ?? '')) return null;
  const firstDogPence = tiers[0]?.standardPence;
  if (firstDogPence == null || cls.entryFee === firstDogPence) return null;
  return cls.entryFee;
}

/** The default BRG / Scottish Progressive tier schedule, in pence
 *  (Mandy 2026-07-02). Used to seed a new regional show's fee config. */
export const DEFAULT_REGIONAL_FEE_TIERS: RegionalFeeTier[] = [
  { standardPence: 2000, memberPence: 1700 }, // 1st dog
  { standardPence: 2000, memberPence: 1700 }, // 2nd dog
  { standardPence: 1600, memberPence: 1100 }, // 3rd dog
  { standardPence: 0, memberPence: 0 }, // 4th dog onwards
];
