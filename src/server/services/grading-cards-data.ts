/**
 * Loads everything the SV/WUSV Grading Cards PDF needs for one show. Used by
 * `/api/reports/[showId]/grading-cards`.
 *
 * ONE card per DOG, never per entry row (the one-catalogue-number-per-dog
 * rule — see catalogue-numbering.ts) — a dog entered in more than one class
 * still gets exactly one grading card, using its first (lowest sortOrder)
 * class for the "Class" field. Only confirmed entries on paid orders count
 * (mirrors the absentee-catalogue query shape in report-queries.ts). Junior
 * Handling entries have no dog and are excluded naturally.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { format, parseISO } from 'date-fns';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import { svCoatDisplayName } from '@/lib/class-labels';
import { resolveJudgeForClass } from '@/lib/judge-resolution';
import { formatRegNumber, smartOwnerTitleCase } from '@/components/catalogue/catalogue-utils';
import type { GradingCardEntry, GradingCardsInfo } from '@/components/reports/grading-cards-pdf';

export interface GradingCardsLoad {
  info: GradingCardsInfo;
  entries: GradingCardEntry[];
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}

function coatLabel(coatType: 'stock' | 'long_stock' | null | undefined): string {
  return svCoatDisplayName(coatType) ?? '';
}

function sexLabel(sex: string | null | undefined): string {
  if (sex === 'dog') return 'Male';
  if (sex === 'bitch') return 'Female';
  return '';
}

export async function loadGradingCardsData(
  db: Database,
  showId: string,
): Promise<GradingCardsLoad | null> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
  });
  if (!show) return null;

  const paidOrderIds = await getPaidOrderIdsForShow(db, showId);

  const [showClasses, judgeAssignments, entries] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true },
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true },
    }),
    // No paid orders yet → no rows, not an error (grading cards simply have
    // nothing to render until an order is paid, same as every other
    // paid-orders-only report on this page).
    paidOrderIds.length > 0
      ? db.query.entries.findMany({
          where: and(
            eq(schema.entries.showId, showId),
            inArray(schema.entries.orderId, paidOrderIds),
            eq(schema.entries.status, 'confirmed'),
            isNull(schema.entries.deletedAt),
          ),
          with: {
            dog: true,
            entryClasses: { with: { showClass: { with: { classDefinition: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const showClassById = new Map(showClasses.map((sc) => [sc.id, sc]));

  // Judge resolution is the SHARED one — the same resolver the catalogue, the
  // schedule, the judges' book and the prize-cards route use.
  //
  // This file used to keep its own copy, copied from generatePrizeCardsPdf,
  // which flattened every assignment into breed → judge. On a single-breed show
  // every assignment carries breed_id = null, so they all collided on one key
  // and the LAST one processed won. North East records Nikki Farley for the dogs
  // and the bitches, and Mandy as the Junior Handling judge (no breed, no sex —
  // that is how a JH judge is stored). Mandy's row was added two days later, so
  // it overwrote Nikki on every grading card in the show, Baby Puppy included
  // (Mandy 2026-08-21, caught proofing North East before print).
  //
  // resolveJudgeForClass diverts the JH judge and the Special Award Classes
  // judge out of the breed/sex maps entirely, then resolves per class:
  // JH → SAC → exact (breed, sex) → breed → sex → fallback. Its own history
  // records this same collision twice before — Andrew over Helen in June, the
  // SAC judge at South Western in August — which is the argument for having one
  // implementation rather than a copy per document.
  const judgeForClass = resolveJudgeForClass(judgeAssignments);

  // EVERY owner's name per dog, in sort order (names only — no address, per
  // the secretary's explicit sign-off: grading cards never show an owner's
  // address). This used to keep just the primary owner, so a jointly-owned
  // dog's card named one person — Mandy caught "Paul Williams" alone on
  // Wakematt's Morty at Starkwill, owned by Williams AND Starkey (2026-08-24).
  const dogIds = [...new Set(entries.map((e) => e.dogId).filter((id): id is string => Boolean(id)))];
  const ownerNamesByDog = new Map<string, string[]>();
  if (dogIds.length > 0) {
    const owners = await db.query.dogOwners.findMany({
      where: inArray(schema.dogOwners.dogId, dogIds),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    for (const o of owners) {
      const names = ownerNamesByDog.get(o.dogId) ?? [];
      names.push(o.ownerName);
      ownerNamesByDog.set(o.dogId, names);
    }
  }
  // "A" · "A & B" · "A, B & C" — natural English list of the joint owners.
  const joinOwnerNames = (names: string[]): string => {
    const cased = names.map(smartOwnerTitleCase).filter(Boolean);
    if (cased.length <= 1) return cased[0] ?? '';
    return `${cased.slice(0, -1).join(', ')} & ${cased[cased.length - 1]}`;
  };

  // ONE card per dog: a dog can have more than one entries row (multiple
  // classes) even though SV/WUSV is "one class per dog" in the common case —
  // group by dogId and union each dog's entryClasses so a stray second row
  // never produces a duplicate card. First entry row (by id) stands in for
  // the dog's catalogue number / dog fields, which are identical across rows
  // for the same dog by construction (catalogue-numbering.ts).
  const entriesByDog = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.dog || !e.dogId) continue; // Junior Handling entries have no dog — no card.
    const list = entriesByDog.get(e.dogId) ?? [];
    list.push(e);
    entriesByDog.set(e.dogId, list);
  }

  const gradingEntries: GradingCardEntry[] = [];
  for (const [, dogEntries] of entriesByDog) {
    const e = dogEntries[0];
    if (!e.dog) continue;

    // First class by the showClass's sortOrder (SV = one class per dog, so
    // this is normally the only one — sortOrder tie-breaks a dog entered in
    // more than one class deterministically rather than by insert order).
    const sortedClasses = dogEntries
      .flatMap((de) => de.entryClasses)
      .map((ec) => showClassById.get(ec.showClassId))
      .filter((sc): sc is NonNullable<typeof sc> => Boolean(sc))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const sc = sortedClasses[0];

    const className = sc?.classDefinition?.name?.replace(/^SV\s+/, '') ?? '';
    // A dog with no resolvable class gets no judge name rather than a guess —
    // a blank line on the card is honest; the wrong judge's name is not.
    const judgeName = sc ? (judgeForClass(sc)?.name ?? '') : '';

    gradingEntries.push({
      ringNumber: e.catalogueNumber ?? '',
      dogName: e.dog.registeredName,
      dob: safeDate(e.dog.dateOfBirth),
      microchipNumber: e.dog.microchipNumber ?? '',
      regNumber: formatRegNumber(e.dog.kcRegNumber),
      sireName: e.dog.sireName ?? '',
      damName: e.dog.damName ?? '',
      breederName: e.dog.breederName ?? '',
      // As-typed owner names ("mandy mcateer") print on the card — same
      // Title Case treatment the catalogue gives them (Mandy 2026-08-24).
      ownerName: joinOwnerNames(e.dogId ? (ownerNamesByDog.get(e.dogId) ?? []) : []),
      sex: sexLabel(e.dog.sex),
      coat: coatLabel(e.dog.coatType),
      className,
      judgeName,
    });
  }

  // Sort by catalogue number (numeric where possible), nulls last — same
  // convention as the catalogue and every other ordered report.
  gradingEntries.sort((a, b) => {
    if (!a.ringNumber && !b.ringNumber) return 0;
    if (!a.ringNumber) return 1;
    if (!b.ringNumber) return -1;
    const an = Number(a.ringNumber);
    const bn = Number(b.ringNumber);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return a.ringNumber.localeCompare(b.ringNumber);
  });

  return {
    info: {
      showName: show.name,
      showDate: safeDate(show.startDate),
    },
    entries: gradingEntries,
  };
}
