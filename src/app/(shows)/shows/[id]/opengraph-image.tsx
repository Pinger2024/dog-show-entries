import { ImageResponse } from 'next/og';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/server/db';
import { shows, entries, showSponsors } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';

export const runtime = 'nodejs';
export const alt = 'Preview card for a dog show listing on Remi';
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

/** Simple fallback image — just the show name on a dark background */
function fallbackImage(
  showName: string,
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 }[]
) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#1C1917',
          padding: '60px',
        }}
      >
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
        <div
          style={{
            display: 'flex',
            fontFamily: 'Libre Baskerville',
            fontWeight: 700,
            fontSize: showName.length > 40 ? 34 : showName.length > 28 ? 40 : 48,
            color: '#FAFAF8',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {showName}
        </div>
        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 24,
            fontFamily: 'Libre Baskerville',
            fontWeight: 700,
            fontSize: 18,
            color: '#C9A84C',
            letterSpacing: '0.08em',
          }}
        >
          REMI
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Load fonts first — node fs on the project root is reliable across dev and prod
  // (the `new URL('../../../../../public/fonts/...', import.meta.url)` pattern silently
  // fails under Next 15's prod bundler, dropping us into the "Remi Show Manager"
  // fallback on every social share).
  let baskervilleBold: ArrayBuffer;
  let interRegular: ArrayBuffer;
  let interSemibold: ArrayBuffer;

  try {
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    const readFont = (name: string): ArrayBuffer => {
      const buf = readFileSync(join(fontsDir, name));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    };
    baskervilleBold = readFont('libre-baskerville-bold.ttf');
    interRegular = readFont('inter-regular.ttf');
    interSemibold = readFont('inter-semibold.ttf');
  } catch (err) {
    console.error('OG image: font loading failed:', err);
    // Return a minimal image with default fonts
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
            fontSize: 32,
          }}
        >
          Remi Show Manager
        </div>
      ),
      { ...size }
    );
  }

  const allFonts = [
    { name: 'Libre Baskerville', data: baskervilleBold, weight: 700 as const },
    { name: 'Inter', data: interRegular, weight: 400 as const },
    { name: 'Inter', data: interSemibold, weight: 600 as const },
  ];

  // Wrap the entire data-dependent section in try/catch
  // so DB timeouts, image fetch failures, etc. produce a usable fallback
  try {
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

    // Banner image as background
    let bannerData: ArrayBuffer | null = null;
    const showAny = show as typeof show & { bannerImageUrl?: string | null };
    if (showAny.bannerImageUrl) {
      try {
        const res = await fetch(showAny.bannerImageUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) bannerData = await res.arrayBuffer();
      } catch { /* no banner fallback */ }
    }

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
    const badgeColor = '#FAFAF8';

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

    const orgKcReg = (show.organisation as { kcRegNumber?: string | null } | null | undefined)?.kcRegNumber;
    const clubNameSize = !show.organisation ? 0 : show.organisation.name.length > 48 ? 16 : show.organisation.name.length > 36 ? 18 : 20;
    const showNameSize = show.name.length > 40 ? 38 : show.name.length > 28 ? 46 : 54;

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#fbf7ef',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Banner image background (if present) — faded into the cream */}
          {bannerData && (
            <img
              src={`data:image/jpeg;base64,${Buffer.from(bannerData).toString('base64')}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.08,
              }}
            />
          )}

          {/* Warm amber radial highlight */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(217, 119, 6, 0.10) 0%, transparent 55%)',
            }}
          />

          {/* Top + bottom gold hairlines */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 52,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.4), transparent)',
            }}
          />

          {/* Main content — centred heritage layout */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              width: '100%',
              flex: 1,
              padding: '36px 60px 24px',
              position: 'relative',
            }}
          >
            {/* Notice-of-show eyebrow */}
            <div
              style={{
                display: 'flex',
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 11,
                color: '#92702A',
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
              }}
            >
              Notice of Show
            </div>

            {/* Club crest — the brand, front and centre */}
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid #C9A84C',
                boxShadow: '0 4px 16px rgba(201, 168, 76, 0.25)',
              }}
            >
              {clubLogoData ? (
                <img
                  src={`data:image/png;base64,${Buffer.from(clubLogoData).toString('base64')}`}
                  width={96}
                  height={96}
                  style={{ objectFit: 'contain', borderRadius: 48 }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Libre Baskerville',
                    fontWeight: 700,
                    fontSize: 42,
                    color: '#92702A',
                  }}
                >
                  {show.organisation?.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() ?? '◆'}
                </div>
              )}
            </div>

            {/* Club name */}
            {show.organisation && (
              <div
                style={{
                  display: 'flex',
                  marginTop: 16,
                  fontFamily: 'Libre Baskerville',
                  fontWeight: 700,
                  fontSize: clubNameSize,
                  color: '#292524',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  maxWidth: 880,
                }}
              >
                {show.organisation.name}
              </div>
            )}

            {/* RKC registration micro-badge */}
            {orgKcReg && (
              <div
                style={{
                  display: 'flex',
                  marginTop: 6,
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: 11,
                  color: '#78716C',
                  letterSpacing: '0.04em',
                }}
              >
                RKC Registered
              </div>
            )}

            {/* Ornamental "presents" divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginTop: 16,
              }}
            >
              <div style={{ display: 'flex', width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.5)' }} />
              <div style={{ display: 'flex', width: 7, height: 7, backgroundColor: '#C9A84C', transform: 'rotate(45deg)' }} />
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Libre Baskerville',
                  fontWeight: 700,
                  fontStyle: 'italic',
                  fontSize: 11,
                  color: '#92702A',
                  letterSpacing: '0.35em',
                  textTransform: 'uppercase',
                }}
              >
                Presents
              </div>
              <div style={{ display: 'flex', width: 7, height: 7, backgroundColor: '#C9A84C', transform: 'rotate(45deg)' }} />
              <div style={{ display: 'flex', width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.5)' }} />
            </div>

            {/* Show type chip */}
            <div
              style={{
                display: 'flex',
                marginTop: 14,
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 11,
                color: '#92702A',
                backgroundColor: 'rgba(201,168,76,0.14)',
                border: '1px solid rgba(201,168,76,0.5)',
                borderRadius: 999,
                padding: '4px 14px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
              }}
            >
              {showType}
            </div>

            {/* Show name */}
            <div
              style={{
                display: 'flex',
                marginTop: 12,
                fontFamily: 'Libre Baskerville',
                fontWeight: 700,
                fontSize: showNameSize,
                color: '#1C1917',
                lineHeight: 1.05,
                textAlign: 'center',
                maxWidth: 1000,
              }}
            >
              {show.name}
            </div>

            {/* Date + venue inline */}
            <div
              style={{
                display: 'flex',
                marginTop: 14,
                alignItems: 'baseline',
                gap: 14,
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: 16,
                color: '#57534E',
              }}
            >
              <span style={{ display: 'flex' }}>{showDate}</span>
              {show.venue && (
                <>
                  <span style={{ display: 'flex', color: '#C9A84C' }}>·</span>
                  <span style={{ display: 'flex' }}>{show.venue.name}</span>
                </>
              )}
            </div>

            {/* Judges + entry count + status badge */}
            <div
              style={{
                display: 'flex',
                marginTop: 16,
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {judges.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Libre Baskerville',
                    fontWeight: 700,
                    fontStyle: 'italic',
                    fontSize: 14,
                    color: '#57534E',
                  }}
                >
                  Judged by {judges.slice(0, 3).join(' & ')}
                </div>
              )}
              {entryCount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#92702A',
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
                    letterSpacing: '0.08em',
                  }}
                >
                  {badgeText}
                </div>
              )}
            </div>

            {/* Title sponsor attribution (small, at the bottom of the content area) */}
            {sponsorLogoData && titleSponsor && (
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  right: 36,
                  top: 36,
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 10,
                    color: '#92702A',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  In association with
                </div>
                <img
                  src={`data:image/png;base64,${Buffer.from(sponsorLogoData).toString('base64')}`}
                  width={72}
                  height={32}
                  style={{ objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          {/* Bottom bar — cream with Remi mark + domain */}
          <div
            style={{
              display: 'flex',
              height: 52,
              padding: '0 56px',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#fbf7ef',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  width: 7,
                  height: 7,
                  backgroundColor: '#C9A84C',
                  transform: 'rotate(45deg)',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Libre Baskerville',
                  fontWeight: 700,
                  fontSize: 18,
                  color: '#15803D',
                  letterSpacing: '0.02em',
                }}
              >
                Remi
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
        fonts: allFonts,
      }
    );
  } catch (err) {
    // If anything fails (DB timeout, image fetch, rendering), return a simple fallback
    console.error('OG image generation failed, returning fallback:', err);

    // Try to get just the show name for the fallback
    let showName = 'Remi Show Manager';
    try {
      const show = await db?.query.shows.findFirst({
        where: isUuid(id) ? eq(shows.id, id) : eq(shows.slug, id),
        columns: { name: true },
      });
      if (show?.name) showName = show.name;
    } catch {
      // Even the name lookup failed — use generic text
    }

    return fallbackImage(showName, allFonts);
  }
}
