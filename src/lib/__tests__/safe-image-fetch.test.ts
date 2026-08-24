import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import sharp from 'sharp';
import React from 'react';
import { Document, Page, Image, renderToBuffer } from '@react-pdf/renderer';
import { isBlockedAddress, fetchClubImage, fetchPdfSafeImage } from '@/lib/safe-image-fetch';

// react-pdf's own image resolver is the embeddability predicate
// fetchPdfSafeImage verifies its output against (see pdf-safe-image.ts).
// Tests default to the REAL resolver (sharp-made fixtures all resolve); a
// test sets `resolveImageCtl.impl` to force the rejection path, matching
// the pattern in advert-orientation.test.ts.
const resolveImageCtl = vi.hoisted(
  () => ({ impl: null as null | ((...args: unknown[]) => unknown) }),
);
vi.mock('@react-pdf/image', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@react-pdf/image')>();
  return {
    ...orig,
    default: (...args: unknown[]) =>
      resolveImageCtl.impl
        ? resolveImageCtl.impl(...args)
        : (orig.default as (...a: unknown[]) => unknown)(...args),
  };
});

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['10.1.2.3', 'RFC1918 /8'],
    ['172.16.5.4', 'RFC1918 /12'],
    ['192.168.0.10', 'RFC1918 /16'],
    ['0.0.0.0', 'unspecified'],
    ['100.64.1.1', 'CGNAT'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 ULA'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([['1.1.1.1'], ['93.184.216.34'], ['2606:4700::1111']])(
    'allows public address %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  );
});

describe('fetchClubImage — refuses to make the request at all', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-example.r2.dev');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://127.0.0.1:6379/', 'loopback service'],
    ['https://127.0.0.1/logo.png', 'loopback over https'],
    ['https://10.0.0.5/logo.png', 'internal RFC1918 host'],
    ['https://[::1]/logo.png', 'IPv6 loopback'],
    ['file:///etc/passwd', 'non-http scheme'],
    ['not-a-url', 'unparseable'],
  ])('returns null for %s (%s) without fetching', async (url) => {
    await expect(fetchClubImage(url)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downgrades a non-allowlisted plain-http host rather than fetching it', async () => {
    await expect(fetchClubImage('http://example.com/logo.png')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fetchClubImage — response handling', () => {
  const fetchSpy = vi.fn();
  const ALLOWED = 'https://pub-example.r2.dev/uploads/logo.png';

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-example.r2.dev');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const reply = (body: Buffer, headers: Record<string, string>, ok = true, status = 200) => ({
    ok,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });

  it('returns the bytes for a genuine image on our own bucket', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fetchSpy.mockResolvedValue(reply(png, { 'content-type': 'image/png', 'content-length': '4' }));
    await expect(fetchClubImage(ALLOWED)).resolves.toEqual(png);
  });

  it('refuses to follow redirects', async () => {
    fetchSpy.mockResolvedValue(
      reply(Buffer.alloc(0), { location: 'http://169.254.169.254/' }, false, 302)
    );
    await expect(fetchClubImage(ALLOWED)).resolves.toBeNull();
    // redirect: 'manual' means we never auto-followed it
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('rejects a non-image content type (an HTML error page, or JSON metadata)', async () => {
    fetchSpy.mockResolvedValue(
      reply(Buffer.from('{"secret":1}'), { 'content-type': 'application/json' })
    );
    await expect(fetchClubImage(ALLOWED)).resolves.toBeNull();
  });

  it('rejects an oversized image by its declared length', async () => {
    fetchSpy.mockResolvedValue(
      reply(Buffer.from([1]), { 'content-type': 'image/png', 'content-length': String(50 * 1024 * 1024) })
    );
    await expect(fetchClubImage(ALLOWED)).resolves.toBeNull();
  });

  it('never throws — a network failure is just no logo', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchClubImage(ALLOWED)).resolves.toBeNull();
  });
});

// fetchPdfSafeImage — react-pdf's bundled image reader can silently fail to
// parse some real-world files with no error surfaced anywhere (confirmed
// directly against the real North East GSD Regional show-sponsor logo,
// "Unknown version 49664" from resolveImage() — see pdf-safe-image.ts for
// why "progressive JPEG" alone is NOT the actual discriminator). The
// billing block itself rendered correctly; only the logo silently vanished
// (Mandy/Michael, 2026-08-24). fetchPdfSafeImage() resizes + re-encodes
// through sharp for display, then verifies the result against react-pdf's
// own resolveImage predicate before returning it.
describe('fetchPdfSafeImage — normalises fetched images for react-pdf (Mandy catalogue, 2026-08-24)', () => {
  const fetchSpy = vi.fn();
  const ALLOWED = 'https://pub-example.r2.dev/uploads/sponsor-logo.jpg';

  beforeAll(async () => {
    // react-pdf's layout engine (yoga-layout) lazy-loads its WASM binary via
    // a `fetch()` of its own on first use. If that first use happens while
    // a test below has global `fetch` stubbed, our mock response (image
    // bytes, not WASM) gets fed to WebAssembly.instantiate and blows up
    // with an unrelated "expected magic word" error. Render once here,
    // before any test in this block stubs fetch, so yoga is warm.
    await renderToBuffer(
      React.createElement(Document, null, React.createElement(Page, { size: 'A5' })) as never,
    );
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-example.r2.dev');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resolveImageCtl.impl = null;
  });

  const replyImage = (body: Buffer, contentType: string) => ({
    ok: true,
    status: 200,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'content-type' ? contentType
        : k.toLowerCase() === 'content-length' ? String(body.length)
        : null,
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });

  // 800×300 noise, not a flat colour — a solid-colour source can round-trip
  // through progressive encoding too cleanly (too few real scan passes) to
  // exercise the same code path a real photographic sponsor logo would.
  async function progressiveJpegFixture(width = 800, height = 300): Promise<Buffer> {
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
    return sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ progressive: true, quality: 85 })
      .toBuffer();
  }

  // Renders the given buffer as the only content of a real (unmocked)
  // react-pdf document and compares its size against an empty control page
  // — a dropped/failed image leaves the page at roughly PDF-scaffolding
  // size, while a genuinely embedded image adds its own compressed bytes.
  async function pdfHasEmbeddedImage(imageBuffer: Buffer): Promise<boolean> {
    const emptyPdf = await renderToBuffer(
      React.createElement(Document, null, React.createElement(Page, { size: 'A5' })) as never,
    );
    const withImagePdf = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(Page, { size: 'A5' }, React.createElement(Image, { src: imageBuffer as unknown as string })),
      ) as never,
    );
    return withImagePdf.length > emptyPdf.length + 500;
  }

  it('re-encodes a progressive JPEG to baseline', async () => {
    const progressive = await progressiveJpegFixture();
    // Precondition — the fixture really is progressive, not a fluke of the
    // encoder settings, so the test below is meaningful.
    expect((await sharp(progressive).metadata()).isProgressive).toBe(true);

    fetchSpy.mockResolvedValue(replyImage(progressive, 'image/jpeg'));
    const safe = await fetchPdfSafeImage(ALLOWED);
    expect(safe).not.toBeNull();

    const meta = await sharp(safe!).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.isProgressive).toBe(false);
  });

  it('the normalised buffer renders as a real embedded image via react-pdf', async () => {
    const progressive = await progressiveJpegFixture();
    fetchSpy.mockResolvedValue(replyImage(progressive, 'image/jpeg'));
    const safe = await fetchPdfSafeImage(ALLOWED);
    expect(safe).not.toBeNull();
    await expect(pdfHasEmbeddedImage(safe!)).resolves.toBe(true);
  });

  it('preserves transparency by emitting PNG when the source has an alpha channel', async () => {
    const rgba = await sharp({
      create: { width: 120, height: 60, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 0 } },
    }).png().toBuffer();

    fetchSpy.mockResolvedValue(replyImage(rgba, 'image/png'));
    const safe = await fetchPdfSafeImage(ALLOWED);
    expect(safe).not.toBeNull();

    const meta = await sharp(safe!).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
  });

  it('downsizes an oversized source to fit within bounds, without upscaling a smaller one', async () => {
    const huge = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: { r: 5, g: 5, b: 5 } },
    }).jpeg().toBuffer();
    fetchSpy.mockResolvedValue(replyImage(huge, 'image/jpeg'));
    const safeHuge = await fetchPdfSafeImage(ALLOWED);
    const hugeMeta = await sharp(safeHuge!).metadata();
    expect(hugeMeta.width).toBeLessThanOrEqual(1300);
    expect(hugeMeta.height).toBeLessThanOrEqual(460);

    const tiny = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 5, g: 5, b: 5 } },
    }).jpeg().toBuffer();
    fetchSpy.mockResolvedValue(replyImage(tiny, 'image/jpeg'));
    const safeTiny = await fetchPdfSafeImage(ALLOWED);
    const tinyMeta = await sharp(safeTiny!).metadata();
    expect(tinyMeta.width).toBe(40);
    expect(tinyMeta.height).toBe(20);
  });

  it('degrades to null (never throws) when the fetched bytes are not a decodable image', async () => {
    fetchSpy.mockResolvedValue(replyImage(Buffer.from('not an image, just text'), 'image/jpeg'));
    await expect(fetchPdfSafeImage(ALLOWED)).resolves.toBeNull();
  });

  it('delegates the SSRF guard to fetchClubImage — a blocked host is refused before any fetch', async () => {
    await expect(fetchPdfSafeImage('https://10.0.0.5/logo.png')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null (belt and braces) when react-pdf would still reject the resized/re-encoded candidate', async () => {
    // Even a fresh sharp re-encode can, in principle, still fail react-pdf's
    // own resolver — this is the final gate, not a rubber stamp. Force that
    // rejection and confirm the sponsor billing block gets nothing to
    // render rather than a logo that silently vanishes anyway.
    const progressive = await progressiveJpegFixture();
    fetchSpy.mockResolvedValue(replyImage(progressive, 'image/jpeg'));
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    await expect(fetchPdfSafeImage(ALLOWED)).resolves.toBeNull();
  });
});
