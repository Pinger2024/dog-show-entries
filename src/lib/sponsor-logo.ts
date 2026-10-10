/**
 * What a PDF renderer draws for a sponsor's logo — the ONE rule every
 * catalogue and schedule renderer uses.
 *
 * Render paths prepare each logo first (`withPreparedSponsorLogos`,
 * safe-image-fetch.ts): fetched through the SSRF guard, cropped to its
 * visible content, and checked to embed. When that ran, `logoBuffer` is the
 * answer — the prepared image, or null when preparing it failed, in which case
 * the renderer shows the sponsor's name alone (a bare URL would hand react-pdf
 * an unguarded fetch, and react-pdf silently drops images it can't read).
 * Only a path that never prepared logos (`logoBuffer` undefined) falls back to
 * the uploaded file's URL.
 */
export function sponsorLogoSrc(sponsor: {
  logoUrl?: string | null;
  logoBuffer?: Buffer | null;
}): string | null {
  // react-pdf's <Image src> takes a Buffer as well as a URL; its type says string.
  if (sponsor.logoBuffer !== undefined) return sponsor.logoBuffer as unknown as string | null;
  return sponsor.logoUrl ?? null;
}
