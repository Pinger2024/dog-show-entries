/**
 * Locally-generated placeholder artwork for catalogue adverts.
 *
 * A golden-document fixture never stores a real advert's image bytes (an
 * advertiser's artwork isn't ours to redistribute in a committed test
 * fixture, and fetching it over the network at test time would make the
 * golden test flaky and prod-dependent). export-show-fixture-core.ts records
 * only each advert's pixel dimensions; this module turns those dimensions
 * back into a real, renderable image — same aspect ratio, so portrait vs
 * landscape advert-orientation logic (advert-orientation.ts) still exercises
 * the same code path a real advert would.
 */
import sharp from 'sharp';

/**
 * A flat-colour PNG of exactly `width`x`height`, returned as a `data:` URI.
 * Catalogue rendering (prepareAdvertsForRender in advert-orientation.ts)
 * leaves an already-`data:` advert imageUrl untouched — no network fetch,
 * no rotation — so this can be dropped straight into a loaded fixture's
 * `catalogueAdverts[].imageUrl` and render exactly as a real advert would,
 * pixel-dimension-wise.
 *
 * The colour is derived from `seedLabel` (deterministic, not random) purely
 * so different placeholder adverts in the same document are visually
 * distinguishable in a rendered proof/screenshot — it has no effect on the
 * golden test's pass/fail, which compares text geometry, not colour.
 */
export async function buildPlaceholderAdvertDataUri(
  width: number,
  height: number,
  seedLabel: string,
): Promise<string> {
  const hue = [...seedLabel].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
  const { r, g, b } = hslToRgb(hue, 0.45, 0.55);
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const png = await sharp({
    create: {
      width: safeWidth,
      height: safeHeight,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/** Probe a remote/storage image URL for its pixel dimensions without
 *  persisting the bytes anywhere — used only by the export script (never
 *  run against prod by this agent; the team lead runs it). Falls back to a
 *  conservative A4-ish portrait guess if the fetch or decode fails, so one
 *  broken advert URL never aborts a whole show export. */
export async function probeImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  const fallback = { width: 1000, height: 1400 };
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return fallback;
    return { width: meta.width, height: meta.height };
  } catch {
    return fallback;
  }
}
