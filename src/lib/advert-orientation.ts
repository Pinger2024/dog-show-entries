import sharp from 'sharp';
import resolveImage from '@react-pdf/image';

// A landscape advert rotated 90° anticlockwise puts its top edge on the LEFT of
// the portrait page, so the reader turns the booklet clockwise to read it — the
// usual convention for landscape adverts in a portrait-bound programme.
const ROTATE_LANDSCAPE_DEG = 270;

/**
 * Can react-pdf actually embed these bytes? Its bundled JPEG reader rejects
 * some real-world JPEGs (e.g. "Unknown version 49664") and the renderer then
 * silently drops the image — the page still renders, just blank. Asking its
 * own resolver is the only reliable predicate: progressive-ness alone isn't
 * it (most progressive JPEGs embed fine).
 */
async function reactPdfCanEmbed(buffer: Buffer): Promise<boolean> {
  try {
    return Boolean(await resolveImage(buffer, { cache: false }));
  } catch {
    return false;
  }
}

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
    try {
      const res = await fetch(ad.imageUrl);
      if (!res.ok) return ad;
      const buf = Buffer.from(await res.arrayBuffer());
      // Apply any EXIF orientation first so we measure/rotate the displayed image.
      const oriented = await sharp(buf).rotate().toBuffer();
      const meta = await sharp(oriented).metadata();
      if (!meta.width || !meta.height || meta.width <= meta.height) {
        // Portrait or square — the original URL is normally used untouched,
        // but only if react-pdf can actually embed those bytes; otherwise
        // re-encode the SAME pixels as a full-resolution PNG (lossless —
        // print artwork is never downsampled or recompressed lossily here).
        if (await reactPdfCanEmbed(buf)) {
          return ad;
        }
        const safe = await sharp(oriented).png().toBuffer();
        return { ...ad, imageUrl: `data:image/png;base64,${safe.toString('base64')}` };
      }
      const format = meta.format === 'jpeg' ? 'jpeg' : 'png';
      const rotated = await sharp(oriented)
        .rotate(ROTATE_LANDSCAPE_DEG)
        .toFormat(format)
        .toBuffer();
      const dataUri = `data:image/${format};base64,${rotated.toString('base64')}`;
      return { ...ad, imageUrl: dataUri };
    } catch {
      return ad;
    }
  }));
}
