/**
 * Auth-gated download of the archived judge-contract PDF.
 *
 * Flow: authed secretary (or admin) hits this endpoint → we look up the
 * contract, verify their org membership → redirect them to a short-lived
 * presigned R2 URL. The object itself is never public because the contract
 * contains the judge's email and commercial terms.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { judgeContracts, memberships } from '@/server/db/schema';
import { auth } from '@/lib/auth';
import { generatePresignedGetUrl } from '@/server/services/storage';
import { sanitizeFilename } from '@/lib/slugify';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const contract = await db.query.judgeContracts.findFirst({
    where: eq(judgeContracts.id, contractId),
    with: { show: { columns: { id: true, organisationId: true, name: true } } },
  });

  if (!contract) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!contract.contractPdfKey) {
    return NextResponse.json(
      { error: 'contract has no archived pdf — it may predate this feature or the judge has not yet accepted' },
      { status: 404 },
    );
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'admin') {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, session.user.id),
        eq(memberships.organisationId, contract.show.organisationId),
        eq(memberships.status, 'active'),
      ),
      columns: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const filename = `judging-contract-${sanitizeFilename(contract.show.name).toLowerCase()}-${sanitizeFilename(contract.judgeName).toLowerCase()}.pdf`;

  // 300s TTL: enough for the browser to follow the 302 and start the
  // download, short enough that a copied link won't leak as a stable URL.
  const url = await generatePresignedGetUrl(contract.contractPdfKey, {
    expiresIn: 300,
    filename,
  });

  return NextResponse.redirect(url, { status: 302 });
}

// Presigned URLs are short-lived — skip Next.js's route-level cache.
export const dynamic = 'force-dynamic';
