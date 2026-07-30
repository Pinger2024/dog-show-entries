import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc, and, ilike, inArray } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React from 'react';
import { format, parseISO } from 'date-fns';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildClassLabelMap } from '@/lib/class-labels';
import { CATALOGUE_NAME_PATTERN } from '@/lib/catalogue-utils';
import {
  CatalogueOrderReport,
  ClassBreakdownReport,
  PrebookedCataloguesReport,
  type ShowReportInfo,
  type CatalogueOrderRow,
  type ClassBreakdownRow,
  type PrebookedCatalogueRow,
} from '@/components/reports/show-report-pdf';
import { SvResultsReport, type SvResultsReportInfo } from '@/components/reports/sv-results-pdf';
import { loadSvResultsData } from '@/server/services/sv-results-data';
import { buildSvResultsReport, buildSvResultsXlsxRows } from '@/lib/sv-results';
import { buildSvResultsXlsx } from '@/lib/sv-results-xlsx';

const PDF_TYPES = ['catalogue-order', 'class-breakdown', 'catalogue-orders'] as const;
const SV_TYPES = ['sv-results', 'sv-results-xlsx'] as const;
const TYPES = [...PDF_TYPES, ...SV_TYPES] as const;
type ReportType = (typeof TYPES)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; type: string }> },
) {
  const { showId, type } = await params;
  if (!TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: `Unknown report. Use one of: ${TYPES.join(', ')}.` }, { status: 400 });
  }
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  await ensureCatalogueNumbers(db, showId);

  // ── SV / WUSV graded results report + spreadsheet (regional shows only) ──
  if (type === 'sv-results' || type === 'sv-results-xlsx') {
    if (show.showRuleset !== 'wusv') {
      return NextResponse.json(
        { error: 'SV results are only available for regional (WUSV) shows.' },
        { status: 400 },
      );
    }
    const load = await loadSvResultsData(db, showId);
    if (!load) {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    const isPreview = request.nextUrl.searchParams.has('preview');

    try {
      if (type === 'sv-results-xlsx') {
        const xlsxRows = buildSvResultsXlsxRows(load.reportInput, {
          venue: load.show.venueName ?? load.show.organisationName ?? '',
          date: safeXlsxDate(load.show.startDate),
        });
        const buffer = await buildSvResultsXlsx(xlsxRows, { showName: load.show.name });
        const filename = `${sanitizeFilename(show.name)}-SV-Results.xlsx`;
        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `${isPreview ? 'inline' : 'attachment'}; filename="${filename}"`,
            'Cache-Control': 'no-cache',
          },
        });
      }

      const data = buildSvResultsReport(load.reportInput);
      const svInfo: SvResultsReportInfo = {
        orgName: load.show.organisationName,
        showName: load.show.name,
        showDate: safeDate(load.show.startDate),
        generatedAt: format(new Date(), 'd MMMM yyyy'),
      };
      const svElement = React.createElement(SvResultsReport, { info: svInfo, data });
      const buffer = await renderToBuffer(svElement as React.ReactElement<DocumentProps>);
      const filename = `${sanitizeFilename(show.name)}-SV-Results.pdf`;
      return makePdfResponse(buffer, filename, isPreview);
    } catch (err) {
      console.error('SV results report generation failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'SV results generation failed', detail: message }, { status: 500 });
    }
  }

  const [showClasses, entries] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true, breed: true },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.entries.findMany({
      where: eq(schema.entries.showId, showId),
      with: {
        dog: { with: { breed: true, owners: true } },
        exhibitor: true,
        entryClasses: { with: { showClass: true } },
      },
    }),
  ]);

  const classLabelMap = buildClassLabelMap(showClasses);
  const confirmed = entries.filter((e) => e.status === 'confirmed' && !e.deletedAt);

  const info: ShowReportInfo = {
    showName: show.name,
    organisation: show.organisation?.name ?? null,
    showDate: safeDate(show.startDate),
    generatedAt: format(new Date(), 'd MMMM yyyy'),
  };

  let element: React.ReactElement;
  let filenameSuffix: string;

  if (type === 'catalogue-orders') {
    // Pre-booked catalogues: who has actually ordered/paid for a catalogue
    // (printed or online), so the club knows how many to print + who to email.
    const catalogueItems = await db
      .select({ id: schema.sundryItems.id, name: schema.sundryItems.name })
      .from(schema.sundryItems)
      .where(and(eq(schema.sundryItems.showId, showId), ilike(schema.sundryItems.name, CATALOGUE_NAME_PATTERN)));
    const rows: PrebookedCatalogueRow[] = [];
    if (catalogueItems.length > 0) {
      const ids = catalogueItems.map((i) => i.id);
      const cats = await db
        .select({
          itemName: schema.sundryItems.name,
          quantity: schema.orderSundryItems.quantity,
          exhibitorName: schema.users.name,
        })
        .from(schema.orderSundryItems)
        .innerJoin(schema.sundryItems, eq(schema.orderSundryItems.sundryItemId, schema.sundryItems.id))
        .innerJoin(schema.orders, eq(schema.orderSundryItems.orderId, schema.orders.id))
        .innerJoin(schema.users, eq(schema.orders.exhibitorId, schema.users.id))
        .where(and(inArray(schema.orderSundryItems.sundryItemId, ids), eq(schema.orders.status, 'paid')));
      for (const o of cats) {
        rows.push({
          name: o.exhibitorName ?? '—',
          type: o.itemName.toLowerCase().includes('print') ? 'Printed' : 'Online',
          quantity: o.quantity,
        });
      }
    }
    element = React.createElement(PrebookedCataloguesReport, { info, rows });
    filenameSuffix = 'Pre-booked-Catalogues';
  } else if (type === 'catalogue-order') {
    const showBreed = show.showScope !== 'single_breed';
    const rows: CatalogueOrderRow[] = confirmed
      .slice()
      .sort((a, b) => parseInt(a.catalogueNumber ?? '0') - parseInt(b.catalogueNumber ?? '0'))
      .map((e) => {
        const owner =
          e.dog?.owners?.map((o) => o.ownerName).filter(Boolean).join(' & ') ||
          e.exhibitor?.name ||
          '';
        const classes = e.entryClasses
          .map((ec) => (ec.showClass ? classLabelMap.get(ec.showClass.id) : null))
          .filter(Boolean)
          .join(', ');
        return {
          catalogueNumber: e.catalogueNumber ?? '—',
          name: e.dog?.registeredName ?? 'Junior Handler',
          breed: e.dog?.breed?.name ?? null,
          sex: e.dog?.sex ?? null,
          owner,
          classes,
        };
      });
    element = React.createElement(CatalogueOrderReport, { info, rows, showBreed });
    filenameSuffix = 'Exhibitor-List';
  } else {
    // class-breakdown: one row per class, in schedule order, with its count.
    const counts = new Map<string, number>();
    for (const e of confirmed) {
      for (const ec of e.entryClasses) {
        if (ec.showClass) counts.set(ec.showClass.id, (counts.get(ec.showClass.id) ?? 0) + 1);
      }
    }
    // Order by class number (Junior Handlers last) so the breakdown reads in
    // the same sequence as the catalogue, not the day's running order.
    const orderedClasses = [...showClasses].sort((a, b) => {
      const aJh = a.classDefinition?.type === 'junior_handler';
      const bJh = b.classDefinition?.type === 'junior_handler';
      if (aJh !== bJh) return aJh ? 1 : -1;
      const an = a.classNumber ?? 9999;
      const bn = b.classNumber ?? 9999;
      if (an !== bn) return an - bn;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    const rows: ClassBreakdownRow[] = orderedClasses.map((sc) => ({
      label: classLabelMap.get(sc.id) ?? (sc.classNumber != null ? String(sc.classNumber) : ''),
      name: sc.classDefinition?.name ?? 'Class',
      sex: sc.sex,
      count: counts.get(sc.id) ?? 0,
    }));
    element = React.createElement(ClassBreakdownReport, { info, rows });
    filenameSuffix = 'Class-Breakdown';
  }

  try {
    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    const filename = `${sanitizeFilename(show.name)}-${filenameSuffix}.pdf`;
    return makePdfResponse(buffer, filename, request.nextUrl.searchParams.has('preview'));
  } catch (err) {
    console.error('Report PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'PDF generation failed', detail: message }, { status: 500 });
  }
}

function safeDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEEE d MMMM yyyy');
  } catch {
    return iso;
  }
}

function safeXlsxDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}
