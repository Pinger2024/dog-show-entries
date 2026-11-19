/**
 * Guard against react-pdf silently dropping an image it can't parse.
 *
 * react-pdf's bundled image reader (`@react-pdf/image`, via `jay-peg` for
 * JPEG) fails to parse some real-world files — and it is NOT predicted by
 * "progressive vs baseline": on the live North East GSD Regional catalogue,
 * six other progressive JPEGs render fine, while the show sponsor's logo
 * and one full-page advert both throw "Unknown version 49664" from
 * `resolveImage()` (confirmed directly against the real files). When that
 * happens react-pdf doesn't error or warn anywhere a caller can see it — it
 * just renders the page without that image. A £-page advert and a paid
 * sponsor's logo have both vanished from real, live documents this way.
 *
 * `resolveImage` (the default export of `@react-pdf/image`) is the EXACT
 * function react-pdf itself calls to decide whether it can embed a given
 * buffer — so it's also the only reliable way to know in advance whether a
 * buffer will render, rather than guessing at which encoding quirk this
 * time's culprit.
 */
import resolveImage from '@react-pdf/image';
import sharp from 'sharp';

/**
 * The exact predicate react-pdf uses to decide whether it can embed an
 * image: true if `@react-pdf/image` can resolve it, false on a throw (a
 * parse failure) or a null/falsy resolve (unrecognised format). Never
 * throws itself.
 */
export async function resolveImageSafely(buffer: Buffer): Promise<boolean> {
  try {
    return !!(await resolveImage(buffer, { cache: false }));
  } catch {
    return false;
  }
}

/**
 * Guarantee a buffer react-pdf can embed, preserving the original bytes
 * whenever possible.
 *
 * If `buffer` already passes react-pdf's own predicate, it's returned
 * completely untouched — zero recompression, so a file that already works
 * keeps its exact print-quality bytes. Only when the predicate fails does
 * this decode (with sharp — libvips, entirely independent of the
 * jay-peg/restructure parser that's failing) and re-encode losslessly as
 * PNG, at FULL resolution: this exists specifically to protect print
 * artwork, where downsampling or lossy recompression to paper over a
 * parser bug would be worse than the bug itself. The re-encoded PNG is
 * then verified against the same predicate before being returned.
 *
 * Returns null — never throws — if sharp can't decode the source, or if
 * even the re-encoded PNG still fails the predicate.
 */
export async function ensurePdfSafeImage(buffer: Buffer): Promise<Buffer | null> {
  if (await resolveImageSafely(buffer)) return buffer;

  try {
    const png = await sharp(buffer).png().toBuffer();
    return (await resolveImageSafely(png)) ? png : null;
  } catch {
    return null;
  }
}
