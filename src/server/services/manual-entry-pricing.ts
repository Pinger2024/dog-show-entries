/**
 * ONE owner for what a secretary's manual entry costs — used by
 * secretary.createManualEntry (what Remi records) and
 * secretary.previewManualEntryFee (what the "Add entry" dialog shows), so the
 * two can never disagree. Before 28 Sept 2026 the dialog showed the plain sum
 * of each class's own fee while the entry was priced through the fee engine
 * (subsequent-class rate, the regional scale, the multi-dog package and the
 * exhibitor's earlier dogs) — a secretary saw one figure and Remi recorded
 * another.
 *
 * `exhibitorId` null = price for someone with nothing entered at the show yet
 * (the dialog before an email is typed).
 */
import type { db as Database } from '@/server/db';
import type { shows } from '@/server/db/schema';
import { computeOrderFees, type FeeContext } from '@/lib/fee-calc';
import { computeRegionalOrderFees, regionalClassFlatFee } from '@/lib/regional-fee-calc';
import { countPriorRegionalPayingDogs } from './regional-pricing';
import { priorPackageStanding } from './package-pricing';

export type ManualEntryClass = {
  entryFee: number;
  classDefinition?: { type: string | null; name: string | null } | null;
};

export async function priceManualEntry(
  database: typeof Database,
  params: {
    show: typeof shows.$inferSelect;
    exhibitorId: string | null;
    /** The dog's classes, in the order they will be stored. */
    selectedClasses: ManualEntryClass[];
    isNfc: boolean;
  },
): Promise<{ classFee: number; perClassFees: number[] | null }> {
  const { show, exhibitorId, selectedClasses } = params;
  // Price through the SAME fee engine the online checkout uses, so a
  // postal/cash entry costs exactly what the identical dog + classes would
  // cost online: first-class fee + subsequent-class fee per extra class.
  // Summing each class's entryFee (every class carries the first-class
  // rate) previously charged the first-class fee for EVERY class, so a
  // 3-class entry was billed 3× the first fee instead of first + 2×
  // subsequent — overcharging the exhibitor and inflating club revenue
  // reports (bug hunt #2). Legacy shows with no show-level fee keep the
  // per-class fallback, matching orders.checkout.
  const feeCtx: FeeContext = {
    firstEntryFeePence: show.firstEntryFee,
    subsequentEntryFeePence: show.subsequentEntryFee,
    nfcEntryFeePence: show.nfcEntryFee,
    juniorHandlerFeePence: show.juniorHandlerFee,
    multiDogThreshold: show.multiDogThreshold,
    multiDogPackagePence: show.multiDogPackagePence,
    discountGroup: null,
    // The exhibitor's dogs already at this show count toward the multi-dog
    // package, same as checkout (Mandy 2026-09-28). ONE owner:
    // priorPackageStanding.
    prior: exhibitorId
      ? await priorPackageStanding(database, { showId: show.id, exhibitorId, show })
      : null,
  };
  // Regional (SV/WUSV) shows price on the tiered per-dog scale, NOT the RKC
  // first/subsequent-class fees — and until 2026-09-16 this path used the RKC
  // engine regardless, so a manually-keyed regional dog was charged full
  // price with no multi-dog scale at all (found on the NE Regional: four
  // dogs keyed in one at a time, £20 each, when the scale says £20/£20/£16/£0).
  //
  // Manual entries price at the show's STANDARD tiers — there is no member
  // tick on this form, and Mandy 2026-09-16 decided not to add one: "if they
  // only want to charge the lesser amount they can, but they will need to
  // reconcile their fees against the account". A secretary who wants to give
  // a postal member the member rate adjusts it themselves. Do not add a
  // membership control here without asking her again.
  const regionalCfg =
    show.showRuleset === 'wusv' ? show.regionalFeeConfig : null;
  // A manual entry is always one dog in one class — there is no junior-handler
  // or NFC variant on this path (regionals take no NFC entries at all).
  const regionalFeeResult = regionalCfg
    ? computeRegionalOrderFees(
        [
          {
            key: 'manual',
            kind: 'standard' as const,
            flatFeePence: regionalClassFlatFee(
              {
                className: selectedClasses[0]?.classDefinition?.name,
                classType: selectedClasses[0]?.classDefinition?.type,
                entryFee: selectedClasses[0]?.entryFee ?? null,
              },
              regionalCfg.tiers,
            ),
          },
        ],
        {
          tiers: regionalCfg.tiers,
          isMember: false,
          firstTimeExhibitor: false,
          firstTimeFeePence: regionalCfg.firstTimeFeePence ?? 0,
          juniorHandlerFeePence: show.juniorHandlerFee ?? 0,
          // Same rule as checkout: the dogs this exhibitor already has at
          // this show set the starting position on the scale.
          priorPayingDogCount: exhibitorId
            ? await countPriorRegionalPayingDogs(database, { showId: show.id, exhibitorId })
            : 0,
        },
      )
    : null;

  const feeResult =
    regionalFeeResult != null || show.firstEntryFee == null
      ? null
      : computeOrderFees(
          [{
            key: 'manual',
            kind: params.isNfc ? 'nfc' : 'standard',
            classCount: selectedClasses.length,
            // Special Award Classes charge their own fee (Mandy 2026-07-19),
            // aligned to selectedClasses order (perClassFees[i] matches it).
            specialClassFees: selectedClasses.map((sc) =>
              sc.classDefinition?.type === 'special' ? sc.entryFee : null,
            ),
          }],
          feeCtx,
        );
  const perClassFees =
    regionalFeeResult?.perEntry[0]?.perClassFees ?? feeResult?.perEntry[0]?.perClassFees ?? null;
  const classFee = regionalFeeResult
    ? regionalFeeResult.entriesTotal
    : feeResult
      ? feeResult.total
      : selectedClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
  return { classFee, perClassFees };
}
