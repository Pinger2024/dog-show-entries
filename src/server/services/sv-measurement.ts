/**
 * Recording an SV dog's height and chest depth — ONE owner for the rules
 * (Mandy, 30 Sept 2026: "both but doesn't need to be on the day, can be
 * afterwards, every dog from junior upwards gets measured"):
 *
 *  - a regional (WUSV) show, a live entry, in a measured class
 *    (`isSvMeasuredClass` — Junior, Yearling, Adult, Working);
 *  - not a dog marked absent from that class — absent dogs aren't measured;
 *  - each value blank (clears it) or inside the typo bounds
 *    (`svMeasurementProblem`);
 *  - allowed after results are published and locked: measurements don't
 *    change a placing, and the secretary adds them afterwards.
 *
 * Access (steward assigned to the show, a secretary of the club, an admin) is
 * the caller's job — steward.recordSvMeasurement.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { entries, entryClasses } from '@/server/db/schema';
import { isLiveEntry } from '@/lib/entry-counts';
import { isSvMeasuredClass } from '@/lib/sv-grading';
import { svMeasurementProblem } from '@/lib/sv-measurement';

export type RecordSvMeasurementInput = {
  entryClassId: string;
  heightCm: number | null;
  depthCm: number | null;
};

/** The show this entry class belongs to — for the caller's access check. */
export async function svMeasurementShow(db: Database, entryClassId: string) {
  const ec = await db.query.entryClasses.findFirst({
    where: eq(entryClasses.id, entryClassId),
    columns: { id: true },
    with: { showClass: { columns: { showId: true }, with: { show: { columns: { id: true, organisationId: true } } } } },
  });
  if (!ec?.showClass?.show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry class not found' });
  return ec.showClass.show;
}

export async function recordSvMeasurement(db: Database, input: RecordSvMeasurementInput) {
  const ec = await db.query.entryClasses.findFirst({
    where: eq(entryClasses.id, input.entryClassId),
    with: {
      entry: { columns: { id: true, status: true, deletedAt: true } },
      showClass: {
        columns: { id: true },
        with: { classDefinition: { columns: { name: true } }, show: { columns: { showRuleset: true } } },
      },
    },
  });
  if (!ec) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry class not found' });
  if (!isLiveEntry(ec.entry)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This entry is not confirmed' });
  }
  if (ec.showClass.show?.showRuleset !== 'wusv') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Height and depth are only recorded at regional (SV) shows' });
  }
  if (!isSvMeasuredClass(ec.showClass.classDefinition?.name)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Height and depth are only recorded for dogs from Junior upwards',
    });
  }
  if (ec.absent) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This dog is marked absent, so it has no measurements' });
  }
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
