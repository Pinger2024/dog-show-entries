/**
 * Loads everything the regional Results Sheet needs for one show, as plain data
 * (no React) so it can be unit-tested without rendering. Used by
 * `/api/reports/[showId]/results-sheet`.
 *
 * Nothing is re-derived here: entries come from the SAME selection as the
 * Grading Cards (`loadPaidConfirmedEntries`), class order from
 * `compareShowClassRunningOrder`, numbers from `buildClassLabelMap`, headings
 * from `svClassHeading` (the catalogue's), ring order from `ringSort`, awards
 * from `buildBestAwards` + `regionalAwardLabel`, judges from `judgeNames`,
 * measured classes from `isSvMeasuredClass`.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import { showNameWithClub } from '@/lib/show-types';
import { formatLondonLongDate } from '@/lib/date-utils';
import { buildClassLabelMap, compareShowClassRunningOrder, isJuniorHandler, svClassHeading } from '@/lib/class-labels';
import { buildBestAwards } from '@/lib/best-awards';
import { isSvMeasuredClass } from '@/lib/sv-grading';
import { judgeNames, regionalAwardLabel, ringSort } from '@/lib/sv-results';
import { loadPaidConfirmedEntries } from '@/server/services/grading-cards-data';
import type { ResultsSheetData, ResultsSheetBlock } from '@/components/reports/results-sheet-pdf';

function safeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return formatLondonLongDate(iso);
  } catch {
    return iso;
  }
}

export async function loadResultsSheetData(db: Database, showId: string): Promise<ResultsSheetData | null> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    // The club's NAME only — never the whole organisation row (bank details).
    with: { organisation: { columns: { name: true } } },
  });
  if (!show) return null;

  const [showClasses, judgeRows, entries] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true },
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
    loadPaidConfirmedEntries(db, showId),
  ]);

  const labels = buildClassLabelMap(showClasses, show.showRuleset);

  // Rows per show class: one per entry_class (a dog in two classes appears in both).
  const rowsByClass = new Map<string, { ringNumber: string | null; name: string; absent: boolean }[]>();
  for (const e of entries) {
    const name = e.juniorHandlerDetails?.handlerName ?? e.dog?.registeredName;
    if (!name) continue;
    for (const ec of e.entryClasses) {
      const list = rowsByClass.get(ec.showClassId) ?? [];
      list.push({ ringNumber: e.catalogueNumber ?? null, name, absent: ec.absent });
      rowsByClass.set(ec.showClassId, list);
    }
  }

  const blocks: ResultsSheetBlock[] = showClasses
    .slice()
    .sort(compareShowClassRunningOrder)
    .filter((sc) => (rowsByClass.get(sc.id)?.length ?? 0) > 0)
    .map((sc) => {
      const label = labels.get(sc.id) ?? '';
      const className = sc.classDefinition?.name ?? 'Unknown Class';
      const jh = isJuniorHandler(sc);
      return {
        showClassId: sc.id,
        label,
        heading: svClassHeading({ classLabel: label, className, sex: sc.sex, svCoatType: sc.svCoatType }),
        measured: !jh && isSvMeasuredClass(className),
        isJuniorHandling: jh,
        rows: rowsByClass
          .get(sc.id)!
          .slice()
          .sort((a, b) => ringSort(a.ringNumber, b.ringNumber))
          .map((r) => ({ ringNumber: r.ringNumber ?? '', name: r.name, absent: r.absent })),
      };
    });

  const judges = judgeNames(
    judgeRows.map((ja) => ({
      judge: ja.judge ? { id: ja.judge.id, name: ja.judge.name } : null,
      breed: ja.breed ? { name: ja.breed.name } : null,
      sex: ja.sex ?? null,
      isSpecialAwardsClassesJudge: ja.isSpecialAwardsClassesJudge ?? null,
      judgeRoleId: ja.judgeRoleId ?? null,
    })),
  );

  // The configured list lives in scheduleData (as the judges' book reads it).
  const scheduleData = (show.scheduleData ?? {}) as { bestAwards?: string[] };
  const customAwards = Array.isArray(scheduleData.bestAwards) ? scheduleData.bestAwards : [];

  return {
    showName: showNameWithClub(show.name, show.organisation?.name),
    showDate: safeDate(show.startDate),
    judges: judges.breed,
    jhJudges: judges.jh,
    blocks,
    awards: buildBestAwards(show.showType, customAwards, show.showRuleset).map((name) => ({
      label: regionalAwardLabel(name),
    })),
  };
}
