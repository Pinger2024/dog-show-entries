/**
 * Recording an SV dog's height and chest depth — ONE owner for who may record
 * them, which dogs they apply to, and what may be saved (Mandy, 30 Sept 2026:
 * "both but doesn't need to be on the day, can be afterwards, every dog from
 * junior upwards gets measured"):
 *
 *  - WHO: an admin, a steward assigned to the show (whatever their role — a
 *    steward is often a secretary of their own club, as at North East 2026),
 *    or a secretary of the host club (`callerMayRecordSvMeasurement`). The
 *    steward types them on the day on the steward class page; the secretary
 *    types them afterwards on her Height and depth page — she needn't be a
 *    steward, and on live she usually isn't.
 *  - WHICH DOGS: `svMeasurementBlock` (lib/sv-measurement.ts) — live entry,
 *    regional show, Junior upwards, not absent. Both pages list exactly the
 *    dogs it lets through.
 *  - WHAT: each value blank (clears it) or inside the typo bounds
 *    (`svMeasurementProblem`). Allowed after results are published and
 *    locked: measurements don't change a placing.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { entries, entryClasses, memberships, showClasses, shows, stewardAssignments } from '@/server/db/schema';
import { buildSvClassNumbering, compareShowClassRunningOrder, formatSvClassName } from '@/lib/class-labels';
import { formatSvMeasurement, svMeasurementBlock, svMeasurementProblem } from '@/lib/sv-measurement';

export type RecordSvMeasurementInput = {
  entryClassId: string;
  heightCm: number | null;
  depthCm: number | null;
};

export type SvMeasurementCaller = { userId: string; role: string | undefined };

/** May this person record measurements at this show? */
export async function callerMayRecordSvMeasurement(
  db: Database,
  caller: SvMeasurementCaller,
  show: { id: string; organisationId: string },
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  const assignment = await db.query.stewardAssignments.findFirst({
    where: and(eq(stewardAssignments.userId, caller.userId), eq(stewardAssignments.showId, show.id)),
    columns: { id: true },
  });
  if (assignment) return true;
  if (caller.role !== 'secretary') return false;
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, caller.userId),
      eq(memberships.organisationId, show.organisationId),
      eq(memberships.status, 'active'),
    ),
    columns: { id: true },
  });
  return !!membership;
}

export async function recordSvMeasurement(
  db: Database,
  caller: SvMeasurementCaller,
  input: RecordSvMeasurementInput,
) {
  const ec = await db.query.entryClasses.findFirst({
    where: eq(entryClasses.id, input.entryClassId),
    with: {
      entry: { columns: { id: true, status: true, deletedAt: true } },
      showClass: {
        columns: { id: true },
        with: {
          classDefinition: { columns: { name: true } },
          show: { columns: { id: true, organisationId: true, showRuleset: true } },
        },
      },
    },
  });
  if (!ec?.showClass?.show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry class not found' });
  if (!(await callerMayRecordSvMeasurement(db, caller, ec.showClass.show))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only record measurements for your own shows' });
  }
  const block = svMeasurementBlock({
    showRuleset: ec.showClass.show.showRuleset,
    className: ec.showClass.classDefinition?.name,
    absent: ec.absent,
    entry: ec.entry,
  });
  if (block) throw new TRPCError({ code: 'BAD_REQUEST', message: block });
  for (const [kind, cm] of [['height', input.heightCm], ['depth', input.depthCm]] as const) {
    const problem = svMeasurementProblem(kind, cm);
    if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  }

  const [updated] = await db
    .update(entries)
    .set({
      svHeightCm: input.heightCm == null ? null : String(input.heightCm),
      svDepthCm: input.depthCm == null ? null : String(input.depthCm),
    })
    .where(eq(entries.id, ec.entry.id))
    .returning({ id: entries.id, svHeightCm: entries.svHeightCm, svDepthCm: entries.svDepthCm });
  return updated!;
}

/** One dog's row in a height-and-depth card, values formatted for the boxes. */
export type SvMeasurementRow = {
  entryClassId: string;
  catalogueNumber: string | null;
  dogName: string;
  svHeightCm: string;
  svDepthCm: string;
};

export type SvMeasurementSheet = {
  classes: { showClassId: string; label: string; entries: SvMeasurementRow[] }[];
};

/**
 * Every dog to measure at a show, class by class in the running order, for the
 * secretary's Height and depth page. Access is the caller's job
 * (secretary.getSvMeasurements, behind verifyShowAccess).
 */
export async function loadSvMeasurementSheet(db: Database, showId: string): Promise<SvMeasurementSheet> {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { id: true, showRuleset: true },
  });
  if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

  const classes = await db.query.showClasses.findMany({
    where: eq(showClasses.showId, showId),
    with: {
      classDefinition: { columns: { name: true, type: true } },
      entryClasses: {
        columns: { id: true, absent: true },
        with: {
          entry: {
            columns: { id: true, status: true, deletedAt: true, catalogueNumber: true, svHeightCm: true, svDepthCm: true },
            with: { dog: { columns: { registeredName: true } } },
          },
        },
      },
    },
  });
  const numbering = buildSvClassNumbering(classes, show.showRuleset);

  return {
    classes: classes
      .slice()
      .sort(compareShowClassRunningOrder)
      .map((sc) => {
        const number = numbering.get(sc.id)?.label;
        const sex = sc.sex === 'dog' ? 'Dog' : sc.sex === 'bitch' ? 'Bitch' : null;
        return {
          showClassId: sc.id,
          // "4b Junior — Long Coat (Dog)" — the entries page's wording.
          label: `${number ? `${number} ` : ''}${formatSvClassName(sc.classDefinition?.name, sc.svCoatType)}${sex ? ` (${sex})` : ''}`,
          entries: sc.entryClasses
            .filter(
              (ec) =>
                svMeasurementBlock({
                  showRuleset: show.showRuleset,
                  className: sc.classDefinition?.name,
                  absent: ec.absent,
                  entry: ec.entry,
                }) === null,
            )
            .map((ec) => ({
              entryClassId: ec.id,
              catalogueNumber: ec.entry.catalogueNumber,
              dogName: ec.entry.dog?.registeredName ?? '',
              svHeightCm: formatSvMeasurement(ec.entry.svHeightCm),
              svDepthCm: formatSvMeasurement(ec.entry.svDepthCm),
            }))
            .sort((a, b) =>
              (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true }),
            ),
        };
      })
      .filter((c) => c.entries.length > 0),
  };
}
