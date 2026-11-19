import { isSvDisqualified } from './sv-grading';

/** What {@link groupStewardClassEntries} reads from each dog in the class. */
export interface StewardGroupableEntry {
  /** This class's own attendance flag (`entry_classes.absent`). */
  absent: boolean;
  result: {
    placement: number | null;
    placementStatus: string | null;
    svGrade?: string | null;
  } | null;
}

export interface StewardClassGroups<E> {
  /** The placing ladder: placing → dog. */
  placedByValue: Map<number, E>;
  /** In the ring and not yet dealt with — the "Not yet placed" list. */
  remaining: E[];
  withheld: E[];
  unplaced: E[];
  /** Regionals: disqualified by the judge — no placing (Mandy, 16 Nov 2026). */
  disqualified: E[];
  absent: E[];
}

/**
 * How the steward's class page sorts a class into the placing ladder and the
 * groups at its foot (Not yet placed / Withheld / Unplaced / Disqualified /
 * Absent). A dog is "dealt with" once it is out of `remaining`, which is what
 * "everyone in the ring has been dealt with" (the loud Publish prompt) waits on.
 *
 * A Disqualified dog is stored as unplaced with the grade Disqualified
 * (`stewardStatusWrite` in sv-grading.ts), so it is taken out of Unplaced into
 * its own group. A dog recorded the old way — a placing AND Disqualified —
 * still has a placing, so it stays on the ladder where the steward can see it.
 */
export function groupStewardClassEntries<E extends StewardGroupableEntry>(entries: readonly E[]): StewardClassGroups<E> {
  const placedByValue = new Map<number, E>();
  for (const e of entries) {
    if (e.result?.placement != null) placedByValue.set(e.result.placement, e);
  }
  const present = entries.filter((e) => !e.absent);
  const isDisqualified = (e: E) => e.result?.placement == null && isSvDisqualified(e.result);
  return {
    placedByValue,
    remaining: present.filter((e) => e.result?.placement == null && !e.result?.placementStatus),
    withheld: present.filter((e) => e.result?.placementStatus === 'withheld'),
    unplaced: present.filter((e) => e.result?.placementStatus === 'unplaced' && !isDisqualified(e)),
    disqualified: present.filter(isDisqualified),
    absent: entries.filter((e) => e.absent),
  };
}
