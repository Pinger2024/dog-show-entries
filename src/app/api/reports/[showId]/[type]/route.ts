import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React from 'react';
import { format, parseISO } from 'date-fns';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildClassLabelMap } from '@/lib/class-labels';
import {
  CatalogueOrderReport,
  ClassBreakdownReport,
  PrebookedCataloguesReport,
  type ShowReportInfo,
  type ClassBreakdownRow,
} from '@/components/reports/show-report-pdf';
import { Sh01AbsenteeReport } from '@/components/reports/sh01-absentee-report';
import { computeSh01Stats, type Sh01EntryInput, type Sh01ClassInput } from '@/lib/sh01-absentee';
import { SvResultsReport, type SvResultsReportInfo } from '@/components/reports/sv-results-pdf';
import { loadSvResultsData } from '@/server/services/sv-results-data';
import { buildSvResultsReport, buildSvResultsXlsxRows } from '@/lib/sv-results';
import { buildSvResultsXlsx } from '@/lib/sv-results-xlsx';
import { GradingCardsReport } from '@/components/reports/grading-cards-pdf';
import { loadGradingCardsData } from '@/server/services/grading-cards-data';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import {
  loadAbsenteeLikeEntries,
  loadEntryReportEntries,
  loadCatalogueOrdersSplit,
  loadPrebookedCatalogueRows,
  paidConfirmedAbsentNonJhWhere,
  confirmedAbsentNonJhWhere,
  withdrawnOrAbsentPaidWhere,
} from '@/server/services/report-queries';
import { buildCatalogueOrderRows, buildClassBreakdownRows, buildAbsenteeRow, buildFinancialStatementRow } from '@/lib/report-rows';
import {
  buildExhibitorListXlsx,
  buildPrebookedCataloguesXlsx,
  buildClassBreakdownXlsx,
  buildAbsenteeXlsx,
  buildSh01Xlsx,
  buildFinancialStatementXlsx,
} from '@/lib/reports-xlsx';

const PDF_TYPES = ['catalogue-order', 'class-breakdown', 'catalogue-orders', 'sh01'] as const;
const SV_TYPES = ['sv-results', 'sv-results-xlsx', 'grading-cards'] as const;
// Excel twins of the PDF/CSV reports above — Mandy's original ask: "the
// option to generate on excel or pdf". Each one reuses the exact row-
// builder or DB query its PDF/CSV sibling uses (see report-rows.ts and
// report-queries.ts) so the two outputs can never disagree.
const XLSX_TYPES = [
  'catalogue-order-xlsx',
  'catalogue-orders-xlsx',
  'class-breakdown-xlsx',
  'sh01-xlsx',
  'absentee-catalogue-xlsx',
  'absentee-report-xlsx',
  'withdrawn-absent-xlsx',
  'financial-statement-xlsx',
] as const;
const TYPES = [...PDF_TYPES, ...SV_TYPES, ...XLSX_TYPES] as const;
type ReportType = (typeof TYPES)[number];

function xlsxResponse(buffer: Buffer, filename: string, isPreview: boolean) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `${isPreview ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; type: string }> },
) {
  const { showId, type } = await params;
  if (!TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: 'Unknown report. Use catalogue-order, class-breakdown or catalogue-orders.' }, { status: 400 });
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

  const isPreview = request.nextUrl.searchParams.has('preview');
  await syncCatalogueNumbers(db, showId, { allowResort: false });

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

    try {
      if (type === 'sv-results-xlsx') {
        const xlsxRows = buildSvResultsXlsxRows(load.reportInput, {
          venue: load.show.venueName ?? load.show.organisationName ?? '',
          date: safeXlsxDate(load.show.startDate),
        });
        const buffer = await buildSvResultsXlsx(xlsxRows, { showName: load.show.name });
        return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-SV-Results.xlsx`, isPreview);
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

  // ── SV / WUSV Grading Cards — one A5-landscape double-sided card per
  // entered dog, for the regional group's judge to grade and hand back
  // (secretary-approved design, regional/WUSV shows only). ──
  if (type === 'grading-cards') {
    if (show.showRuleset !== 'wusv') {
      return NextResponse.json(
        { error: 'Grading cards are only available for regional (WUSV) shows.' },
        { status: 400 },
      );
    }
    const load = await loadGradingCardsData(db, showId);
    if (!load) {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    try {
      const element = React.createElement(GradingCardsReport, { info: load.info, entries: load.entries });
      return await renderPdf(element, `${sanitizeFilename(show.name)}-Grading-Cards.pdf`, isPreview);
    } catch (err) {
      console.error('Grading cards generation failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Grading cards generation failed', detail: message }, { status: 500 });
    }
  }

  // ── Absentee-shaped reports (three separate questions, three separate
  // WHERE clauses — see report-queries.ts). Handled before the shared
  // showClasses/entries fetch below since they run their own lean query. ──
  if (type === 'absentee-catalogue-xlsx' || type === 'absentee-report-xlsx' || type === 'withdrawn-absent-xlsx') {
    try {
      const paidOrderIds =
        type === 'absentee-report-xlsx' ? null : await getPaidOrderIdsForShow(db, showId);
      const where =
        type === 'absentee-catalogue-xlsx'
          ? paidConfirmedAbsentNonJhWhere(showId, paidOrderIds ?? [])
          : type === 'withdrawn-absent-xlsx'
            ? withdrawnOrAbsentPaidWhere(showId, paidOrderIds ?? [])
            : confirmedAbsentNonJhWhere(showId);
      const entries = await loadAbsenteeLikeEntries(db, where);
      const rows = entries.map(buildAbsenteeRow);
      const meta =
        type === 'absentee-catalogue-xlsx'
          ? { sheetName: 'Absentees (Catalogue)', tableName: 'AbsenteesCatalogue', includeStatus: false, suffix: 'Absentees' }
          : type === 'withdrawn-absent-xlsx'
            ? { sheetName: 'Withdrawn & Absent', tableName: 'WithdrawnAndAbsent', includeStatus: true, suffix: 'Withdrawn-And-Absent' }
            : { sheetName: 'Absentee Report', tableName: 'AbsenteeReport', includeStatus: true, suffix: 'Absentee-Report' };
      const buffer = await buildAbsenteeXlsx(rows, meta);
      return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-${meta.suffix}.xlsx`, isPreview);
    } catch (err) {
      console.error('Absentee xlsx generation failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Report generation failed', detail: message }, { status: 500 });
    }
  }

  // ── Financial Statement (xlsx) — mirrors exportFinancialStatementCsv on
  // the Documents page exactly (same entry set, same catalogue-buyer check). ──
  if (type === 'financial-statement-xlsx') {
    try {
      const paidOrderIds = await getPaidOrderIdsForShow(db, showId);
      const [entryReportEntries, catalogueOrders] = await Promise.all([
        loadEntryReportEntries(db, showId, paidOrderIds),
        loadCatalogueOrdersSplit(db, showId),
      ]);
      const catalogueBuyerEmails = new Set<string>([
        ...catalogueOrders.printed.map((o) => o.email.toLowerCase()),
        ...catalogueOrders.online.map((o) => o.email.toLowerCase()),
      ]);
      const rows = entryReportEntries.map((e) => buildFinancialStatementRow(e, catalogueBuyerEmails));
      const buffer = await buildFinancialStatementXlsx(rows);
      return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-Financial-Statement.xlsx`, isPreview);
    } catch (err) {
      console.error('Financial statement xlsx generation failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Report generation failed', detail: message }, { status: 500 });
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

  const classLabelMap = buildClassLabelMap(showClasses, show.showRuleset);
  const confirmed = entries.filter((e) => e.status === 'confirmed' && !e.deletedAt);

  const info: ShowReportInfo = {
    showName: show.name,
    organisation: show.organisation?.name ?? null,
    showDate: safeDate(show.startDate),
    generatedAt: format(new Date(), 'd MMMM yyyy'),
  };

  // Order classes by class number (Junior Handlers last) — shared by the
  // class-breakdown PDF and its xlsx twin.
  const orderedClasses = [...showClasses].sort((a, b) => {
    const aJh = a.classDefinition?.type === 'junior_handler';
    const bJh = b.classDefinition?.type === 'junior_handler';
    if (aJh !== bJh) return aJh ? 1 : -1;
    const an = a.classNumber ?? 9999;
    const bn = b.classNumber ?? 9999;
    if (an !== bn) return an - bn;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  const classEntryCounts = new Map<string, number>();
  for (const e of confirmed) {
    for (const ec of e.entryClasses) {
      if (ec.showClass) classEntryCounts.set(ec.showClass.id, (classEntryCounts.get(ec.showClass.id) ?? 0) + 1);
    }
  }

  try {
    if (type === 'catalogue-order' || type === 'catalogue-order-xlsx') {
      const showBreed = show.showScope !== 'single_breed';
      const rows = buildCatalogueOrderRows(confirmed, classLabelMap);
      if (type === 'catalogue-order-xlsx') {
        const buffer = await buildExhibitorListXlsx(rows, showBreed);
        return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-Exhibitor-List.xlsx`, isPreview);
      }
      const element = React.createElement(CatalogueOrderReport, { info, rows, showBreed });
      return await renderPdf(element, `${sanitizeFilename(show.name)}-Exhibitor-List.pdf`, isPreview);
    }

    if (type === 'catalogue-orders' || type === 'catalogue-orders-xlsx') {
      // Pre-booked catalogues: who has actually ordered/paid for a catalogue
      // (printed or online), so the club knows how many to print + who to email.
      const rows = await loadPrebookedCatalogueRows(db, showId);
      if (type === 'catalogue-orders-xlsx') {
        const buffer = await buildPrebookedCataloguesXlsx(rows);
        return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-Pre-booked-Catalogues.xlsx`, isPreview);
      }
      const element = React.createElement(PrebookedCataloguesReport, { info, rows });
      return await renderPdf(element, `${sanitizeFilename(show.name)}-Pre-booked-Catalogues.pdf`, isPreview);
    }

    if (type === 'class-breakdown' || type === 'class-breakdown-xlsx') {
      const rows: ClassBreakdownRow[] = buildClassBreakdownRows(orderedClasses, classEntryCounts, classLabelMap);
      if (type === 'class-breakdown-xlsx') {
        const buffer = await buildClassBreakdownXlsx(rows, confirmed.length);
        return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-Class-Breakdown.xlsx`, isPreview);
      }
      const element = React.createElement(ClassBreakdownReport, { info, rows, dogCount: confirmed.length });
      return await renderPdf(element, `${sanitizeFilename(show.name)}-Class-Breakdown.pdf`, isPreview);
    }

    if (type === 'sh01' || type === 'sh01-xlsx') {
      // RKC SH01 Championship Absentee Report — per-breed dog/bitch/absentee
      // statistics feeding the KC's CC allocation (Mandy 2026-07-07).
      const nonDeleted = entries.filter((e) => !e.deletedAt) as unknown as Sh01EntryInput[];
      const { breeds } = computeSh01Stats(nonDeleted, showClasses as unknown as Sh01ClassInput[]);
      if (type === 'sh01-xlsx') {
        const buffer = await buildSh01Xlsx(breeds);
        return xlsxResponse(buffer, `${sanitizeFilename(show.name)}-KC-Absentee-Report-SH01.xlsx`, isPreview);
      }
      const element = React.createElement(Sh01AbsenteeReport, {
        info: {
          society: show.organisation?.name ?? show.name,
          showDate: format(parseISO(show.startDate), 'dd/MM/yyyy'),
          secretaryName: show.secretaryName ?? '',
        },
        breeds,
      });
      return await renderPdf(element, `${sanitizeFilename(show.name)}-KC-Absentee-Report-SH01.pdf`, isPreview);
    }

    // Unreachable — TYPES is validated above.
    return NextResponse.json({ error: 'Unhandled report type' }, { status: 400 });
  } catch (err) {
    console.error('Report generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Report generation failed', detail: message }, { status: 500 });
  }
}

async function renderPdf(element: React.ReactElement, filename: string, isPreview: boolean) {
  const rawBuffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
  // Strip react-pdf's unembedded base-14 phantom font refs (Helvetica etc.)
  // — inserted into every document's Resources regardless of what's
  // actually drawn — so these reports pass the same print-preflight bar
  // as the catalogue.
  const buffer = Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
  return makePdfResponse(buffer, filename, isPreview);
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
