/**
 * Generate and archive the PDF snapshot of a judge contract.
 *
 * Fired once — when the judge clicks "Accept Appointment" on the offer link.
 * The PDF captures the exact terms both parties agreed at that moment and is
 * stored in R2 against the judge_contracts row so the Society can produce it
 * for any RKC audit request.
 *
 * Idempotent: if a PDF key already exists on the row, returns without
 * regenerating. Re-generation is exposed via `force: true` for retroactive
 * backfill of contracts that were confirmed before this feature landed.
 */
import { and, eq } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/server/db';
import { judgeContracts, judgeAssignments } from '@/server/db/schema';
import { uploadToR2 } from './storage';
import {
  JudgeContractPdf,
  type JudgeContractPdfData,
} from '@/components/judge-contract/judge-contract-pdf';

export type GenerateResult =
  | { status: 'generated'; key: string }
  | { status: 'skipped'; key: string; reason: 'already-exists' }
  | { status: 'skipped'; reason: 'not-accepted' };

export async function generateJudgeContractPdf(
  contractId: string,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  if (!db) throw new Error('No DB connection');

  const contract = await db.query.judgeContracts.findFirst({
    where: eq(judgeContracts.id, contractId),
    with: {
      show: { with: { venue: true, organisation: true } },
      judge: true,
    },
  });

  if (!contract) throw new Error(`Contract ${contractId} not found`);

  // Only contracts the judge has actually agreed to — offer_sent has no
  // executed agreement yet, and declined means there's nothing to archive.
  if (contract.stage !== 'offer_accepted' && contract.stage !== 'confirmed') {
    return { status: 'skipped', reason: 'not-accepted' };
  }

  if (contract.contractPdfKey && !opts.force) {
    return { status: 'skipped', key: contract.contractPdfKey, reason: 'already-exists' };
  }

  const assignments = await db.query.judgeAssignments.findMany({
    where: and(
      eq(judgeAssignments.showId, contract.showId),
      eq(judgeAssignments.judgeId, contract.judgeId),
    ),
    with: { breed: true },
  });

  const breedsAssigned = assignments
    .map((a) => a.breed?.name)
    .filter((name): name is string => Boolean(name));

  const show = contract.show;
  const societyName = show.organisation?.name ?? 'The Show Society';

  // Secretary name isn't snapshotted on the contract, so we pull the current
  // show.secretaryEmail — it's the best proxy. A future enhancement could
  // denormalise the secretary's name onto the contract row at offer-send time.
  const secretaryEmail = show.secretaryEmail ?? null;

  const pdfData: JudgeContractPdfData = {
    societyName,
    secretaryName: null,
    secretaryEmail,
    show: {
      name: show.name,
      startDate: new Date(show.startDate),
      showType: show.showType,
      venueName: show.venue?.name ?? null,
      venuePostcode: show.venue?.postcode ?? null,
    },
    judge: {
      name: contract.judgeName,
      email: contract.judgeEmail,
      kennelClubAffix: contract.judge?.kennelClubAffix ?? null,
      jepLevel: contract.judge?.jepLevel ?? null,
    },
    breedsAssigned,
    expenses: {
      hotelPence: contract.hotelCost,
      travelPence: contract.travelCost,
      otherPence: contract.otherExpenses,
      notes: contract.expenseNotes,
    },
    terms: contract.notes,
    dates: {
      offerSentAt: contract.offerSentAt,
      acceptedAt: contract.acceptedAt ?? new Date(),
    },
    generatedAt: new Date(),
  };

  const pdfBuffer = await renderToBuffer(JudgeContractPdf({ data: pdfData }));

  const key = `judge-contracts/${contract.showId}/${contractId}.pdf`;
  await uploadToR2(key, pdfBuffer, 'application/pdf');

  await db
    .update(judgeContracts)
    .set({ contractPdfKey: key, contractPdfGeneratedAt: new Date() })
    .where(eq(judgeContracts.id, contractId));

  return { status: 'generated', key };
}
