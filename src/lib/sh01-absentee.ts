/**
 * RKC SH01 "Single Breed/Sub Group Championship Absentee Report" statistics.
 *
 * The KC uses these figures to calculate the annual allocation of CCs and the
 * Stud Book bands, so the counting rules matter (Mandy 2026-07-07):
 *   - count DISTINCT DOGS, not entries (a dog entered in several classes counts
 *     once; exclude any dog entered more than once)
 *   - status = confirmed, in real classes
 *   - EXCLUDE Junior Handling entries (no dog) and NFC (not-for-competition)
 *   - absentees follow the exact same rules, plus absent = true
 * Split by sex (Dogs & Bitches) when the breed is judged separately; otherwise
 * the combined "Mixed" figure is used.
 *
 * Verified against BAGSD 2026-07-04: 85 dogs (27 dogs + 58 bitches),
 * 33 absentees (10 + 23).
 */

export interface Sh01EntryInput {
  dogId: string | null;
  status: string;
  entryType: string;
  isNfc: boolean | null;
  absent: boolean | null;
  dog: { sex: string | null; breed: { name: string | null } | null } | null;
}

/** Minimal show-class shape used to decide whether a breed was judged
 *  separately (has sex-specific Dog / Bitch classes) or mixed. */
export interface Sh01ClassInput {
  sex: string | null;
  breed: { name: string | null } | null;
}

export interface Sh01BreedRow {
  breedName: string;
  /** True → fill the Dogs & Bitches columns; false → fill the Mixed columns. */
  judgedSeparately: boolean;
  dogs: number;
  absentDogs: number;
  bitches: number;
  absentBitches: number;
  /** Combined figure for a breed judged together. */
  mixed: number;
  absentMixed: number;
}

export interface Sh01Totals {
  breeds: Sh01BreedRow[];
  totalDogs: number;
  totalAbsentees: number;
}

export function computeSh01Stats(
  entries: Sh01EntryInput[],
  showClasses: Sh01ClassInput[] = [],
): Sh01Totals {
  // A breed is "judged separately" if it has any sex-specific class.
  const separateBreeds = new Set<string>();
  for (const c of showClasses) {
    const name = c.breed?.name;
    if (name && (c.sex === 'dog' || c.sex === 'bitch')) separateBreeds.add(name);
  }

  // distinct dogs per breed/sex (a Set of dogId dedupes "entered more than once")
  type Buckets = { dogs: Set<string>; absentDogs: Set<string>; bitches: Set<string>; absentBitches: Set<string> };
  const byBreed = new Map<string, Buckets>();

  for (const e of entries) {
    if (e.status !== 'confirmed') continue;
    if (e.entryType === 'junior_handler') continue;
    if (e.isNfc) continue;
    const breed = e.dog?.breed?.name;
    const dogId = e.dogId;
    if (!breed || !dogId) continue;
    const sex = e.dog?.sex;
    if (sex !== 'dog' && sex !== 'bitch') continue;

    let b = byBreed.get(breed);
    if (!b) {
      b = { dogs: new Set(), absentDogs: new Set(), bitches: new Set(), absentBitches: new Set() };
      byBreed.set(breed, b);
    }
    if (sex === 'dog') {
      b.dogs.add(dogId);
      if (e.absent) b.absentDogs.add(dogId);
    } else {
      b.bitches.add(dogId);
      if (e.absent) b.absentBitches.add(dogId);
    }
  }

  const breeds: Sh01BreedRow[] = [...byBreed.entries()]
    .map(([breedName, b]) => {
      const dogs = b.dogs.size;
      const bitches = b.bitches.size;
      const absentDogs = b.absentDogs.size;
      const absentBitches = b.absentBitches.size;
      const judgedSeparately = separateBreeds.has(breedName);
      return {
        breedName,
        judgedSeparately,
        dogs,
        absentDogs,
        bitches,
        absentBitches,
        mixed: dogs + bitches,
        absentMixed: absentDogs + absentBitches,
      };
    })
    .sort((a, b) => a.breedName.localeCompare(b.breedName));

  const totalDogs = breeds.reduce((s, r) => s + r.dogs + r.bitches, 0);
  const totalAbsentees = breeds.reduce((s, r) => s + r.absentDogs + r.absentBitches, 0);

  return { breeds, totalDogs, totalAbsentees };
}
