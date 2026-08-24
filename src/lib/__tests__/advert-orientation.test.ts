import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';

// react-pdf's own image resolver is the embeddability predicate inside
// prepareAdvertsForRender. Tests default to the REAL resolver (sharp-made
// fixtures all resolve); a test sets `impl` to force the rejection path,
// since the JPEGs that genuinely desync jay-peg can't be synthesised.
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

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .jpeg()
    .toBuffer();
}

function stubFetchWith(buf: Buffer) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => buf })),
  );
}

async function dataUriDimensions(uri: string) {
  const base64 = uri.split(',')[1]!;
  const meta = await sharp(Buffer.from(base64, 'base64')).metadata();
  return { width: meta.width!, height: meta.height! };
}

// PNG magic bytes (0x89 0x50 'PN'...) — cheap, synchronous way for a mock
// resolveImage impl to tell "the original/rotated JPEG" apart from "the
// lossless PNG re-encode" without decoding anything.
function isPngBuffer(buf: unknown): boolean {
  return Buffer.isBuffer(buf) && buf[0] === 0x89 && buf[1] === 0x50;
}

/** Rejects any JPEG-shaped buffer (simulating the real jay-peg parser bug)
 *  but accepts PNG — a sharp PNG re-encode never trips it in practice, so
 *  this is a realistic stand-in for "the fallback re-encode succeeds". */
function rejectJpegAcceptPng(buf: unknown) {
  if (isPngBuffer(buf)) return { width: 1, height: 1, data: buf, format: 'png' };
  throw new Error('Unknown version 49664');
}

const ad = (imageUrl: string | null) => ({ id: 'a', imageUrl });

afterEach(() => {
  vi.unstubAllGlobals();
  resolveImageCtl.impl = null;
});

describe('prepareAdvertsForRender', () => {
  it('rotates a landscape advert into a portrait-shaped data URI so it fills a portrait page', async () => {
    stubFetchWith(await png(200, 100)); // landscape
    const [out] = await prepareAdvertsForRender([ad('https://x/a.png')]);
    expect(out.imageUrl).toMatch(/^data:image\/png;base64,/);
    const dims = await dataUriDimensions(out.imageUrl!);
    expect(dims.height).toBeGreaterThan(dims.width); // now portrait
  });

  it('leaves a portrait advert untouched (keeps the original URL)', async () => {
    stubFetchWith(await png(100, 200)); // portrait
    const [out] = await prepareAdvertsForRender([ad('https://x/a.png')]);
    expect(out.imageUrl).toBe('https://x/a.png');
  });

  it('leaves a square advert untouched', async () => {
    stubFetchWith(await png(150, 150));
    const [out] = await prepareAdvertsForRender([ad('https://x/a.png')]);
    expect(out.imageUrl).toBe('https://x/a.png');
  });

  it('leaves an advert with no image URL untouched', async () => {
    const [out] = await prepareAdvertsForRender([ad(null)]);
    expect(out.imageUrl).toBeNull();
  });

  it('falls back to the original URL when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const [out] = await prepareAdvertsForRender([ad('https://x/a.png')]);
    expect(out.imageUrl).toBe('https://x/a.png');
  });

  it('falls back to the original URL on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => Buffer.alloc(0) })));
    const [out] = await prepareAdvertsForRender([ad('https://x/a.png')]);
    expect(out.imageUrl).toBe('https://x/a.png');
  });

  it('re-encodes a portrait advert react-pdf cannot embed into a same-size lossless PNG data URI', async () => {
    // The real defect: react-pdf's resolver rejects certain JPEGs (e.g. the
    // NE Regional's page-29 advert, "Unknown version 49664") and then
    // silently renders the page with the image absent — a blank page in a
    // printed catalogue.
    stubFetchWith(await jpeg(100, 200)); // portrait — would pass through as a URL
    resolveImageCtl.impl = rejectJpegAcceptPng;
    const [out] = await prepareAdvertsForRender([ad('https://x/a.jpg')]);
    expect(out.imageUrl).toMatch(/^data:image\/png;base64,/);
    const dims = await dataUriDimensions(out.imageUrl!);
    expect(dims).toEqual({ width: 100, height: 200 }); // full resolution, never downsampled
  });

  it('falls back to the original advert when the rejected file cannot be re-encoded either', async () => {
    stubFetchWith(Buffer.from('not an image at all'));
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    const [out] = await prepareAdvertsForRender([ad('https://x/a.jpg')]);
    expect(out.imageUrl).toBe('https://x/a.jpg');
  });

  it('falls back to the original advert when even the lossless PNG re-encode is rejected', async () => {
    // Belt and braces: the PNG fallback itself is verified against the same
    // predicate before being trusted, not assumed to always work.
    stubFetchWith(await jpeg(100, 200)); // portrait, decodes fine — just always rejected
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    const [out] = await prepareAdvertsForRender([ad('https://x/a.jpg')]);
    expect(out.imageUrl).toBe('https://x/a.jpg');
  });

  it('re-encodes a landscape advert react-pdf cannot embed (even after rotation) into a lossless PNG', async () => {
    stubFetchWith(await jpeg(200, 100)); // landscape
    resolveImageCtl.impl = rejectJpegAcceptPng;
    const [out] = await prepareAdvertsForRender([ad('https://x/a.jpg')]);
    expect(out.imageUrl).toMatch(/^data:image\/png;base64,/);
    const dims = await dataUriDimensions(out.imageUrl!);
    expect(dims).toEqual({ width: 100, height: 200 }); // rotated into portrait, full resolution
  });

  it('falls back to the original advert when a landscape advert is rejected even after every re-encode', async () => {
    stubFetchWith(await jpeg(200, 100)); // landscape
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    const [out] = await prepareAdvertsForRender([ad('https://x/a.jpg')]);
    expect(out.imageUrl).toBe('https://x/a.jpg');
  });

  it('preserves other advert fields', async () => {
    stubFetchWith(await png(200, 100));
    const [out] = await prepareAdvertsForRender([{ id: 'x1', position: 'inside_front', imageUrl: 'https://x/a.png', sortOrder: 3 }]);
    expect(out.id).toBe('x1');
    expect(out.position).toBe('inside_front');
    expect(out.sortOrder).toBe(3);
  });
});
