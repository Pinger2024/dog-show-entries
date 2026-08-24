/**
 * Guarded fetch for club-supplied image URLs (logos).
 *
 * `organisations.logo_url` is written by `secretary.updateOrganisation`,
 * whose input is only `z.string().url()` — so any org member can point it at
 * an arbitrary host. Every server-side `fetch()` of that value is therefore
 * an SSRF sink: without a guard a secretary could aim it at cloud metadata
 * (169.254.169.254), a loopback admin port, or anything else inside our
 * network, and use timing or error differences to probe it.
 *
 * In practice every real logo lives on our own R2 public bucket (that's
 * where the upload flow puts them), so the primary control is an allowlist
 * of `R2_PUBLIC_URL`'s host. Anything else still has to survive the general
 * checks below, which keeps older rows and other environments working
 * without punching a hole.
 *
 * Residual risk, accepted knowingly: DNS rebinding between our lookup and
 * the socket connect. Closing that needs a custom agent pinned to the
 * resolved address; the allowlist path (where all current data sits) is not
 * affected by it, and the fallback path additionally refuses redirects and
 * caps the response, so the exposure is a single unfollowed request to a
 * host that resolved public at check time.
 */
import { lookup } from 'dns/promises';
import net from 'net';
import sharp from 'sharp';
import { resolveImageSafely } from './pdf-safe-image';

/** Logos are small; anything larger is not a club badge. */
const MAX_BYTES = 8 * 1024 * 1024;

function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** Loopback, link-local (incl. cloud metadata), RFC1918, CGNAT, ULA, unspecified. */
export function isBlockedAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const n = ipv4ToLong(ip);
    const inRange = (cidr: string, bits: number) => n >>> (32 - bits) === ipv4ToLong(cidr) >>> (32 - bits);
    return (
      inRange('0.0.0.0', 8) ||        // "this host"
      inRange('10.0.0.0', 8) ||       // RFC1918
      inRange('127.0.0.0', 8) ||      // loopback
      inRange('169.254.0.0', 16) ||   // link-local — AWS/GCP metadata
      inRange('172.16.0.0', 12) ||    // RFC1918
      inRange('192.168.0.0', 16) ||   // RFC1918
      inRange('100.64.0.0', 10) ||    // CGNAT
      inRange('192.0.0.0', 24) ||     // IETF protocol assignments
      inRange('224.0.0.0', 4)         // multicast
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
        lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;   // fc00::/7 ULA
    // IPv4-mapped (::ffff:127.0.0.1) — judge on the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // not an IP at all — caller shouldn't have got here
}

function allowlistedHost(url: URL): boolean {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return false;
  try {
    return new URL(base).host === url.host;
  } catch {
    return false;
  }
}

/**
 * Fetch a club-supplied image, or return null. NEVER throws and never
 * reports why to the caller — a logo is decoration, and a failure must
 * degrade to "no logo" rather than cost a secretary her document.
 */
export async function fetchClubImage(rawUrl: string): Promise<Buffer | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  // Our own bucket skips the network checks — it is the only place the
  // upload flow ever writes, and it is a known-good public host.
  if (!allowlistedHost(url)) {
    if (url.protocol !== 'https:') return null;

    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
      if (isBlockedAddress(host)) return null;
    } else {
      try {
        const resolved = await lookup(host, { all: true });
        if (resolved.length === 0) return null;
        if (resolved.some((r) => isBlockedAddress(r.address))) return null;
      } catch {
        return null;
      }
    }
  }

  try {
    // Redirects are refused rather than re-validated: a 302 to an internal
    // address is the classic bypass, and no legitimate logo needs one.
    const res = await fetch(url, { redirect: 'manual' });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Nothing on a catalogue/schedule page displays a logo larger than this —
 *  plenty of headroom over the ~130×46pt the sponsor billing block prints
 *  at, even at print resolution. Also caps how much any one club/sponsor
 *  image can bloat the PDF. */
const MAX_LOGO_DIMENSIONS = { width: 1300, height: 460 } as const;

/**
 * Fetch a club/sponsor-supplied image, resized for display, AND verified
 * against the exact predicate react-pdf itself uses to decide whether it
 * can embed a buffer.
 *
 * react-pdf's bundled image reader can silently fail to parse some
 * real-world files — confirmed directly against a real sponsor logo — with
 * no error surfaced anywhere; the image just doesn't appear. It is NOT
 * simply "progressive JPEGs are unsafe": see `pdf-safe-image.ts` for the
 * full story and the `resolveImage`-based predicate this relies on. Any
 * caller that hands react-pdf a fetched sponsor/club image for DISPLAY
 * (not just format/SSRF-validated, as `validateRasterLogoUrl` does
 * elsewhere) should go through here rather than `fetchClubImage()`
 * directly.
 *
 * Unlike `ensurePdfSafeImage()` (which preserves original bytes whenever
 * possible — built for print artwork that must never be downsampled),
 * this ALWAYS resizes and re-encodes: sponsor logos here render at a small
 * fixed display size (~130×46pt), so there's no "untouched original" to
 * preserve. EXIF-rotates, resizes to fit `MAX_LOGO_DIMENSIONS` without
 * ever enlarging a smaller source, and encodes PNG when the source has an
 * alpha channel (so transparency survives — sharp's JPEG encoder has no
 * alpha support and would otherwise flatten it to black) or baseline JPEG
 * quality 90 otherwise. The result is verified with `resolveImageSafely()`
 * before being returned; even a fresh sharp re-encode can — rarely — still
 * fail the predicate, so this is the final gate, not a rubber stamp.
 *
 * Returns null — never throws — on a blocked/failed fetch, a sharp decode
 * failure, or a result that still fails the predicate. A logo is
 * decoration: callers must degrade to a text-only fallback rather than
 * fail a secretary's document over it.
 */
export async function fetchPdfSafeImage(rawUrl: string): Promise<Buffer | null> {
  const raw = await fetchClubImage(rawUrl);
  if (!raw) return null;

  try {
    const { hasAlpha } = await sharp(raw).metadata();
    const pipeline = sharp(raw)
      .rotate()
      .resize({ ...MAX_LOGO_DIMENSIONS, fit: 'inside', withoutEnlargement: true });

    const candidate = hasAlpha
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg({ quality: 90 }).toBuffer();

    return (await resolveImageSafely(candidate)) ? candidate : null;
  } catch {
    return null;
  }
}
