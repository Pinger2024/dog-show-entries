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

/** GOLDEN_TRACE=1 prints the document about to be rendered, so a react-pdf warning on
 *  stderr can be attributed to a document (warnings carry no context of their own). */
const trace = (name: string) => {
  if (process.env.GOLDEN_TRACE === '1') console.log(`[golden] rendering ${name}`);
};
import type { ShowFixture } from '../../../../scripts/lib/export-show-fixture-core';

export interface RenderedDocument {
  /** Stable, human-readable name — becomes the baseline file's basename and
   *  appears in every failure message (e.g. "catalogue-standard"). */
  name: string;
  buffer: Buffer;
}

/** True when the fixture has at least one confirmed, non-deleted entry —
 *  computed straight from the fixture JSON (not a DB query) so
 *  documents.golden.test.ts's expectedDocumentNames() (collection-time,
 *  no DB access) and renderAllDocuments() (render-time) can never disagree
 *  about which show this is. */
export function hasConfirmedEntries(fixture: ShowFixture): boolean {
  return fixture.tables.entries.some((e) => {
    const row = e as { status?: string; deletedAt?: unknown };
    return row.status === 'confirmed' && row.deletedAt == null;
  });
}

/**
 * Report types that are either genuinely broken (ring-numbers: pdf-
 * generation.ts's generateRingNumbersPdf throws "No catalogue numbers
 * found" with zero confirmed entries — a real 500 that took down the whole
 * winter-spectacular fixture run, 2026-09-02) or simply meaningless with no
 * entries to report on (an Exhibitor List, a Pre-booked Catalogues list, an
 * RKC SH01 compliance count, or a per-dog grading card, all with nothing to
 * list). `class-breakdown` is deliberately NOT in this set — it lists the
 * show's CLASSES, which exist independent of entries, so "0 entries per
 * class" is still real, useful, comparable content.
 */
const ENTRY_DEPENDENT_REPORT_TYPES = new Set(['sh01', 'catalogue-order', 'catalogue-orders', 'grading-cards']);

/**
 * RKC-style report types (Exhibitor List, Class Breakdown, Pre-booked
 * Catalogues, RKC SH01). Verified — not assumed — to return 200 regardless
 * of showRuleset: probed every report type against a synthetic WUSV fixture
 * (2026-09-01) and none of these four were rejected; grepping
 * src/app/api/reports/[showId]/[type]/route.ts confirms it only checks
 * `showRuleset !== 'wusv'` for the two SV-only types below. So this list
 * applies to every show, RKC or WUSV.
 */
const GENERAL_REPORT_TYPES = ['catalogue-order', 'class-breakdown', 'catalogue-orders', 'sh01'] as const;

/**
 * SV/WUSV-only PDF reports. The reports route explicitly 400s both of
 * these for a non-'wusv' show (two `show.showRuleset !== 'wusv'` checks in
 * src/app/api/reports/[showId]/[type]/route.ts) — additive for WUSV shows
 * only, never a substitute for GENERAL_REPORT_TYPES above.
 *
 * `sv-results-xlsx` is deliberately excluded: it's an .xlsx, not a PDF, and
 * this golden test's page-geometry comparison (pdf-inspect.ts) only
 * understands PDFs — widening it to compare spreadsheet content is a
 * separate effort, out of scope here.
 */
const WUSV_REPORT_TYPES = ['sv-results', 'grading-cards'] as const;

/**
 * The full set of report `type` values to render for a show of the given
 * ruleset — the single source of truth documents.golden.test.ts's
 * expectedDocumentNames() and renderAllDocuments() below both call, so the
 * two can never drift apart on which reports a ruleset gets.
 */
export function reportTypesForRuleset(showRuleset: string | null | undefined): readonly string[] {
  return showRuleset === 'wusv' ? [...GENERAL_REPORT_TYPES, ...WUSV_REPORT_TYPES] : GENERAL_REPORT_TYPES;
}

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

function authAs(user: SessionUser, docName?: string) {
  if (docName) trace(docName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(auth).mockResolvedValue({ user: user as any } as any);
}

// Generic (not `Record<string, string>`) so each call site's literal shape
// — `{ showId }`, `{ showId, type }`, `{ invoiceId }` — flows through to
// match the specific `params: Promise<{...}>` type each route handler
// declares, rather than widening to a shape none of them accept.
const params = <T extends Record<string, string>>(record: T): { params: Promise<T> } => ({
  params: Promise.resolve(record),
});
const req = (url: string) => { trace(url.replace('http://localhost/api/', '')); return new NextRequest(url); };

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
async function ensureOperators(
  showId: string,
): Promise<{ secretary: SessionUser; admin: SessionUser; showRuleset: string | null }> {
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
    showRuleset: show.showRuleset ?? null,
  };
}

/**
 * The complete, ordered list of document names renderAllDocuments() will
 * attempt for this fixture — the single source of truth
 * documents.golden.test.ts's expectedDocumentNames() calls directly, so the
 * two can never drift on which documents a given fixture gets (including
 * the zero-confirmed-entries skips below).
 */
export function documentNamesForFixture(fixture: ShowFixture): string[] {
  const entriesConfirmed = hasConfirmedEntries(fixture);
  const showRow = fixture.tables.shows[0] as { showRuleset?: string | null } | undefined;
  const reportNames = reportTypesForRuleset(showRow?.showRuleset ?? null)
    .filter((t) => entriesConfirmed || !ENTRY_DEPENDENT_REPORT_TYPES.has(t))
    .map((t) => `report-${t}`);

  const names = [...CATALOGUE_FORMATS.map((f) => `catalogue-${f}`), 'schedule', 'judges-book'];
  if (entriesConfirmed) {
    names.push('prize-cards', 'ring-numbers-multi-up', 'ring-numbers-single', 'ring-board');
  }
  names.push(...reportNames);
  if (fixture.tables.invoices.length > 0) names.push('invoice');
  return names;
}

export async function renderAllDocuments(showId: string, fixture: ShowFixture): Promise<RenderedDocument[]> {
  const { secretary, admin, showRuleset } = await ensureOperators(showId);
  const out: RenderedDocument[] = [];
  const entriesConfirmed = hasConfirmedEntries(fixture);

  // ── Catalogue — the DB-free seam, every format the ruleset supports ──────
  const snapshot = await buildCatalogueSnapshot(db, showId);
  for (const format of CATALOGUE_FORMATS) {
    trace(`catalogue-${format}`);
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

  // ── Entry-dependent documents — skipped entirely on a zero-confirmed-
  //    entries show (a draft show that's published a schedule but hasn't
  //    opened entries yet, say). See ENTRY_DEPENDENT_REPORT_TYPES's doc
  //    comment for ring-numbers' real 500 and why prize-cards/ring-board
  //    are skipped alongside it rather than trusted to degrade gracefully
  //    on every real show shaped like this. ──────────────────────────────
  if (entriesConfirmed) {
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
  } else {
    console.log(
      `[golden] skipping prize-cards/ring-numbers/ring-board for show ${showId} — no confirmed entries ` +
        `(explicit skip, not a failure — see ENTRY_DEPENDENT_REPORT_TYPES's doc comment in render-documents.ts)`,
    );
  }

  const reportTypes = reportTypesForRuleset(showRuleset).filter(
    (t) => entriesConfirmed || !ENTRY_DEPENDENT_REPORT_TYPES.has(t),
  );
  const skippedReportTypes = reportTypesForRuleset(showRuleset).filter((t) => !reportTypes.includes(t));
  if (skippedReportTypes.length > 0) {
    console.log(
      `[golden] skipping report(s) ${skippedReportTypes.map((t) => `"${t}"`).join(', ')} for show ${showId} — ` +
        `no confirmed entries (explicit skip, not a failure)`,
    );
  }
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
