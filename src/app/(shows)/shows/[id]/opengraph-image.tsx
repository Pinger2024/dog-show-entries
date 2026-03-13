import { ImageResponse } from 'next/og';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows, entries, showSponsors } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };
export const revalidate = 900;

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [baskervilleBold, interRegular, interSemibold] = await Promise.all([
    fetch(new URL('../../../../../public/fonts/libre-baskerville-bold.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
    fetch(new URL('../../../../../public/fonts/inter-regular.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
    fetch(new URL('../../../../../public/fonts/inter-semibold.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
  ]);

  const show = await db?.query.shows.findFirst({
    where: isUuid(id) ? eq(shows.id, id) : eq(shows.slug, id),
    with: {
      organisation: true,
      venue: true,
      judgeAssignments: {
        with: { judge: true },
      },
    },
  });

  if (!show) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: '#1C1917',
            color: '#FAFAF8',
            fontFamily: 'Libre Baskerville',
            fontSize: 32,
          }}
        >
          Show not found
        </div>
      ),
      {
        ...size,
        fonts: [
          { name: 'Libre Baskerville', data: baskervilleBold, weight: 700 },
        ],
      }
    );
  }

  // Entry count + title sponsor in parallel (both only need show.id)
  const [countResult, titleSponsor] = await Promise.all([
    db
      ?.select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(
        and(
          eq(entries.showId, show.id),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        )
      ),
    db?.query.showSponsors.findFirst({
      where: and(
        eq(showSponsors.showId, show.id),
        eq(showSponsors.tier, 'title')
      ),
      with: { sponsor: true },
    }),
  ]);
  const entryCount = Number(countResult?.[0]?.count ?? 0);

  let sponsorLogoData: ArrayBuffer | null = null;
  if (titleSponsor?.sponsor.logoUrl) {
    try {
      const res = await fetch(titleSponsor.sponsor.logoUrl, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) sponsorLogoData = await res.arrayBuffer();
    } catch {
      // no logo fallback
    }
  }

  // Club logo
  let clubLogoData: ArrayBuffer | null = null;
  if (show.organisation?.logoUrl) {
    try {
      const res = await fetch(show.organisation.logoUrl, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) clubLogoData = await res.arrayBuffer();
    } catch {
      // no logo fallback
    }
  }

  const showType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const judges = [...new Set(
    show.judgeAssignments?.map((ja) => ja.judge?.name).filter(Boolean) as string[]
  )];

  // Lifecycle-aware status badge
  const closeDateMs = show.entryCloseDate ? new Date(show.entryCloseDate).getTime() : null;
  const hoursToClose = closeDateMs ? (closeDateMs - Date.now()) / 3600000 : Infinity;
  const closeDate = show.entryCloseDate
    ? new Date(show.entryCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  let badgeText = '';
  let badgeBg = '';
  let badgeColor = '#FAFAF8';

  if (show.status === 'entries_open') {
    if (hoursToClose <= 72) {
      badgeText = `Closing ${closeDate}`;
      badgeBg = '#DC2626'; // red
    } else {
      badgeText = 'Entries Open';
      badgeBg = '#059669'; // green
    }
  } else if (show.status === 'entries_closed') {
    badgeText = 'Entries Closed';
    badgeBg = '#57534E'; // grey
  } else if (show.status === 'in_progress') {
    badgeText = 'Live Today';
    badgeBg = '#059669'; // emerald
  } else if (show.status === 'completed') {
    badgeText = 'Results Published';
    badgeBg = '#059669';
  } else if (show.status === 'published') {
    badgeText = 'Coming Soon';
    badgeBg = '#2563EB'; // blue
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: '#1C1917',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle gradient overlay */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse at 60% 40%, rgba(180,130,80,0.08) 0%, transparent 70%)',
          }}
        />

        {/* Top gold line */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #92702A, #C9A84C, #92702A)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '44px 56px',
            justifyContent: 'center',
          }}
        >
          {/* Top row: club logo + sponsor */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {clubLogoData ? (
                <img
                  src={`data:image/png;base64,${Buffer.from(clubLogoData).toString('base64')}`}
                  width={48}
                  height={48}
                  style={{ borderRadius: 6, objectFit: 'contain' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    backgroundColor: '#292524',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      width: 8,
                      height: 8,
                      backgroundColor: '#C9A84C',
                      transform: 'rotate(45deg)',
                    }}
                  />
                </div>
              )}
              {show.organisation && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 16,
                    color: '#A8A29E',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {show.organisation.name}
                </div>
              )}
            </div>

            {sponsorLogoData && titleSponsor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 11,
                    color: '#78716C',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Sponsored by
                </div>
                <img
                  src={`data:image/png;base64,${Buffer.from(sponsorLogoData).toString('base64')}`}
                  width={80}
                  height={36}
                  style={{ objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          {/* Show type badge */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Inter',
              fontWeight: 600,
              fontSize: 13,
              color: '#C9A84C',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 8,
            }}
          >
            {showType}
          </div>

          {/* Show name */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Libre Baskerville',
              fontWeight: 700,
              fontSize: show.name.length > 40 ? 34 : show.name.length > 28 ? 40 : 46,
              color: '#FAFAF8',
              lineHeight: 1.15,
              letterSpacing: '0.01em',
            }}
          >
            {show.name}
          </div>

          {/* Date + Venue */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 14,
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: 17,
              color: '#A8A29E',
            }}
          >
            <span style={{ display: 'flex' }}>{showDate}</span>
            {show.venue && (
              <span style={{ display: 'flex' }}>
                {show.venue.name}
              </span>
            )}
          </div>

          {/* Ornamental divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              marginTop: 22,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 1,
                backgroundColor: 'rgba(201, 168, 76, 0.25)',
              }}
            />
            <div
              style={{
                display: 'flex',
                width: 8,
                height: 8,
                backgroundColor: '#C9A84C',
                transform: 'rotate(45deg)',
              }}
            />
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 1,
                backgroundColor: 'rgba(201, 168, 76, 0.25)',
              }}
            />
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              alignItems: 'center',
            }}
          >
            {judges.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: 16,
                  color: '#78716C',
                }}
              >
                Judge{judges.length > 1 ? 's' : ''}: {judges.slice(0, 3).join(', ')}
              </div>
            )}
            {entryCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: 16,
                  color: '#C9A84C',
                }}
              >
                {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
              </div>
            )}
            {badgeText && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: 12,
                  color: badgeColor,
                  backgroundColor: badgeBg,
                  padding: '5px 12px',
                  borderRadius: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {badgeText}
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 52,
            borderTop: '1px solid rgba(201, 168, 76, 0.15)',
            padding: '0 56px',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(28, 25, 23, 0.95)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                width: 6,
                height: 6,
                backgroundColor: '#C9A84C',
                transform: 'rotate(45deg)',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontFamily: 'Libre Baskerville',
                fontWeight: 700,
                fontSize: 16,
                color: '#C9A84C',
                letterSpacing: '0.08em',
              }}
            >
              REMI
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: 13,
              color: '#78716C',
              letterSpacing: '0.04em',
            }}
          >
            remishowmanager.co.uk
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Libre Baskerville', data: baskervilleBold, weight: 700 },
        { name: 'Inter', data: interRegular, weight: 400 },
        { name: 'Inter', data: interSemibold, weight: 600 },
      ],
    }
  );
}
