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
  weight: 400 | 600 | 700;
};

/**
 * Read TTF files from public/fonts. Synchronous + node fs because the
 * `new URL('../../...', import.meta.url)` pattern silently breaks under
 * Next 15's prod bundler — that's the bug commit 707c160 fixed for the
 * OG image. Same fix applies here.
 */
export function loadShareImageFonts(): ShareImageFont[] {
  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const readFont = (name: string): ArrayBuffer => {
    const buf = readFileSync(join(fontsDir, name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  };
  return [
    { name: 'Libre Baskerville', data: readFont('libre-baskerville-bold.ttf'), weight: 700 },
    { name: 'Inter', data: readFont('inter-regular.ttf'), weight: 400 },
    { name: 'Inter', data: readFont('inter-semibold.ttf'), weight: 600 },
  ];
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
  if (status === 'entries_open') {
    if (hoursToClose <= 72 && closeDateShort) {
      return { text: `Closing ${closeDateShort}`, bg: '#DC2626', color: '#FAFAF8' };
    }
    return { text: 'Entries Open', bg: '#059669', color: '#FAFAF8' };
  }
  if (status === 'entries_closed') return { text: 'Entries Closed', bg: '#57534E', color: '#FAFAF8' };
  if (status === 'in_progress') return { text: 'Live Today', bg: '#059669', color: '#FAFAF8' };
  if (status === 'completed') return { text: 'Results Published', bg: '#059669', color: '#FAFAF8' };
  if (status === 'published') return { text: 'Coming Soon', bg: '#2563EB', color: '#FAFAF8' };
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
