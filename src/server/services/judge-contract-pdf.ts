/**
 * Generate and archive the PDF snapshot of a judge contract.
 *
 * Fired when the judge accepts the offer. The PDF captures the exact terms
 * both parties agreed at that moment and is stored in R2 against the
 * judge_contracts row so the Society can produce it for an RKC audit.
 *
 * Idempotent — a second call is a no-op unless `force: true`. Declined or
 * still-pending contracts are skipped.
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
  | { status: 'generated' }
  | { status: 'skipped'; reason: 'already-exists' | 'not-accepted' };

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

  if (contract.stage !== 'offer_accepted' && contract.stage !== 'confirmed') {
    return { status: 'skipped', reason: 'not-accepted' };
  }

  if (contract.contractPdfKey && !opts.force) {
    return { status: 'skipped', reason: 'already-exists' };
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

  const pdfData: JudgeContractPdfData = {
    societyName: show.organisation?.name ?? 'The Show Society',
    secretaryEmail: show.secretaryEmail ?? null,
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

  return { status: 'generated' };
}
