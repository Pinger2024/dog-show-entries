/**
 * Loads everything the SV graded results report + spreadsheet need for one
 * show, and maps the Drizzle rows onto the DB-free input shapes in
 * `@/lib/sv-results`. Used by the `/api/reports/[showId]/sv-results*` routes.
 */
import { eq } from 'drizzle-orm';
import type { db as Db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type {
  SvResultsReportInput,
  SvEntryInput,
  SvShowClassInput,
  SvAchievementInput,
  SvJudgeRowInput,
  SvCoat,
} from '@/lib/sv-results';

export interface SvResultsLoad {
  show: {
    id: string;
    name: string;
    showRuleset: 'rkc' | 'wusv';
    startDate: string;
    organisationName: string | null;
    venueName: string | null;
  };
  reportInput: SvResultsReportInput;
}

type Database = NonNullable<typeof Db>;

export async function loadSvResultsData(
  db: Database,
  showId: string,
): Promise<SvResultsLoad | null> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });
  if (!show) return null;

  const [showClasses, entries, achievements, judgeRows] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true },
    }),
    db.query.entries.findMany({
      where: eq(schema.entries.showId, showId),
      with: {
        dog: { with: { owners: true } },
        juniorHandlerDetails: true,
        entryClasses: { with: { result: true } },
      },
    }),
    db.query.achievements.findMany({
      where: eq(schema.achievements.showId, showId),
      with: { dog: { columns: { registeredName: true } } },
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
  ]);

  const mappedClasses: SvShowClassInput[] = showClasses.map((sc) => ({
    id: sc.id,
    sex: (sc.sex as 'dog' | 'bitch' | null) ?? null,
    svCoatType: (sc.svCoatType as SvCoat | null) ?? null,
    classNumber: sc.classNumber ?? null,
    sortOrder: sc.sortOrder ?? null,
    classDefinition: sc.classDefinition
      ? { type: sc.classDefinition.type ?? null, name: sc.classDefinition.name ?? null }
      : null,
  }));

  // Only confirmed, non-deleted entries appear in results.
  const mappedEntries: SvEntryInput[] = entries
    .filter((e) => e.status === 'confirmed' && !e.deletedAt)
    .map((e) => ({
      id: e.id,
      absent: e.absent,
      catalogueNumber: e.catalogueNumber ?? null,
      entryType: e.entryType,
      dog: e.dog
        ? {
            registeredName: e.dog.registeredName,
            sex: (e.dog.sex as 'dog' | 'bitch' | null) ?? null,
            coatType: (e.dog.coatType as SvCoat | null) ?? null,
            dateOfBirth: e.dog.dateOfBirth ?? null,
            microchipNumber: e.dog.microchipNumber ?? null,
            registrationBody: e.dog.registrationBody ?? null,
            registrationBodyOther: e.dog.registrationBodyOther ?? null,
            kcRegNumber: e.dog.kcRegNumber ?? null,
            sireName: e.dog.sireName ?? null,
            sireRegistrationBody: e.dog.sireRegistrationBody ?? null,
            sireRegistrationNumber: e.dog.sireRegistrationNumber ?? null,
            damName: e.dog.damName ?? null,
            damRegistrationBody: e.dog.damRegistrationBody ?? null,
            damRegistrationNumber: e.dog.damRegistrationNumber ?? null,
            breederName: e.dog.breederName ?? null,
            breederCity: e.dog.breederCity ?? null,
            breederPostcode: e.dog.breederPostcode ?? null,
            breederCountry: e.dog.breederCountry ?? null,
            owners: (e.dog.owners ?? []).map((o) => ({
              ownerName: o.ownerName,
              ownerAddress: o.ownerAddress ?? null,
              isPrimary: o.isPrimary,
              sortOrder: o.sortOrder,
            })),
          }
        : null,
      juniorHandler: e.juniorHandlerDetails
        ? { handlerName: e.juniorHandlerDetails.handlerName, dateOfBirth: e.juniorHandlerDetails.dateOfBirth }
        : null,
      entryClasses: e.entryClasses.map((ec) => ({
        showClassId: ec.showClassId,
        result: ec.result
          ? {
              svGrade: ec.result.svGrade ?? null,
              placement: ec.result.placement ?? null,
              placementStatus: ec.result.placementStatus ?? null,
            }
          : null,
      })),
    }));

  const mappedAchievements: SvAchievementInput[] = achievements.map((a) => ({
    type: a.type,
    dog: a.dog ? { registeredName: a.dog.registeredName } : null,
  }));

  const mappedJudges: SvJudgeRowInput[] = judgeRows.map((ja) => ({
    judge: ja.judge ? { id: ja.judge.id, name: ja.judge.name } : null,
    breed: ja.breed ? { name: ja.breed.name } : null,
    sex: ja.sex ?? null,
    isSpecialAwardsClassesJudge: ja.isSpecialAwardsClassesJudge ?? null,
    subjectToRkcApproval: ja.subjectToRkcApproval ?? null,
    judgeRoleId: ja.judgeRoleId ?? null,
  }));

  return {
    show: {
      id: show.id,
      name: show.name,
      showRuleset: show.showRuleset,
      startDate: show.startDate,
      organisationName: show.organisation?.name ?? null,
      venueName: show.venue?.name ?? null,
    },
    reportInput: {
      showClasses: mappedClasses,
      entries: mappedEntries,
      achievements: mappedAchievements,
      judges: mappedJudges,
    },
  };
}
