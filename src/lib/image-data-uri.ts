/**
 * Build a `data:` URI for a fetched image, sniffing the real format from its
 * magic bytes. Satori (next/og ImageResponse) picks its decoder from the MIME,
 * so a JPEG served as `image/png` silently fails to render — the club logo came
 * out as an empty circle on the share poster because club logos are often
 * uploaded as .jpg (Mandy 2026-07-14). Covers PNG / JPEG / GIF / WEBP; anything
 * unrecognised falls back to PNG (Satori's most tolerant decoder).
 *
 * Pure (no `server-only`) so it's unit-testable; re-exported from
 * `share-image-data` for the ImageResponse routes.
 */
export function toImageDataUri(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf.slice(0, 12));
  let mime = 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) mime = 'image/jpeg';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = 'image/gif';
  else if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) mime = 'image/webp';
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}
