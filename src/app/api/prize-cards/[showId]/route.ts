import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCards } from '@/components/prize-cards/prize-cards';
import type { PrizeCardShowInfo, PrizeCardClass, PrizeCardStyle } from '@/components/prize-cards/prize-cards';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;
  const user = await getCurrentUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  // Verify user belongs to this show's organisation
  // Admins bypass membership check (needed for impersonation)
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  if (!isAdmin) {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.organisationId, show.organisationId),
        eq(schema.memberships.status, 'active')
      ),
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const includeJudgeName = searchParams.get('judge') !== 'false';
  const placements = Math.min(Math.max(parseInt(searchParams.get('placements') ?? '5'), 1), 5);
  const cardStyle = (searchParams.get('style') === 'outline' ? 'outline' : 'filled') as PrizeCardStyle;

  // Fetch show classes
  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: {
      classDefinition: true,
      breed: true,
    },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  // Fetch judge assignments
  const judgeAssignments = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true },
  });

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

  // Pre-validate logo URL — @react-pdf/renderer only supports raster images (PNG/JPEG), not SVG
  let safeLogoUrl: string | null = null;
  const rawLogoUrl = show.organisation?.logoUrl;
  if (rawLogoUrl) {
    try {
      const logoRes = await fetch(rawLogoUrl, { signal: AbortSignal.timeout(5000) });
      const ct = logoRes.headers.get('content-type') ?? '';
      const isRaster = logoRes.ok && ct.startsWith('image/') && !ct.includes('svg');
      if (isRaster) safeLogoUrl = rawLogoUrl;
    } catch {
      console.warn('Logo fetch failed, omitting from prize cards:', rawLogoUrl);
    }
  }

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

    const disposition = request.nextUrl.searchParams.has('preview') ? 'inline' : 'attachment';
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Prize card PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
