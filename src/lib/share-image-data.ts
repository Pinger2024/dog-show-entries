/**
 * Shared data + font loading for the per-show share images.
 *
 * Three callers today:
 *   - opengraph-image.tsx        (1200×630, used as URL preview)
 *   - api/shares/[id]/portrait   (1080×1350, IG/FB feed post)
 *   - api/shares/[id]/story      (1080×1920, IG/FB stories)
 *
 * Same data shape, same fonts, same status-badge logic — extracted here
 * so each route can focus purely on layout + JSX. Server-only.
 */
import 'server-only';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/server/db';
import { shows, entries, showSponsors } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';
import { HANKEN_GROTESK_FACES } from '@/lib/hanken-faces';
import { BRAND } from '@/lib/brand';

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

export type StatusBadge = {
  text: string;
  /** background colour hex */
  bg: string;
  /** foreground (text) colour hex */
  color: string;
} | null;

export interface ShareImageData {
  show: NonNullable<Awaited<ReturnType<typeof fetchShow>>>;
  titleSponsor: NonNullable<Awaited<ReturnType<typeof fetchTitleSponsor>>> | null;
  /** Fetched banner image as a base64-encodable buffer; null if not set or fetch failed. */
  bannerData: ArrayBuffer | null;
  /** Title sponsor logo as a buffer; null if no sponsor or fetch failed. */
  sponsorLogoData: ArrayBuffer | null;
  /** Host club logo as a buffer; null if no logo or fetch failed. */
  clubLogoData: ArrayBuffer | null;
  /** Number of confirmed entries (used for some image variants — not all). */
  entryCount: number;
  /** Distinct judge names for this show, in assignment order. */
  judges: string[];
  /** Pretty show type label (e.g. "Open Show"). */
  showType: string;
  /** Human-formatted start date — "Saturday 4 May 2026". */
  showDate: string;
  /** Short closing date — "4 May" — or null if not set. */
  closeDateShort: string | null;
  /** Hours until entry close; Infinity if not set. */
  hoursToClose: number;
  /** Lifecycle-aware status badge, or null if no badge applies. */
  status: StatusBadge;
}

export type ShareImageFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700 | 800;
  style?: 'normal' | 'italic';
};

/**
 * Show Experience green re-skin palette — verbatim from the design source
 * (research/design-reference/green-live.original.jsx, token object `G`).
 * Shared here so every share-image route (OG cards, portrait, story) draws
 * from one definition instead of five copy-pasted hex maps.
 *
 * Sourced from the canonical BRAND palette (src/lib/brand.ts) where the two
 * overlap, plus a couple of extras BRAND doesn't carry: `surface` (plain
 * white) and `freshLine` (a design-token hex), and `creamDim` (an rgba
 * derived from `cream`, needed here because satori/CSS-in-JS can't do
 * `color-mix`/alpha-on-var()). Several keys below (surface, ink/ink2/ink3,
 * freshDeep/freshSoft/freshLine, honeyDeep/honeySoft, line/line2, paper2)
 * are currently unused by any share-image route — kept as a deliberate
 * verbatim mirror of the full design-token set (reserved for future
 * variants) rather than trimmed to only what's referenced today.
 */
export const SHARE_GREEN = {
  ...BRAND,
  surface: '#ffffff',
  freshLine: '#c3e2cb',
  creamDim: 'rgba(243,236,220,0.66)',
} as const;

/**
 * Read TTF files from public/fonts. Synchronous + node fs because the
 * `new URL('../../...', import.meta.url)` pattern silently breaks under
 * Next 15's prod bundler — that's the bug commit 707c160 fixed for the
 * OG image. Same fix applies here.
 *
 * Faces are Hanken Grotesk (the Show Experience green design's "friendly"
 * fontset — extrabold display headings, tight -0.015em tracking). Satori
 * can't use next/font, so these are static TTFs in public/fonts, acquired
 * from the google-webfonts-helper mirror. The previous Libre Baskerville /
 * Inter pairing is fully retired from share images — those TTF files stay
 * in public/fonts for unrelated PDF consumers (catalogue, judges book,
 * prize cards, etc.) but nothing here references them any more.
 *
 * Face list comes from the shared HANKEN_GROTESK_FACES manifest (also
 * consumed by pdf-fonts.ts's Font.register) so the two font-loading paths
 * can't drift. Buffers are read once per process and cached module-level —
 * every share-image request otherwise re-reads all 7 TTFs from disk.
 */
let cache: ShareImageFont[] | null = null;

function buildShareImageFonts(): ShareImageFont[] {
  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const readFont = (name: string): ArrayBuffer => {
    const buf = readFileSync(join(fontsDir, name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  };
  return HANKEN_GROTESK_FACES.map((face) => ({
    name: 'Hanken Grotesk',
    data: readFont(face.file),
    weight: face.weight,
    ...(face.style ? { style: face.style } : {}),
  }));
}

export function loadShareImageFonts(): ShareImageFont[] {
  cache ??= buildShareImageFonts();
  return cache;
}

async function fetchShow(idOrSlug: string) {
  return db?.query.shows.findFirst({
    where: isUuid(idOrSlug) ? eq(shows.id, idOrSlug) : eq(shows.slug, idOrSlug),
    with: {
      organisation: true,
      venue: true,
      judgeAssignments: {
        with: { judge: true },
      },
    },
  });
}

async function fetchTitleSponsor(showId: string) {
  return db?.query.showSponsors.findFirst({
    where: and(
      eq(showSponsors.showId, showId),
      eq(showSponsors.tier, 'title')
    ),
    with: { sponsor: true },
  });
}

// Re-exported for the ImageResponse routes; the implementation is pure (no
// `server-only`) so it can be unit-tested.
export { toImageDataUri } from './image-data-uri';

/** Best-effort image fetch with a 3s timeout; returns null on any failure. */
async function fetchAsBuffer(url: string | null | undefined): Promise<ArrayBuffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function deriveStatus(
  status: string | null | undefined,
  hoursToClose: number,
  closeDateShort: string | null
): StatusBadge {
  // Colours from the green design system: fresh = act now, honey = urgency,
  // translucent cream = neutral/informational, solid green = wrapped up.
  if (status === 'entries_open') {
    if (hoursToClose <= 72 && closeDateShort) {
      return { text: `Closing ${closeDateShort}`, bg: SHARE_GREEN.honey, color: '#3a2606' };
    }
    return { text: 'Entries Open', bg: SHARE_GREEN.fresh, color: '#0e2c19' };
  }
  if (status === 'entries_closed') {
    return { text: 'Entries Closed', bg: 'rgba(243,236,220,0.14)', color: SHARE_GREEN.cream };
  }
  if (status === 'in_progress') return { text: 'Live Today', bg: SHARE_GREEN.fresh, color: '#0e2c19' };
  if (status === 'completed') return { text: 'Results Published', bg: SHARE_GREEN.green, color: SHARE_GREEN.cream };
  if (status === 'published') {
    return { text: 'Coming Soon', bg: 'rgba(243,236,220,0.14)', color: SHARE_GREEN.cream };
  }
  return null;
}

/**
 * Single entry point used by every share-image route. Returns null if the
 * show doesn't exist — callers should render their own "show not found"
 * fallback in that case.
 */
export async function loadShareImageData(idOrSlug: string): Promise<ShareImageData | null> {
  const show = await fetchShow(idOrSlug);
  if (!show) return null;

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
    fetchTitleSponsor(show.id),
  ]);

  const showAny = show as typeof show & { bannerImageUrl?: string | null };
  const [bannerData, sponsorLogoData, clubLogoData] = await Promise.all([
    fetchAsBuffer(showAny.bannerImageUrl),
    fetchAsBuffer(titleSponsor?.sponsor.logoUrl),
    fetchAsBuffer(show.organisation?.logoUrl),
  ]);

  const showType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const closeDateMs = show.entryCloseDate ? new Date(show.entryCloseDate).getTime() : null;
  const hoursToClose = closeDateMs ? (closeDateMs - Date.now()) / 3600000 : Infinity;
  const closeDateShort = show.entryCloseDate
    ? new Date(show.entryCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  const judges = [...new Set(
    show.judgeAssignments?.map((ja) => ja.judge?.name).filter(Boolean) as string[]
  )];

  return {
    show,
    titleSponsor: titleSponsor ?? null,
    bannerData,
    sponsorLogoData,
    clubLogoData,
    entryCount: Number(countResult?.[0]?.count ?? 0),
    judges,
    showType,
    showDate,
    closeDateShort,
    hoursToClose,
    status: deriveStatus(show.status, hoursToClose, closeDateShort),
  };
}
