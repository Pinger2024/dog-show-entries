import sharp from 'sharp';
// Can react-pdf actually embed a given buffer? Its bundled JPEG reader
// rejects some real-world JPEGs (e.g. "Unknown version 49664") and the
// renderer then silently drops the image — the page still renders, just
// blank. resolveImageSafely() asks react-pdf's own resolver, the only
// reliable predicate (progressive-ness alone isn't it — most progressive
// JPEGs embed fine). Shared with fetchPdfSafeImage() (safe-image-fetch.ts),
// which runs the same check on the sponsor-logo path — see pdf-safe-image.ts.
import { resolveImageSafely } from './pdf-safe-image';
// `catalogueAdverts.imageUrl` is secretary-supplied (uploaded via the same
// presigned-upload flow as club logos), so it's the same SSRF sink
// fetchClubImage() exists to close — an unguarded `fetch()` here could be
// aimed at cloud metadata or an internal host exactly like an org logo
// could. Print advert artwork legitimately runs bigger than a club logo,
// so this path overrides fetchClubImage's default 8 MB cap.
import { fetchClubImage } from './safe-image-fetch';

// A landscape advert rotated 90° anticlockwise puts its top edge on the LEFT of
// the portrait page, so the reader turns the booklet clockwise to read it — the
// usual convention for landscape adverts in a portrait-bound programme.
const ROTATE_LANDSCAPE_DEG = 270;

/** Full-page A5 print artwork can legitimately run well past a club logo's
 *  size — 40 MB gives generous headroom over any real advert on file while
 *  still bounding the worst case (this runs in the render WORKER process
 *  now, not the web process, but it still shouldn't be unbounded). Never
 *  compressed or downscaled — founder rule: never compress print. */
const ADVERT_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Prepare catalogue/schedule adverts for rendering. Catalogues print as uniform
 * A5-PORTRAIT booklets, so a LANDSCAPE advert can't sit on a landscape page
 * (that page would be a different size and wouldn't bind). Instead we rotate the
 * artwork 90° into a portrait-shaped image (returned as a data URI) that fills a
 * portrait A5 page — the reader turns the booklet to view it, and every page
 * stays the same size.
 *
 * Portrait/square adverts pass through untouched (their original URL is used).
 * Any failure (no URL, network, unreadable image) falls back to the original
 * image unchanged — the previous, safe behaviour.
 */
export async function prepareAdvertsForRender<T extends { imageUrl: string | null }>(
  adverts: T[],
): Promise<T[]> {
  return Promise.all(adverts.map(async (ad) => {
    if (!ad.imageUrl) return ad;
    // Backward compat: a document-render job enqueued before this render
    // step moved out of buildCatalogueSnapshot (2026-08-27) may still carry
    // a pre-rotated `data:` URI baked in at snapshot-build time — the OLD
    // behaviour. It's already render-ready; nothing to fetch or re-rotate,
    // and fetchClubImage would reject the `data:` scheme anyway.
    if (ad.imageUrl.startsWith('data:')) return ad;
    try {
      const buf = await fetchClubImage(ad.imageUrl, { maxBytes: ADVERT_MAX_BYTES });
      if (!buf) return ad;
      // Apply any EXIF orientation first so we measure/rotate the displayed image.
      const oriented = await sharp(buf).rotate().toBuffer();
      const meta = await sharp(oriented).metadata();
      if (!meta.width || !meta.height || meta.width <= meta.height) {
        // Portrait or square — the original URL is normally used untouched,
        // but only if react-pdf can actually embed those bytes; otherwise
        // re-encode the SAME pixels as a full-resolution PNG (lossless —
        // print artwork is never downsampled or recompressed lossily here).
        if (await resolveImageSafely(buf)) {
          return ad;
        }
        const safe = await sharp(oriented).png().toBuffer();
        return (await resolveImageSafely(safe))
          ? { ...ad, imageUrl: `data:image/png;base64,${safe.toString('base64')}` }
          : ad;
      }
      const format = meta.format === 'jpeg' ? 'jpeg' : 'png';
      const rotated = await sharp(oriented)
        .rotate(ROTATE_LANDSCAPE_DEG)
        .toFormat(format)
        .toBuffer();
      // Landscape artwork is always re-encoded through sharp for the
      // rotation, which in practice already produces a file react-pdf can
      // read — but verify anyway (belt and braces, same predicate as
      // above) rather than assume, and fall back to a fully lossless PNG
      // of the same rotated pixels if even that re-encode is rejected.
      if (await resolveImageSafely(rotated)) {
        return { ...ad, imageUrl: `data:image/${format};base64,${rotated.toString('base64')}` };
      }
      const losslessRotated = await sharp(oriented).rotate(ROTATE_LANDSCAPE_DEG).png().toBuffer();
      return (await resolveImageSafely(losslessRotated))
        ? { ...ad, imageUrl: `data:image/png;base64,${losslessRotated.toString('base64')}` }
        : ad;
    } catch {
      return ad;
    }
  }));
}
