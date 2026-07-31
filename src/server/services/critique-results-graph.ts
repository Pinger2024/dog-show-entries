/**
 * Loads the show_classes → entry_classes → entries → dogs → results graph
 * that critique-parse.ts (class header matching) and critique-match.ts
 * (class+placement matching) need, and shapes it into their pure-lib input
 * types. Shared by the upload route and the critiques tRPC router so the
 * join logic can't drift between "parse a fresh upload" and "reassign in
 * review".
 *
 * Junior Handling and Special Award classes have `sex: null` in the DB
 * (class-labels.ts: "Special Award classes are sex: null AND unnumbered;
 * Junior Handling is sex: null AND numbered") — but critique-parse's
 * ClassListEntry requires 'dog' | 'bitch' for its "<class name> Dog/Bitch"
 * header format. Per the design brief ("include ALL the show's classes —
 * critiques may cover JH too"), a null-sex class gets BOTH header variants
 * registered against the same showClassId, so a critique that happens to
 * name it either way still has a chance to match instead of being silently
 * dropped from the class list. This never collides with a real breed
 * class's header (those already have a real sex). For the results graph
 * (critique-match.ts), `sex` isn't read by the matching logic at all — only
 * `showClassId` and the per-entry placement/name/critique fields are — so a
 * single row per class with an arbitrary sex default is enough there.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { showClasses } from '@/server/db/schema';
import type { ClassListEntry } from '@/lib/critique-parse';
import type { ResultsGraphEntry, ResultsGraphShowClass } from '@/lib/critique-match';

export interface ShowClassRow {
  id: string;
  className: string;
  sex: 'dog' | 'bitch' | null;
  entries: ResultsGraphEntry[];
}

export async function loadShowClassRows(db: Database, showId: string): Promise<ShowClassRow[]> {
  const rows = await db.query.showClasses.findMany({
    where: eq(showClasses.showId, showId),
    with: {
      classDefinition: { columns: { name: true } },
      entryClasses: {
        with: {
          entry: {
            columns: { status: true, deletedAt: true, absent: true, entryType: true },
            with: {
              dog: { columns: { registeredName: true } },
              juniorHandlerDetails: { columns: { handlerName: true } },
            },
          },
          result: { columns: { placement: true, critiqueText: true } },
        },
      },
    },
    orderBy: (sc, { asc }) => [asc(sc.sortOrder)],
  });

  return rows.map((sc) => ({
    id: sc.id,
    className: sc.classDefinition.name,
    sex: sc.sex,
    entries: sc.entryClasses
      .filter(
        (ec) =>
          ec.entry.status === 'confirmed' &&
          !ec.entry.deletedAt &&
          !ec.entry.absent &&
          ec.result?.placement != null,
      )
      .map((ec) => ({
        entryClassId: ec.id,
        placement: ec.result!.placement!,
        registeredName:
          (ec.entry.entryType === 'junior_handler'
            ? ec.entry.juniorHandlerDetails?.handlerName
            : ec.entry.dog?.registeredName) ?? 'Unknown',
        existingCritiqueText: ec.result?.critiqueText ?? null,
      }))
      // Placement order within each class — the review pickers walk this
      // list, and a secretary expects 1st, 2nd, 3rd… (Mandy, 2026-07-31).
      .sort((a, b) => a.placement - b.placement),
  }));
}

export function toClassList(rows: ShowClassRow[]): ClassListEntry[] {
  const out: ClassListEntry[] = [];
  for (const sc of rows) {
    if (sc.sex === 'dog' || sc.sex === 'bitch') {
      out.push({ showClassId: sc.id, className: sc.className, sex: sc.sex });
    } else {
      out.push({ showClassId: sc.id, className: sc.className, sex: 'dog' });
      out.push({ showClassId: sc.id, className: sc.className, sex: 'bitch' });
    }
  }
  return out;
}

export function toResultsGraph(rows: ShowClassRow[]): ResultsGraphShowClass[] {
  return rows.map((sc) => ({
    showClassId: sc.id,
    className: sc.className,
    // Arbitrary for null-sex (JH/Special) classes — matchCritiqueBlocks never
    // reads this field, only showClassId + entries.
    sex: sc.sex === 'bitch' ? 'bitch' : 'dog',
    entries: sc.entries,
  }));
}

/** Flat entryClassId → display info, for review-screen pickers and display
 *  resolution (dog name, class name, placement) without a second query. */
export interface AssignableEntryClass {
  entryClassId: string;
  showClassId: string;
  className: string;
  /** Real DB sex — null for Junior Handling / Special Award classes. Distinct
   *  from the doubled dog/bitch header variants toClassList() emits. */
  sex: 'dog' | 'bitch' | null;
  placement: number;
  registeredName: string;
  existingCritiqueText: string | null;
}

export function toAssignableList(rows: ShowClassRow[]): AssignableEntryClass[] {
  const out: AssignableEntryClass[] = [];
  for (const sc of rows) {
    for (const e of sc.entries) {
      out.push({
        entryClassId: e.entryClassId,
        showClassId: sc.id,
        className: sc.className,
        sex: sc.sex,
        placement: e.placement,
        registeredName: e.registeredName,
        existingCritiqueText: e.existingCritiqueText,
      });
    }
  }
  return out;
}
