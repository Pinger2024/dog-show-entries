/**
 * "Prize cards needed" counts for the secretary Documents page (Mandy,
 * 2026-07-30): she wants to order only the cards she actually needs instead
 * of a full suite of blanks per class.
 *
 * The counting rule: a class needs a card for place k iff it has at least k
 * CONFIRMED entries — a class with 3 dogs can only ever award 1st, 2nd and
 * 3rd, so it needs no 4th/Reserve card. Places are 1st, 2nd, 3rd and 4th
 * (labelled "Reserve" in the UI, matching the existing Prize Cards row copy
 * "1st, 2nd, 3rd and Reserve").
 *
 * Deliberately excluded:
 *  - 5th place / VHC (Very Highly Commended) — Remi's prize-card template
 *    only covers 1st–Reserve; Mandy doesn't print cards that far down.
 *  - Best-award cards (Best of Breed, Best in Group, etc.) — Mandy's own
 *    words: "we don't do cards for best awards, so it's just classes."
 *
 * total = Σ over classes of min(confirmed_entries_in_class, 4) — i.e. a
 * class contributes at most one card per place, capped at 4 places.
 */
export type PrizeCardCounts = {
  first: number;
  second: number;
  third: number;
  reserve: number;
  total: number;
};

export function computePrizeCardCounts(
  confirmedEntriesPerClass: number[]
): PrizeCardCounts {
  let first = 0;
  let second = 0;
  let third = 0;
  let reserve = 0;
  let total = 0;

  for (const n of confirmedEntriesPerClass) {
    if (n >= 1) first += 1;
    if (n >= 2) second += 1;
    if (n >= 3) third += 1;
    if (n >= 4) reserve += 1;
    total += Math.min(n, 4);
  }

  return { first, second, third, reserve, total };
}
