import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
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

const ad = (imageUrl: string | null) => ({ id: 'a', imageUrl });

afterEach(() => vi.unstubAllGlobals());

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

  it('preserves other advert fields', async () => {
    stubFetchWith(await png(200, 100));
    const [out] = await prepareAdvertsForRender([{ id: 'x1', position: 'inside_front', imageUrl: 'https://x/a.png', sortOrder: 3 }]);
    expect(out.id).toBe('x1');
    expect(out.position).toBe('inside_front');
    expect(out.sortOrder).toBe(3);
  });
});
