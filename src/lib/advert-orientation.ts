import sharp from 'sharp';

// A landscape advert rotated 90° anticlockwise puts its top edge on the LEFT of
// the portrait page, so the reader turns the booklet clockwise to read it — the
// usual convention for landscape adverts in a portrait-bound programme.
const ROTATE_LANDSCAPE_DEG = 270;

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
        return ad; // portrait or square — leave as-is
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
