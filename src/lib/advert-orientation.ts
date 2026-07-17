import sharp from 'sharp';

export type AdvertOrientation = 'portrait' | 'landscape';

/**
 * Measure a catalogue/schedule advert image and decide whether its page should
 * be portrait or landscape. Adverts render on a full A5 page; a landscape image
 * on a portrait page leaves white bands top and bottom, so we flip the page to
 * landscape when the artwork is wider than it is tall — letting it fill the page.
 *
 * Fetches the image and reads its dimensions via sharp (EXIF orientation
 * accounted for). Any failure (missing URL, network, unreadable image) falls
 * back to 'portrait' — the previous, safe default.
 */
export async function detectAdvertOrientation(
  imageUrl: string | null | undefined,
): Promise<AdvertOrientation> {
  if (!imageUrl) return 'portrait';
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return 'portrait';
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    let width = meta.width;
    let height = meta.height;
    if (!width || !height) return 'portrait';
    // EXIF orientations 5–8 rotate the image 90°, swapping display dimensions.
    if (meta.orientation && meta.orientation >= 5) {
      [width, height] = [height, width];
    }
    return width > height ? 'landscape' : 'portrait';
  } catch {
    return 'portrait';
  }
}

/**
 * Annotate a list of adverts with an `orientation`, measuring each image's
 * shape in parallel. Preserves every other field on each advert.
 */
export async function annotateAdvertOrientations<T extends { imageUrl: string | null }>(
  adverts: T[],
): Promise<Array<T & { orientation: AdvertOrientation }>> {
  return Promise.all(
    adverts.map(async (ad) => ({
      ...ad,
      orientation: await detectAdvertOrientation(ad.imageUrl),
    })),
  );
}
