import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { achievements, judges } from '@/server/db/schema';
import { isVisibleToViewer } from '@/lib/result-visibility';
import { effectiveCcType } from '@/lib/effective-achievement-type';
import { isCcType, isRccType } from '@/lib/placements';
import { SHCEX_AWARD_KIND, type ShcexAward, type ShowKind, type TitleAward } from '@/lib/rkc-titles';

export type TitleAwardRecord = TitleAward & {
  showName: string;
  /** Added by the owner by hand, not recorded at a Remi show. */
  addedByOwner: boolean;
};

/** What the owner stores on an award they add by hand (achievements.details). */
export type ExternalResultDetails = {
  showName?: string | null;
  judgeName?: string | null;
  selfReported?: boolean;
  showType?: ShowKind['showType'];
  showScope?: ShowKind['showScope'];
  groupPlace?: number | null;
  groupSystem?: boolean | null;
};

/**
 * A dog's CCs, Reserve CCs and Bests of Breed, and the awards that can earn
 * Show Certificate of Excellence points — won at shows run on Remi and added
 * by the owner by hand — each with the judge's name and what kind of show it
 * was. The one loader behind both title-progress views (lib/rkc-titles.ts).
 *
 * `viewerMaySeeUnpublished` — the dog's own people see every award at once;
 * anyone else only published ones (lib/result-visibility.ts).
 */
export async function loadTitleAwards(
  db: Database,
  dogId: string,
  viewerMaySeeUnpublished: boolean,
): Promise<{
  awards: TitleAwardRecord[];
  bobs: Array<{ showName: string; date: string; addedByOwner: boolean }>;
  shcexAwards: ShcexAward[];
}> {
  const rows = await db.query.achievements.findMany({
    where: eq(achievements.dogId, dogId),
    with: { show: { columns: { name: true, showType: true, showScope: true } } },
  });
  const visible = rows.filter((a) => isVisibleToViewer(a, viewerMaySeeUnpublished));

  const judgeIds = [...new Set(visible.map((a) => a.judgeId).filter((id): id is string => !!id))];
  const judgeNames = new Map<string, string>();
  if (judgeIds.length > 0) {
    const judgeRows = await db
      .select({ id: judges.id, name: judges.name })
      .from(judges)
      .where(inArray(judges.id, judgeIds));
    for (const j of judgeRows) judgeNames.set(j.id, j.name);
  }

  const awards: TitleAwardRecord[] = [];
  const bobs: Array<{ showName: string; date: string; addedByOwner: boolean }> = [];
  const shcexAwards: ShcexAward[] = [];
  for (const a of visible) {
    const details = (a.details ?? {}) as ExternalResultDetails;
    const showName = a.show?.name ?? details.showName ?? '';
    const judgeName = (a.judgeId ? judgeNames.get(a.judgeId) : null) ?? details.judgeName ?? null;
    const addedByOwner = !a.showId && details.selfReported === true;
    // A single-breed championship show's Best Dog / Best Bitch IS the CC
    // (Mandy, 2026-07-09).
    const type = effectiveCcType(a.type, a.show?.showType, a.show?.showScope);
    if (isCcType(type)) awards.push({ kind: 'cc', date: a.date, judgeName, showName, addedByOwner });
    else if (isRccType(type)) awards.push({ kind: 'rcc', date: a.date, judgeName, showName, addedByOwner });
    if (a.type === 'best_of_breed') bobs.push({ showName, date: a.date, addedByOwner });

    const shcexKind = SHCEX_AWARD_KIND[a.type];
    if (shcexKind) {
      shcexAwards.push({
        kind: shcexKind,
        date: a.date,
        // A show run on Remi knows what it was; a hand-added result says.
        showType: (a.show?.showType ?? details.showType ?? null) as ShowKind['showType'],
        showScope: (a.show?.showScope ?? details.showScope ?? null) as ShowKind['showScope'],
        groupPlace: details.groupPlace ?? null,
        groupSystem: details.groupSystem ?? null,
      });
    }
  }
  return { awards, bobs, shcexAwards };
}
