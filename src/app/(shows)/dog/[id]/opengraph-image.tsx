import { ImageResponse } from 'next/og';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { dogs, dogPhotos, entries, entryClasses } from '@/server/db/schema';

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

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Load fonts from local files
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
            backgroundColor: '#292524',
            color: '#FAFAF8',
            fontFamily: 'Libre Baskerville',
            fontSize: 32,
          }}
        >
          Dog not found
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
    ?.map((t: { titleType: string }) => TITLE_LABELS[t.titleType])
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
          backgroundColor: '#1C1917',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle texture overlay */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse at 30% 50%, rgba(180,130,80,0.06) 0%, transparent 70%)',
          }}
        />

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

        {/* Main content area */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '40px 56px',
            gap: 48,
            alignItems: 'center',
          }}
        >
          {/* Photo column */}
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              width: 320,
              height: 400,
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid rgba(201, 168, 76, 0.3)',
              position: 'relative',
              backgroundColor: '#292524',
            }}
          >
            {photoData ? (
              <img
                src={`data:image/jpeg;base64,${Buffer.from(photoData).toString('base64')}`}
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
                  backgroundColor: '#292524',
                }}
              >
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(201, 168, 76, 0.3)"
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
                  fontFamily: 'Libre Baskerville',
                  fontWeight: 700,
                  fontSize: displayName.length > 35 ? 30 : displayName.length > 25 ? 34 : 38,
                  color: '#FAFAF8',
                  lineHeight: 1.2,
                  letterSpacing: '0.01em',
                }}
              >
                {displayName}
              </div>
              {breedName && (
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 18,
                    color: '#A8A29E',
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

            {/* Career stats */}
            {statsLine && (
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: 20,
                  color: '#C9A84C',
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
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: 15,
                  color: '#78716C',
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
            borderTop: '1px solid rgba(201, 168, 76, 0.15)',
            padding: '0 56px',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(28, 25, 23, 0.95)',
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
