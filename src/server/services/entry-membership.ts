/**
 * ONE owner for what a declared membership means when an entry is priced —
 * online checkout (orders.checkout) and the secretary's Add Entry
 * (secretary.previewManualEntryFee / createManualEntry). Mandy, 30 Sept 2026:
 * "yes add member now" — the Add Entry dialog gained a member choice, and it
 * must price exactly as the same choice does online.
 *
 *  - RKC: a show discount group (e.g. "Members") → its first-entry fee and
 *    multi-dog package, via FeeContext.discountGroup.
 *  - Regional (SV/WUSV): a membership label from `regionalMembershipOptions`
 *    → the membership's own per-dog schedule if it has one, else the member
 *    column of the show's tiers. Self-declared, on trust.
 *
 * A membership the show doesn't offer is refused with the messages checkout
 * has always used.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { showDiscountGroups, type shows } from '@/server/db/schema';
import type { FeeContext } from '@/lib/fee-calc';
import { regionalMembershipOptions, type RegionalFeeTier } from '@/lib/regional-fee-calc';

export type MembershipDeclaration = {
  discountGroupId?: string | null;
  regionalMembership?: string | null;
};

export type ResolvedMembership = {
  discountGroupId: string | null;
  discountGroup: FeeContext['discountGroup'];
  /** The regional membership label as the show lists it, or null. */
  regionalLabel: string | null;
  /** The membership's own per-dog schedule, when it has one. */
  regionalTiers: RegionalFeeTier[] | null;
  /** True → price on the member column of the show's tiers. */
  regionalIsMember: boolean;
};

export const NO_MEMBERSHIP: ResolvedMembership = {
  discountGroupId: null,
  discountGroup: null,
  regionalLabel: null,
  regionalTiers: null,
  regionalIsMember: false,
};

export async function resolveEntryMembership(
  database: typeof Database,
  show: Pick<typeof shows.$inferSelect, 'id' | 'showRuleset' | 'regionalFeeConfig'>,
  declared: MembershipDeclaration,
): Promise<ResolvedMembership> {
  const out: ResolvedMembership = { ...NO_MEMBERSHIP };

  if (declared.discountGroupId) {
    const dg = await database.query.showDiscountGroups.findFirst({
      where: and(eq(showDiscountGroups.id, declared.discountGroupId), eq(showDiscountGroups.showId, show.id)),
    });
    if (!dg) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Discount group not valid for this show' });
    }
    out.discountGroupId = dg.id;
    out.discountGroup = { firstEntryFeePence: dg.firstEntryFeePence, multiDogPackagePence: dg.multiDogPackagePence };
  }

  const regionalCfg = show.showRuleset === 'wusv' ? show.regionalFeeConfig : null;
  if (regionalCfg && declared.regionalMembership) {
    const option = regionalMembershipOptions(regionalCfg).find((m) => m.label === declared.regionalMembership);
    if (!option) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown membership option for this show' });
    }
    out.regionalLabel = option.label;
    out.regionalTiers = option.tiers?.length ? option.tiers : null;
    out.regionalIsMember = !option.tiers?.length;
  }

  return out;
}
