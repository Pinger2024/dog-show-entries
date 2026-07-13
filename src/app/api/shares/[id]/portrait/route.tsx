/**
 * Per-show 1080×1350 portrait share image.
 *
 * Sized for Instagram feed posts (4:5 portrait — IG's preferred aspect)
 * and Facebook feed posts. The Lu.ma / Partiful pattern: instead of
 * trying to deep-link into apps that fight us, give users a beautifully
 * rendered downloadable image they can save and post natively.
 *
 * Brand-matched to the OG card — the Show Experience green system: a
 * deep-pine gradient, a soft fresh radial glow, cream Hanken-extrabold
 * display type with tight tracking, honey accents for urgency, fresh
 * accents for status. Reflowed for portrait — the show name takes most
 * of the vertical real estate, the date and venue come next, status
 * badge anchors the bottom. Designed to be legible at thumbnail size in
 * a fast-scrolling feed.
 *
 * Cache strategy: Cache-Control: public, max-age=300, stale-while-revalidate=86400.
 * Show data changes (entries close, status flips) so we don't hard-cache,
 * but five-minute caching on the CDN absorbs share-button bursts.
 */
import { ImageResponse } from 'next/og';
import { loadShareImageData, loadShareImageFonts, SHARE_GREEN as G } from '@/lib/share-image-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1080, height: 1350 } as const;
const BG_GRADIENT = `linear-gradient(172deg, ${G.deep}, ${G.deepest})`;
const HEAD = { fontFamily: 'Hanken Grotesk', fontWeight: 800, letterSpacing: '-0.015em' } as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let fonts;
  try {
    fonts = loadShareImageFonts();
  } catch (err) {
    console.error('share/portrait: font load failed', err);
    return new Response('font error', { status: 500 });
  }

  const data = await loadShareImageData(id);
  if (!data) {
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
            fontSize: 56,
          }}
        >
          Show not found
        </div>
      ),
      { ...SIZE, fonts: fonts.filter((f) => f.weight === 800) }
    );
  }

  const {
    show,
    titleSponsor,
    bannerData,
    sponsorLogoData,
    clubLogoData,
    judges,
    showType,
    showDate,
    status,
  } = data;

  // Type-system tightening: bannerImageUrl is on a related JSON column
  // not declared on the base Show type yet.
  const showAny = show as typeof show & { bannerImageUrl?: string | null };
  void showAny;

  // Show-name typography scales with length so a 60-character name still
  // fits without breaking the card. Three breakpoints empirically — short,
  // medium, long.
  const nameSize =
    show.name.length > 50 ? 76 : show.name.length > 32 ? 96 : 116;

  // Club name + initials fallback for the crest
  const clubName = show.organisation?.name ?? 'Host Club';
  const clubInitials = clubName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '◆';
  const clubNameSize = clubName.length > 40 ? 28 : clubName.length > 28 ? 32 : 36;

  // Judges teaser: at most three names, comma-joined.
  const judgesTeaser = judges.length === 0
    ? null
    : judges.length <= 3
      ? judges.join(' · ')
      : `${judges.slice(0, 3).join(' · ')} +${judges.length - 3} more`;

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
        }}
      >
        {/* Subtle banner-image background, faded into the gradient */}
        {bannerData && (
          <img
            src={`data:image/jpeg;base64,${Buffer.from(bannerData).toString('base64')}`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.16,
            }}
          />
        )}

        {/* Fresh-green radial glow */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: -160,
            top: -130,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`,
            opacity: 0.28,
          }}
        />

        {/* Body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '70px 80px',
            position: 'relative',
          }}
        >
          {/* === TOP: eyebrow + crest + club name + show name === */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'Hanken Grotesk',
                fontWeight: 700,
                fontSize: 18,
                color: G.fresh,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
              }}
            >
              Notice of Show
            </div>

            {/* Club crest */}
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: G.cream,
                alignItems: 'center',
                justifyContent: 'center',
                border: `4px solid ${G.fresh}`,
                boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
              }}
            >
              {clubLogoData ? (
                <img
                  src={`data:image/png;base64,${Buffer.from(clubLogoData).toString('base64')}`}
                  width={132}
                  height={132}
                  style={{ objectFit: 'contain', borderRadius: 66 }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    ...HEAD,
                    fontSize: 60,
                    color: G.deep,
                  }}
                >
                  {clubInitials}
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 700,
                fontSize: clubNameSize,
                color: G.cream,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              {clubName}
            </div>

            {/* Show name — the visual centre of the card */}
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                ...HEAD,
                fontSize: nameSize,
                color: G.cream,
                lineHeight: 1.08,
                textAlign: 'center',
              }}
            >
              {show.name}
            </div>

            {/* Show type */}
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 400,
                fontSize: 28,
                color: G.creamDim,
                fontStyle: 'italic',
              }}
            >
              {showType}
            </div>
          </div>

          {/* === MIDDLE: date + venue + judges === */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              gap: 18,
            }}
          >
            {/* Fresh divider */}
            <div
              style={{
                display: 'flex',
                width: 220,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${G.fresh}, transparent)`,
                marginBottom: 12,
              }}
            />

            <div
              style={{
                display: 'flex',
                ...HEAD,
                fontSize: 44,
                color: G.cream,
                textAlign: 'center',
              }}
            >
              {showDate}
            </div>

            {show.venue?.name && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 400,
                  fontSize: 28,
                  color: G.creamDim,
                  textAlign: 'center',
                }}
              >
                {show.venue.name}
              </div>
            )}

            {judgesTeaser && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 600,
                    fontSize: 14,
                    color: G.honey,
                    letterSpacing: '0.32em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Judging
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 400,
                    fontSize: 22,
                    color: G.creamDim,
                    textAlign: 'center',
                    maxWidth: 880,
                  }}
                >
                  {judgesTeaser}
                </div>
              </div>
            )}
          </div>

          {/* === BOTTOM: status badge + sponsor + footer === */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {status && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingLeft: 28,
                  paddingRight: 28,
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderRadius: 999,
                  backgroundColor: status.bg,
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 600,
                  fontSize: 22,
                  color: status.color,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 28,
                }}
              >
                {status.text}
              </div>
            )}

            {titleSponsor && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginBottom: 22,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 400,
                    fontSize: 13,
                    color: G.creamDim,
                    letterSpacing: '0.32em',
                    textTransform: 'uppercase',
                    fontStyle: 'italic',
                    marginBottom: 6,
                  }}
                >
                  In association with
                </div>
                {sponsorLogoData ? (
                  <img
                    src={`data:image/png;base64,${Buffer.from(sponsorLogoData).toString('base64')}`}
                    width={140}
                    height={48}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      ...HEAD,
                      fontSize: 26,
                      color: G.cream,
                    }}
                  >
                    {titleSponsor.sponsor.name}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                ...HEAD,
                fontSize: 24,
                color: G.cream,
                letterSpacing: '0.02em',
              }}
            >
              Enter online · remishowmanager.co.uk
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 10,
                alignItems: 'center',
                gap: 7,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 700,
                fontSize: 14,
                color: G.fresh,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
              }}
            >
              <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 99, backgroundColor: G.fresh }} />
              Remi
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    }
  );
}
