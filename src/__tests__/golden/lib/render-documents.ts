/**
 * Render every applicable RKC document for one loaded show fixture, through
 * the SAME code paths a secretary's browser hits — the real route handlers
 * (schedule, judges-book, prize-cards, ring-numbers, ring-board, reports,
 * invoice) and the real DB-free catalogue seam (buildCatalogueSnapshot /
 * renderCatalogueFromSnapshot). No mocking of @react-pdf/renderer, storage,
 * or poppler — see documents.golden.test.ts for the (much narrower) mocks
 * that ARE in place (auth/impersonation only, so authenticatePdfRequest
 * behaves like it does in prod without a real NextAuth session).
 *
 * This module assumes the CALLING test file has already done
 * `vi.mock('@/lib/auth', ...)` and `vi.mock('@/lib/impersonation', ...)` —
 * it just drives `vi.mocked(auth).mockResolvedValue(...)` per request, the
 * same pattern src/__tests__/integration/pdf-routes.test.ts uses.
 */
import { vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { auth } from '@/lib/auth';
import { GET as scheduleGET } from '@/app/api/schedule/[showId]/route';
import { GET as judgesBookGET } from '@/app/api/judges-book/[showId]/route';
import { GET as prizeCardsGET } from '@/app/api/prize-cards/[showId]/route';
import { GET as ringNumbersGET } from '@/app/api/ring-numbers/[showId]/route';
import { GET as ringBoardGET } from '@/app/api/ring-board/[showId]/route';
import { GET as reportsGET } from '@/app/api/reports/[showId]/[type]/route';
import { GET as invoiceGET } from '@/app/api/admin/invoices/[invoiceId]/pdf/route';
import {
  buildCatalogueSnapshot,
  renderCatalogueFromSnapshot,
  CATALOGUE_FORMATS,
} from '@/server/services/catalogue-snapshot';

export interface RenderedDocument {
  /** Stable, human-readable name — becomes the baseline file's basename and
   *  appears in every failure message (e.g. "catalogue-standard"). */
  name: string;
  buffer: Buffer;
}

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

function authAs(user: SessionUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(auth).mockResolvedValue({ user: user as any } as any);
}

const params = (record: Record<string, string>) => ({ params: Promise.resolve(record) });
const req = (url: string) => new NextRequest(url);

/** A route that fails returns a JSON error body, not a PDF — treat that as
 *  a hard test failure (naming the document) rather than silently
 *  fingerprinting an error page as if it were real content. */
async function bufferFromPdfResponse(res: Response, docName: string): Promise<Buffer> {
  if (res.status !== 200) {
    const body = await res.text().catch(() => '<unreadable body>');
    throw new Error(`Rendering "${docName}" failed: HTTP ${res.status} — ${body}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('pdf')) {
    throw new Error(`Rendering "${docName}" did not return a PDF (content-type: "${contentType}")`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Ensures the operators this render pass needs actually have the DB rows
 * authenticatePdfRequest checks for. A golden fixture deliberately does NOT
 * export real `memberships` rows (see export-show-fixture-core.ts) — every
 * show needs a fresh, harness-only secretary membership and admin user
 * instead, created directly in the already-loaded test DB.
 */
async function ensureOperators(showId: string): Promise<{ secretary: SessionUser; admin: SessionUser }> {
  const show = await db.query.shows.findFirst({ where: eq(schema.shows.id, showId) });
  if (!show) throw new Error(`ensureOperators: show ${showId} not found`);
  if (!show.secretaryUserId) {
    throw new Error(`ensureOperators: fixture show ${showId} has no secretaryUserId to grant membership to`);
  }

  const secretaryRow = await db.query.users.findFirst({ where: eq(schema.users.id, show.secretaryUserId) });
  if (!secretaryRow) {
    throw new Error(`ensureOperators: secretary user ${show.secretaryUserId} not found in loaded fixture`);
  }

  const existingMembership = await db.query.memberships.findFirst({
    where: eq(schema.memberships.userId, secretaryRow.id),
  });
  if (!existingMembership) {
    await db.insert(schema.memberships).values({
      userId: secretaryRow.id,
      organisationId: show.organisationId,
      status: 'active',
    });
  }

  const [adminRow] = await db
    .insert(schema.users)
    .values({ email: `golden-admin-${showId}@example.com`, name: 'Golden Test Admin', role: 'admin' })
    .returning();

  return {
    secretary: { id: secretaryRow.id, email: secretaryRow.email, name: secretaryRow.name, role: 'secretary' },
    admin: { id: adminRow!.id, email: adminRow!.email, name: adminRow!.name, role: 'admin' },
  };
}

export async function renderAllDocuments(showId: string): Promise<RenderedDocument[]> {
  const { secretary, admin } = await ensureOperators(showId);
  const out: RenderedDocument[] = [];

  // ── Catalogue — the DB-free seam, every format the ruleset supports ──────
  const snapshot = await buildCatalogueSnapshot(db, showId);
  for (const format of CATALOGUE_FORMATS) {
    const buffer = await renderCatalogueFromSnapshot(snapshot, format);
    out.push({ name: `catalogue-${format}`, buffer });
  }

  // ── Schedule — public for a non-draft show, but authing anyway costs
  //    nothing and matches what a secretary's browser actually sends. ──────
  authAs(secretary);
  out.push({
    name: 'schedule',
    buffer: await bufferFromPdfResponse(
      await scheduleGET(req(`http://localhost/api/schedule/${showId}`), params({ showId })),
      'schedule',
    ),
  });

  authAs(secretary);
  out.push({
    name: 'judges-book',
    buffer: await bufferFromPdfResponse(
      await judgesBookGET(req(`http://localhost/api/judges-book/${showId}`), params({ showId })),
      'judges-book',
    ),
  });

  authAs(secretary);
  out.push({
    name: 'prize-cards',
    buffer: await bufferFromPdfResponse(
      await prizeCardsGET(req(`http://localhost/api/prize-cards/${showId}`), params({ showId })),
      'prize-cards',
    ),
  });

  for (const format of ['multi-up', 'single'] as const) {
    authAs(secretary);
    out.push({
      name: `ring-numbers-${format}`,
      buffer: await bufferFromPdfResponse(
        await ringNumbersGET(req(`http://localhost/api/ring-numbers/${showId}?format=${format}`), params({ showId })),
        `ring-numbers-${format}`,
      ),
    });
  }

  authAs(secretary);
  out.push({
    name: 'ring-board',
    buffer: await bufferFromPdfResponse(
      await ringBoardGET(req(`http://localhost/api/ring-board/${showId}`), params({ showId })),
      'ring-board',
    ),
  });

  const reportTypes = ['catalogue-order', 'class-breakdown', 'catalogue-orders', 'sh01'] as const;
  for (const type of reportTypes) {
    authAs(secretary);
    out.push({
      name: `report-${type}`,
      buffer: await bufferFromPdfResponse(
        await reportsGET(req(`http://localhost/api/reports/${showId}/${type}`), params({ showId, type })),
        `report-${type}`,
      ),
    });
  }

  const invoiceRow = await db.query.invoices.findFirst({ where: eq(schema.invoices.showId, showId) });
  if (invoiceRow) {
    authAs(admin);
    out.push({
      name: 'invoice',
      buffer: await bufferFromPdfResponse(
        await invoiceGET(req(`http://localhost/api/admin/invoices/${invoiceRow.id}/pdf`), params({ invoiceId: invoiceRow.id })),
        'invoice',
      ),
    });
  }

  return out;
}
