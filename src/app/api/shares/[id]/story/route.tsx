/**
 * Per-show 1080×1920 story share image.
 *
 * Sized for Instagram Stories / Facebook Stories (9:16 portrait). User
 * downloads, opens IG/FB stories, picks the saved image, posts.
 *
 * Important visual constraint: Story platforms overlay UI (profile pic +
 * username top-left, react bar bottom). The widely-used "safe zone" is:
 *   - top ~14%  reserved (250px on a 1920px image)
 *   - bottom ~16% reserved (305px)
 * So this layout deliberately keeps important text (show name, date,
 * URL) in the middle ~70% of the image. The top + bottom hairlines and
 * brand mark CAN sit in the unsafe zones because they're decorative.
 */
import { ImageResponse } from 'next/og';
import { loadShareImageData, loadShareImageFonts } from '@/lib/share-image-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1080, height: 1920 } as const;

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
            backgroundColor: '#1C1917',
            color: '#FAFAF8',
            fontFamily: 'Libre Baskerville',
            fontSize: 72,
          }}
        >
          Show not found
        </div>
      ),
      { ...SIZE, fonts: fonts.filter((f) => f.name === 'Libre Baskerville') }
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
          backgroundColor: '#fbf7ef',
          position: 'relative',
        }}
      >
        {/* Subtle banner-image background, faded to a wash */}
        {bannerData && (
          <img
            src={`data:image/jpeg;base64,${Buffer.from(bannerData).toString('base64')}`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.06,
            }}
          />
        )}

        {/* Stronger amber radial highlight for the longer canvas */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% 35%, rgba(217, 119, 6, 0.14) 0%, transparent 60%)',
          }}
        />

        {/* Top + bottom gold hairlines (in the unsafe zones — decorative only) */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 5,
            background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
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
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 22,
                color: '#92702A',
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
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                border: '5px solid #C9A84C',
                boxShadow: '0 8px 28px rgba(201, 168, 76, 0.32)',
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
                    fontFamily: 'Libre Baskerville',
                    fontWeight: 700,
                    fontSize: 76,
                    color: '#92702A',
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
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: clubNameSize,
                color: '#44403C',
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
                fontFamily: 'Libre Baskerville',
                fontWeight: 700,
                fontSize: nameSize,
                color: '#1C1917',
                lineHeight: 1.06,
                textAlign: 'center',
                letterSpacing: '-0.01em',
              }}
            >
              {show.name}
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: 32,
                color: '#78716C',
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
                background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
                marginTop: 50,
                marginBottom: 36,
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'Libre Baskerville',
                fontWeight: 700,
                fontSize: 52,
                color: '#1C1917',
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
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: 32,
                  color: '#57534E',
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
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    fontSize: 16,
                    color: '#92702A',
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
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 26,
                    color: '#44403C',
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
                  fontFamily: 'Inter',
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
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 14,
                    color: '#92702A',
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
                      fontFamily: 'Libre Baskerville',
                      fontWeight: 700,
                      fontSize: 30,
                      color: '#1C1917',
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
                fontFamily: 'Libre Baskerville',
                fontWeight: 700,
                fontSize: 28,
                color: '#1C1917',
                letterSpacing: '0.04em',
                textAlign: 'center',
              }}
            >
              Enter online · remishowmanager.co.uk
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 12,
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 16,
                color: '#92702A',
                letterSpacing: '0.42em',
                textTransform: 'uppercase',
              }}
            >
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
