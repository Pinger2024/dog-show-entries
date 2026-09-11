import { ImageResponse } from 'next/og';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { dogs, dogPhotos, entries } from '@/server/db/schema';
import { toImageDataUri, loadShareImageFonts, SHARE_GREEN as G } from '@/lib/share-image-data';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };
export const revalidate = 3600; // 1 hour cache

const TITLE_LABELS: Record<string, string> = {
  ch: 'Ch.',
  sh_ch: 'Sh. Ch.',
  ir_ch: 'Ir. Ch.',
  ir_sh_ch: 'Ir. Sh. Ch.',
  int_ch: 'Int. Ch.',
  ob_ch: 'Ob. Ch.',
  ft_ch: 'FT Ch.',
  wt_ch: 'WT Ch.',
};

const BG_GRADIENT = `linear-gradient(172deg, ${G.deep}, ${G.deepest})`;
const HEAD = { fontFamily: 'Hanken Grotesk', fontWeight: 800, letterSpacing: '-0.015em' } as const;

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Load fonts from disk — node fs on the project root is reliable across dev
  // and prod (the `fetch(new URL(..., import.meta.url))` pattern silently
  // breaks under Next 15's prod bundler, dropping the OG image to defaults).
  const fonts = loadShareImageFonts();

  // Fetch dog data directly from DB (server-side)
  const dog = await db?.query.dogs.findFirst({
    where: and(eq(dogs.id, id), isNull(dogs.deletedAt)),
    with: {
      breed: true,
      titles: true,
    },
  });

  if (!dog) {
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
          Dog not found
        </div>
      ),
      {
        ...size,
        fonts: fonts.filter((f) => f.weight === 800),
      }
    );
  }

  // Fetch primary photo
  const primaryPhoto = await db?.query.dogPhotos.findFirst({
    where: and(eq(dogPhotos.dogId, id), eq(dogPhotos.isPrimary, true)),
  });

  // Fetch photo as ArrayBuffer if available
  let photoData: ArrayBuffer | null = null;
  if (primaryPhoto?.url) {
    try {
      const res = await fetch(primaryPhoto.url, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        photoData = await res.arrayBuffer();
      }
    } catch {
      // Fall back to no photo
    }
  }

  // Compute career stats
  const dogEntries = await db?.query.entries.findMany({
    where: and(
      eq(entries.dogId, id),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt)
    ),
    with: {
      entryClasses: {
        with: { result: true },
      },
    },
  });

  let totalShows = dogEntries?.length ?? 0;
  let firsts = 0;
  let specialAwards = 0;

  for (const entry of dogEntries ?? []) {
    for (const ec of entry.entryClasses) {
      if (ec.result?.placement === 1) firsts++;
      if (ec.result?.specialAward) specialAwards++;
    }
  }

  // Build display name with title prefix
  const titlePrefix = dog.titles
    ?.map((t: { title: string }) => TITLE_LABELS[t.title])
    .filter(Boolean)
    .join(' ');
  const displayName = titlePrefix
    ? `${titlePrefix} ${dog.registeredName}`
    : dog.registeredName;
  const breedName = dog.breed?.name ?? '';

  // Build stats line
  const statsItems: string[] = [];
  if (totalShows > 0) statsItems.push(`${totalShows} Show${totalShows !== 1 ? 's' : ''}`);
  if (firsts > 0) statsItems.push(`${firsts} × 1st`);
  if (specialAwards > 0) statsItems.push(`${specialAwards} Award${specialAwards !== 1 ? 's' : ''}`);
  const statsLine = statsItems.join('  ·  ');

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
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
            left: -120,
            top: -100,
            width: 380,
            height: 380,
            borderRadius: 999,
            background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`,
            opacity: 0.24,
          }}
        />

        {/* Main content area */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '40px 56px',
            gap: 48,
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/* Photo column */}
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              width: 320,
              height: 400,
              borderRadius: 14,
              overflow: 'hidden',
              border: `2px solid ${G.fresh}`,
              position: 'relative',
              backgroundColor: G.deepest,
            }}
          >
            {photoData ? (
              <img
                src={toImageDataUri(photoData)}
                width={320}
                height={400}
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: G.deepest,
                }}
              >
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(91, 181, 121, 0.4)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5M8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75Z" />
                  <path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306" />
                </svg>
              </div>
            )}
          </div>

          {/* Text column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {/* Dog name */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  ...HEAD,
                  fontSize: displayName.length > 35 ? 30 : displayName.length > 25 ? 34 : 38,
                  color: G.cream,
                  lineHeight: 1.2,
                }}
              >
                {displayName}
              </div>
              {breedName && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Hanken Grotesk',
                    fontWeight: 400,
                    fontSize: 18,
                    color: G.creamDim,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {breedName}
                </div>
              )}
            </div>

            {/* Ornamental divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  height: 1,
                  backgroundColor: 'rgba(243,236,220,0.18)',
                }}
              />
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
                  flex: 1,
                  height: 1,
                  backgroundColor: 'rgba(243,236,220,0.18)',
                }}
              />
            </div>

            {/* Career stats */}
            {statsLine && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 600,
                  fontSize: 20,
                  color: G.honey,
                  letterSpacing: '0.02em',
                }}
              >
                {statsLine}
              </div>
            )}

            {dog.sex && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 400,
                  fontSize: 15,
                  color: 'rgba(243,236,220,0.5)',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                {dog.sex === 'male' ? 'Dog' : 'Bitch'}
                {dog.colour ? `  ·  ${dog.colour}` : ''}
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
            borderTop: '1px solid rgba(243,236,220,0.12)',
            padding: '0 56px',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Remi branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
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
