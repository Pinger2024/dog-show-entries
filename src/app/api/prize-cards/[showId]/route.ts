import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCards } from '@/components/prize-cards/prize-cards';
import type { PrizeCardShowInfo, PrizeCardClass, PrizeCardStyle } from '@/components/prize-cards/prize-cards';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, validateRasterLogoUrl, makePdfResponse } from '@/lib/pdf-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;

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

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const includeJudgeName = searchParams.get('judge') !== 'false';
  const placements = Math.min(Math.max(parseInt(searchParams.get('placements') ?? '5'), 1), 6);
  const cardStyle = (searchParams.get('style') === 'outline' ? 'outline' : 'filled') as PrizeCardStyle;

  // Run independent DB queries and logo validation in parallel
  const [showClasses, judgeAssignments, safeLogoUrl] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        breed: true,
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true },
    }),
    validateRasterLogoUrl(show.organisation?.logoUrl),
  ]);

  const judgeByBreed = new Map<string | null, string>();
  for (const ja of judgeAssignments) {
    if (ja.judge?.name) judgeByBreed.set(ja.breedId, ja.judge.name);
  }

  const classes: PrizeCardClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    className: sc.classDefinition?.name ?? 'Unknown Class',
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    judgeName: judgeByBreed.get(sc.breedId) ?? judgeByBreed.get(null) ?? null,
  }));

  const showInfo: PrizeCardShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
    logoUrl: safeLogoUrl,
  };

  try {
    const pdfDocument = React.createElement(PrizeCards, {
      show: showInfo,
      classes,
      includeJudgeName,
      placements,
      cardStyle,
    });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Prize-Cards.pdf`;
    const isPreview = searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Prize card PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
