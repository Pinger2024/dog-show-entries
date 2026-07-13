import { ImageResponse } from 'next/og';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows, entries, showSponsors } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';
import { loadShareImageFonts, SHARE_GREEN as G, type ShareImageFont } from '@/lib/share-image-data';

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

const BG_GRADIENT = `linear-gradient(172deg, ${G.deep}, ${G.deepest})`;
const HEAD = { fontFamily: 'Hanken Grotesk', fontWeight: 800, letterSpacing: '-0.015em' } as const;

/** Fresh-green radial glow, top-right — the design system's signature hero accent. */
function GlowAccent() {
  return (
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
  );
}

/** Simple fallback image — just the show name on the deep-pine gradient */
function fallbackImage(showName: string, fonts: ShareImageFont[]) {
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
          background: BG_GRADIENT,
          padding: '60px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <GlowAccent />
        <div
          style={{
            display: 'flex',
            ...HEAD,
            fontSize: showName.length > 40 ? 34 : showName.length > 28 ? 40 : 48,
            color: G.cream,
            textAlign: 'center',
            lineHeight: 1.2,
            position: 'relative',
          }}
        >
          {showName}
        </div>
        {/* Remi wordmark */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 28,
            alignItems: 'center',
            gap: 7,
          }}
        >
          <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 99, backgroundColor: G.fresh }} />
          <div style={{ display: 'flex', ...HEAD, fontSize: 19, color: G.cream }}>Remi</div>
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

  let fonts: ShareImageFont[];
  try {
    fonts = loadShareImageFonts();
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
            background: BG_GRADIENT,
            color: G.cream,
            fontSize: 32,
          }}
        >
          Remi Show Manager
        </div>
      ),
      { ...size }
    );
  }

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

    // Lifecycle-aware status badge — fresh = act now, honey = urgency,
    // translucent cream = neutral, solid green = wrapped up.
    const closeDateMs = show.entryCloseDate ? new Date(show.entryCloseDate).getTime() : null;
    const hoursToClose = closeDateMs ? (closeDateMs - Date.now()) / 3600000 : Infinity;
    const closeDate = show.entryCloseDate
      ? new Date(show.entryCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : null;

    let badgeText = '';
    let badgeBg = '';
    let badgeColor: string = G.cream;

    if (show.status === 'entries_open') {
      if (hoursToClose <= 72) {
        badgeText = `Closing ${closeDate}`;
        badgeBg = G.honey;
        badgeColor = '#3a2606';
      } else {
        badgeText = 'Entries Open';
        badgeBg = G.fresh;
        badgeColor = '#0e2c19';
      }
    } else if (show.status === 'entries_closed') {
      badgeText = 'Entries Closed';
      badgeBg = 'rgba(243,236,220,0.14)';
      badgeColor = G.cream;
    } else if (show.status === 'in_progress') {
      badgeText = 'Live Today';
      badgeBg = G.fresh;
      badgeColor = '#0e2c19';
    } else if (show.status === 'completed') {
      badgeText = 'Results Published';
      badgeBg = G.green;
      badgeColor = G.cream;
    } else if (show.status === 'published') {
      badgeText = 'Coming Soon';
      badgeBg = 'rgba(243,236,220,0.14)';
      badgeColor = G.cream;
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
            background: BG_GRADIENT,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Banner image background (if present), scrimmed dark so cream type stays legible */}
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
                opacity: 0.26,
              }}
            />
          )}
          {bannerData && (
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(172deg, rgba(32,69,44,0.88) 0%, rgba(21,46,29,0.94) 100%)`,
              }}
            />
          )}

          <GlowAccent />

          {/* Main content — centred layout */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              width: '100%',
              flex: 1,
              padding: '34px 60px 20px',
              position: 'relative',
            }}
          >
            {/* Notice-of-show eyebrow */}
            <div
              style={{
                display: 'flex',
                fontFamily: 'Hanken Grotesk',
                fontWeight: 700,
                fontSize: 11,
                color: G.fresh,
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
                width: 112,
                height: 112,
                borderRadius: 56,
                backgroundColor: G.cream,
                alignItems: 'center',
                justifyContent: 'center',
                border: `3px solid ${G.fresh}`,
                boxShadow: '0 10px 24px -10px rgba(0,0,0,0.5)',
              }}
            >
              {clubLogoData ? (
                <img
                  src={`data:image/png;base64,${Buffer.from(clubLogoData).toString('base64')}`}
                  width={90}
                  height={90}
                  style={{ objectFit: 'contain', borderRadius: 45 }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    ...HEAD,
                    fontSize: 38,
                    color: G.deep,
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
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 700,
                  fontSize: clubNameSize,
                  color: G.cream,
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
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 500,
                  fontSize: 11,
                  color: G.creamDim,
                  letterSpacing: '0.04em',
                }}
              >
                RKC Registered
              </div>
            )}

            {/* Show type chip */}
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 600,
                fontSize: 12,
                color: G.cream,
                backgroundColor: 'rgba(243,236,220,0.14)',
                boxShadow: 'inset 0 0 0 1px rgba(243,236,220,0.25)',
                borderRadius: 999,
                padding: '5px 15px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              {showType}
            </div>

            {/* Show name */}
            <div
              style={{
                display: 'flex',
                marginTop: 14,
                ...HEAD,
                fontSize: showNameSize,
                color: G.cream,
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
                fontFamily: 'Hanken Grotesk',
                fontWeight: 400,
                fontSize: 16,
                color: G.creamDim,
              }}
            >
              <span style={{ display: 'flex' }}>{showDate}</span>
              {show.venue && (
                <>
                  <span style={{ display: 'flex', color: G.fresh }}>·</span>
                  <span style={{ display: 'flex' }}>{show.venue.name}</span>
                </>
              )}
            </div>

            {/* Judges + entry count + status badge */}
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {judges.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 600,
                    fontStyle: 'italic',
                    fontSize: 14,
                    color: G.creamDim,
                  }}
                >
                  Judged by {judges.slice(0, 3).join(' & ')}
                </div>
              )}
              {entryCount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 600,
                    fontSize: 13,
                    color: G.fresh,
                  }}
                >
                  {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                </div>
              )}
              {badgeText && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 600,
                    fontSize: 12,
                    color: badgeColor,
                    backgroundColor: badgeBg,
                    padding: '6px 14px',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {badgeText}
                </div>
              )}
            </div>

            {/* Title sponsor attribution (small, at the top-right corner) */}
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
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 500,
                    fontSize: 10,
                    color: G.creamDim,
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

          {/* Bottom bar — Remi mark + domain */}
          <div
            style={{
              display: 'flex',
              height: 52,
              padding: '0 56px',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              borderTop: '1px solid rgba(243,236,220,0.12)',
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
                  fontSize: 17,
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

    return fallbackImage(showName, fonts);
  }
}
