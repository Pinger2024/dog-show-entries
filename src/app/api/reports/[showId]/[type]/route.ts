import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React from 'react';
import { format, parseISO } from 'date-fns';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildClassLabelMap } from '@/lib/class-labels';
import {
  CatalogueOrderReport,
  ClassBreakdownReport,
  type ShowReportInfo,
  type CatalogueOrderRow,
  type ClassBreakdownRow,
} from '@/components/reports/show-report-pdf';

const TYPES = ['catalogue-order', 'class-breakdown'] as const;
type ReportType = (typeof TYPES)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; type: string }> },
) {
  const { showId, type } = await params;
  if (!TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: 'Unknown report. Use catalogue-order or class-breakdown.' }, { status: 400 });
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

  if (type === 'catalogue-order') {
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
    filenameSuffix = 'Catalogue-Order';
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
