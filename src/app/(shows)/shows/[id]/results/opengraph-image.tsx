import { ImageResponse } from 'next/og';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows, showClasses } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';
import { format } from 'date-fns';
import { loadShareImageFonts, SHARE_GREEN as G } from '@/lib/share-image-data';

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

const BG_GRADIENT = `linear-gradient(172deg, ${G.deep}, ${G.deepest})`;
const HEAD = { fontFamily: 'Hanken Grotesk', fontWeight: 800, letterSpacing: '-0.015em' } as const;

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const fonts = loadShareImageFonts();

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
            background: BG_GRADIENT,
            color: G.cream,
            ...HEAD,
            fontSize: 32,
          }}
        >
          Show not found
        </div>
      ),
      {
        ...size,
        fonts: fonts.filter((f) => f.weight === 800),
      }
    );
  }

  // Count judged classes and entries
  const classes = await db?.query.showClasses.findMany({
    where: eq(showClasses.showId, show.id),
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
          background: BG_GRADIENT,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Fresh-green radial glow */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: -140,
            top: -110,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`,
            opacity: 0.28,
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
            position: 'relative',
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
                backgroundColor: 'rgba(243,236,220,0.14)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={G.honey}
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
                fontFamily: 'Hanken Grotesk',
                fontWeight: 600,
                fontSize: 16,
                color: G.honey,
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
              ...HEAD,
              fontSize: show.name.length > 40 ? 32 : 40,
              color: G.cream,
              lineHeight: 1.15,
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
                fontFamily: 'Hanken Grotesk',
                fontWeight: 400,
                fontSize: 18,
                color: G.creamDim,
              }}
            >
              {showDate}
            </div>
            {venueName && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 400,
                  fontSize: 16,
                  color: 'rgba(243,236,220,0.5)',
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
                backgroundColor: 'rgba(243,236,220,0.16)',
              }}
            />
            <div
              style={{
                display: 'flex',
                width: 6,
                height: 6,
                borderRadius: 99,
                backgroundColor: G.fresh,
              }}
            />
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 1,
                backgroundColor: 'rgba(243,236,220,0.16)',
              }}
            />
          </div>

          {/* Bottom stats */}
          <div
            style={{
              display: 'flex',
              gap: 32,
              fontFamily: 'Hanken Grotesk',
              fontSize: 16,
            }}
          >
            {judgedCount > 0 && (
              <div style={{ display: 'flex', color: G.creamDim }}>
                <span style={{ color: G.cream, fontWeight: 700, marginRight: 6 }}>
                  {judgedCount}
                </span>
                classes judged
              </div>
            )}
            {totalEntries > 0 && (
              <div style={{ display: 'flex', color: G.creamDim }}>
                <span style={{ color: G.cream, fontWeight: 700, marginRight: 6 }}>
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
            borderTop: '1px solid rgba(243,236,220,0.12)',
            padding: '0 56px',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                width: 7,
                height: 7,
                borderRadius: 99,
                backgroundColor: G.fresh,
              }}
            />
            <div
              style={{
                display: 'flex',
                ...HEAD,
                fontSize: 16,
                color: G.cream,
              }}
            >
              Remi
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Hanken Grotesk',
              fontWeight: 400,
              fontSize: 13,
              color: G.creamDim,
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
      fonts,
    }
  );
}
