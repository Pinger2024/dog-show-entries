/**
 * Per-show 1080×1920 story share image.
 *
 * Sized for Instagram Stories / Facebook Stories (9:16 portrait). User
 * downloads, opens IG/FB stories, picks the saved image, posts.
 *
 * Brand-matched to the OG card and portrait share — the Show Experience
 * green system: deep-pine gradient, soft fresh radial glow, cream
 * Hanken-extrabold display type with tight tracking, honey accents for
 * judging/urgency, fresh accents for status and the Remi wordmark.
 *
 * Important visual constraint: Story platforms overlay UI (profile pic +
 * username top-left, react bar bottom). The widely-used "safe zone" is:
 *   - top ~14%  reserved (250px on a 1920px image)
 *   - bottom ~16% reserved (305px)
 * So this layout deliberately keeps important text (show name, date,
 * URL) in the middle ~70% of the image. The top + bottom edges CAN carry
 * decorative-only elements (the radial glow) because they sit in the
 * unsafe zones.
 */
import { ImageResponse } from 'next/og';
import { loadShareImageData, loadShareImageFonts, SHARE_GREEN as G } from '@/lib/share-image-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1080, height: 1920 } as const;
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
    console.error('share/story: font load failed', err);
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
            fontSize: 72,
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

  const nameSize =
    show.name.length > 50 ? 90 : show.name.length > 32 ? 110 : 132;

  const clubName = show.organisation?.name ?? 'Host Club';
  const clubInitials = clubName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '◆';
  const clubNameSize = clubName.length > 40 ? 30 : clubName.length > 28 ? 36 : 42;

  const judgesTeaser = judges.length === 0
    ? null
    : judges.length <= 2
      ? judges.join(' · ')
      : `${judges.slice(0, 2).join(' · ')} +${judges.length - 2} more`;

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
              opacity: 0.14,
            }}
          />
        )}

        {/* Fresh-green radial glow — sits mostly in the unsafe top zone */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: -180,
            top: -140,
            width: 620,
            height: 620,
            borderRadius: 999,
            background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`,
            opacity: 0.26,
          }}
        />

        {/* === SAFE-ZONE BODY (~14% top, ~16% bottom reserved) === */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            paddingTop: 280,    /* ~14.5% — past the IG header overlay */
            paddingBottom: 320,  /* ~16.5% — above the IG react bar */
            paddingLeft: 80,
            paddingRight: 80,
            position: 'relative',
          }}
        >
          {/* === TOP: eyebrow + crest + club name === */}
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
                fontSize: 22,
                color: G.fresh,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
              }}
            >
              Notice of Show
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 36,
                width: 200,
                height: 200,
                borderRadius: 100,
                backgroundColor: G.cream,
                alignItems: 'center',
                justifyContent: 'center',
                border: `5px solid ${G.fresh}`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              }}
            >
              {clubLogoData ? (
                <img
                  src={`data:image/png;base64,${Buffer.from(clubLogoData).toString('base64')}`}
                  width={166}
                  height={166}
                  style={{ objectFit: 'contain', borderRadius: 83 }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    ...HEAD,
                    fontSize: 76,
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
                marginTop: 28,
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
          </div>

          {/* === MIDDLE: show name + type + date + venue === */}
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
                ...HEAD,
                fontSize: nameSize,
                color: G.cream,
                lineHeight: 1.06,
                textAlign: 'center',
              }}
            >
              {show.name}
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 400,
                fontSize: 32,
                color: G.creamDim,
                fontStyle: 'italic',
              }}
            >
              {showType}
            </div>

            <div
              style={{
                display: 'flex',
                width: 280,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${G.fresh}, transparent)`,
                marginTop: 50,
                marginBottom: 36,
              }}
            />

            <div
              style={{
                display: 'flex',
                ...HEAD,
                fontSize: 52,
                color: G.cream,
                textAlign: 'center',
                lineHeight: 1.1,
              }}
            >
              {showDate}
            </div>

            {show.venue?.name && (
              <div
                style={{
                  display: 'flex',
                  marginTop: 24,
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 400,
                  fontSize: 32,
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
                  marginTop: 36,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 600,
                    fontSize: 16,
                    color: G.honey,
                    letterSpacing: '0.34em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Judging
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 400,
                    fontSize: 26,
                    color: G.creamDim,
                    textAlign: 'center',
                    maxWidth: 860,
                  }}
                >
                  {judgesTeaser}
                </div>
              </div>
            )}
          </div>

          {/* === BOTTOM (within safe zone): status + sponsor + URL === */}
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
                  paddingLeft: 36,
                  paddingRight: 36,
                  paddingTop: 16,
                  paddingBottom: 16,
                  borderRadius: 999,
                  backgroundColor: status.bg,
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 600,
                  fontSize: 26,
                  color: status.color,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 36,
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
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 400,
                    fontSize: 14,
                    color: G.creamDim,
                    letterSpacing: '0.32em',
                    textTransform: 'uppercase',
                    fontStyle: 'italic',
                    marginBottom: 8,
                  }}
                >
                  In association with
                </div>
                {sponsorLogoData ? (
                  <img
                    src={`data:image/png;base64,${Buffer.from(sponsorLogoData).toString('base64')}`}
                    width={170}
                    height={56}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      ...HEAD,
                      fontSize: 30,
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
                fontSize: 28,
                color: G.cream,
                letterSpacing: '0.02em',
                textAlign: 'center',
              }}
            >
              Enter online · remishowmanager.co.uk
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 14,
                alignItems: 'center',
                gap: 8,
                fontFamily: 'Hanken Grotesk',
                fontWeight: 700,
                fontSize: 16,
                color: G.fresh,
                letterSpacing: '0.34em',
                textTransform: 'uppercase',
              }}
            >
              <div style={{ display: 'flex', width: 9, height: 9, borderRadius: 99, backgroundColor: G.fresh }} />
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
