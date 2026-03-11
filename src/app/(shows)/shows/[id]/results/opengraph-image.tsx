import { ImageResponse } from 'next/og';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows, showClasses } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';
import { format } from 'date-fns';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };
export const revalidate = 3600;

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
    fetch(new URL('../../../../../../public/fonts/libre-baskerville-bold.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
    fetch(new URL('../../../../../../public/fonts/inter-regular.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
    fetch(new URL('../../../../../../public/fonts/inter-semibold.ttf', import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
  ]);

  const show = await db?.query.shows.findFirst({
    where: isUuid(id) ? eq(shows.id, id) : eq(shows.slug, id),
    with: {
      venue: true,
      organisation: true,
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

  // Count judged classes and entries
  const classes = await db?.query.showClasses.findMany({
    where: eq(showClasses.showId, id),
    with: {
      entryClasses: {
        with: {
          entry: { columns: { status: true, deletedAt: true } },
          result: true,
        },
      },
    },
  });

  let judgedCount = 0;
  let totalEntries = 0;

  for (const cls of classes ?? []) {
    const confirmed = cls.entryClasses.filter(
      (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
    );
    totalEntries += confirmed.length;
    if (confirmed.some((ec) => ec.result)) judgedCount++;
  }

  const showDate = format(new Date(show.startDate), 'EEEE d MMMM yyyy');
  const showType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const venueName = show.venue?.name ?? '';
  const orgName = show.organisation?.name ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#1C1917',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top gold accent line */}
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

        {/* Subtle background radial */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse at 70% 30%, rgba(180,130,80,0.05) 0%, transparent 60%)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 56px 24px',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          {/* Trophy + show type */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(201, 168, 76, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C9A84C"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 16,
                color: '#C9A84C',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {showType} Results
            </div>
          </div>

          {/* Show name */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Libre Baskerville',
              fontWeight: 700,
              fontSize: show.name.length > 40 ? 32 : 40,
              color: '#FAFAF8',
              lineHeight: 1.15,
              letterSpacing: '0.01em',
            }}
          >
            {show.name}
          </div>

          {/* Date and venue */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: 18,
                color: '#A8A29E',
              }}
            >
              {showDate}
            </div>
            {venueName && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: 16,
                  color: '#78716C',
                }}
              >
                {venueName}
                {orgName ? `  ·  ${orgName}` : ''}
              </div>
            )}
          </div>

          {/* Stats divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 1,
                backgroundColor: 'rgba(201, 168, 76, 0.2)',
              }}
            />
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
                flex: 1,
                height: 1,
                backgroundColor: 'rgba(201, 168, 76, 0.2)',
              }}
            />
          </div>

          {/* Bottom stats */}
          <div
            style={{
              display: 'flex',
              gap: 32,
              fontFamily: 'Inter',
              fontSize: 16,
            }}
          >
            {judgedCount > 0 && (
              <div style={{ display: 'flex', color: '#A8A29E' }}>
                <span style={{ color: '#FAFAF8', fontWeight: 600, marginRight: 6 }}>
                  {judgedCount}
                </span>
                classes judged
              </div>
            )}
            {totalEntries > 0 && (
              <div style={{ display: 'flex', color: '#A8A29E' }}>
                <span style={{ color: '#FAFAF8', fontWeight: 600, marginRight: 6 }}>
                  {totalEntries}
                </span>
                entries
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
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
