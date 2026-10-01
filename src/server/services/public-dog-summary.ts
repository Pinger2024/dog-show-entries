import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { breeds, dogs, entries } from '@/server/db/schema';
import { hasPublicHistory, publicHistoryCounts } from '@/lib/public-dog-history';
import { normalizeName } from '@/lib/critique-match';

/**
 * The public, crawler-facing view of a dog's show record — what its link
 * preview text, its share image and the sitemap may say. Nobody is signed in
 * for these, so the rule is always the public one in lib/public-dog-history.ts.
 *
 * Mandy, 1 Oct 2026: Rosebud Edie of Hundark's link preview said "6 shows
 * entered" and her share image "6 Shows" — the page metadata and the image
 * each counted every confirmed entry, so her Midlands and North Eastern
 * entries (both still to come) were in the number. Both now call this.
 */

const ENTRY_HISTORY_INCLUDE = {
  show: { columns: { startDate: true, endDate: true } },
  entryClasses: {
    columns: { id: true },
    with: { result: { columns: { publishedAt: true, placement: true, specialAward: true, critiqueText: true } } },
  },
} as const;

export type PublicDogCounts = { shows: number; firsts: number; specialAwards: number; critiques: number };

/** "N shows · N × 1st · N awards" for one dog, counting only what the public may see. */
export async function getPublicDogSummary(db: Database, dogId: string): Promise<PublicDogCounts> {
  const dogEntries = await db.query.entries.findMany({
    where: and(eq(entries.dogId, dogId), eq(entries.status, 'confirmed'), isNull(entries.deletedAt)),
    columns: { id: true },
    with: ENTRY_HISTORY_INCLUDE,
  });
  return publicHistoryCounts(dogEntries);
}

/** Every dog the public has something to see for — the sitemap's dog pages. */
export async function listDogsWithPublicHistory(
  db: Database,
): Promise<Array<{ id: string; updatedAt: Date | null }>> {
  const dogEntries = await db.query.entries.findMany({
    where: and(eq(entries.status, 'confirmed'), isNull(entries.deletedAt)),
    columns: { dogId: true },
    with: ENTRY_HISTORY_INCLUDE,
  });

  const byDog = new Map<string, typeof dogEntries>();
  for (const entry of dogEntries) {
    if (!entry.dogId) continue;
    const list = byDog.get(entry.dogId) ?? [];
    list.push(entry);
    byDog.set(entry.dogId, list);
  }
  const publicDogIds = [...byDog].filter(([, list]) => hasPublicHistory(list)).map(([id]) => id);
  if (publicDogIds.length === 0) return [];

  return db
    .select({ id: dogs.id, updatedAt: dogs.updatedAt })
    .from(dogs)
    .where(and(inArray(dogs.id, publicDogIds), isNull(dogs.deletedAt)));
}

/**
 * The words someone typed into Find a Dog, as name tokens: case, apostrophes,
 * "v" / "von" / "vom", a bracketed tag and a leading title don't matter — the
 * same rule the critique reader uses to recognise a dog's name.
 */
export function dogNameQueryTokens(query: string): string[] {
  return normalizeName(query)
    .split(' ')
    .filter((token) => token.length >= 2);
}

/** Every word typed appears in the dog's registered name (in any order). */
export function dogNameMatches(registeredName: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const name = normalizeName(registeredName);
  return tokens.every((token) => name.includes(token));
}

export type FindADogResult = {
  id: string;
  registeredName: string;
  breed: string | null;
  sex: 'dog' | 'bitch';
} & PublicDogCounts;

const FIND_A_DOG_LIMIT = 20;
const FIND_A_DOG_CANDIDATES = 200;
const APOSTROPHES = "['’‘`]";

/**
 * Find a Dog (Mandy, 1 Oct 2026): anyone can look a dog up by name and read
 * its results and judges' critiques. Only dogs the public may already see a
 * show for are ever returned — a dog entered only in upcoming shows, or whose
 * only result is not yet published, never comes up, so the search can't tell
 * a judge who is entered (lib/public-dog-history.ts).
 */
export async function searchDogsWithPublicHistory(db: Database, query: string): Promise<FindADogResult[]> {
  const tokens = dogNameQueryTokens(query);
  if (tokens.length === 0) return [];

  // Narrow in SQL on the longest word, then apply the full rule in code.
  const anchor = [...tokens].filter((t) => t !== 'vom').sort((a, b) => b.length - a.length)[0] ?? tokens[0]!;
  const candidates = await db
    .select({ id: dogs.id, registeredName: dogs.registeredName, sex: dogs.sex, breed: breeds.name })
    .from(dogs)
    .leftJoin(breeds, eq(dogs.breedId, breeds.id))
    .where(
      and(
        isNull(dogs.deletedAt),
        sql`regexp_replace(lower(${dogs.registeredName}), ${APOSTROPHES}, '', 'g') like ${`%${anchor}%`}`,
      ),
    )
    .limit(FIND_A_DOG_CANDIDATES);

  const named = candidates.filter((dog) => dogNameMatches(dog.registeredName, tokens));
  if (named.length === 0) return [];

  const dogEntries = await db.query.entries.findMany({
    where: and(
      inArray(entries.dogId, named.map((d) => d.id)),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt),
    ),
    columns: { dogId: true },
    with: ENTRY_HISTORY_INCLUDE,
  });
  const byDog = new Map<string, typeof dogEntries>();
  for (const entry of dogEntries) {
    if (!entry.dogId) continue;
    byDog.set(entry.dogId, [...(byDog.get(entry.dogId) ?? []), entry]);
  }

  const typed = tokens.join(' ');
  return named
    .filter((dog) => hasPublicHistory(byDog.get(dog.id) ?? []))
    .map((dog) => ({ ...dog, ...publicHistoryCounts(byDog.get(dog.id) ?? []) }))
    .sort((a, b) => {
      // Names that start with what was typed first, then A–Z.
      const aStarts = normalizeName(a.registeredName).startsWith(typed) ? 0 : 1;
      const bStarts = normalizeName(b.registeredName).startsWith(typed) ? 0 : 1;
      return aStarts - bStarts || a.registeredName.localeCompare(b.registeredName);
    })
    .slice(0, FIND_A_DOG_LIMIT);
}
