import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { detectAdvertOrientation } from '@/lib/advert-orientation';

// Generate a solid PNG of the given dimensions to exercise the real sharp path.
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

afterEach(() => vi.unstubAllGlobals());

describe('detectAdvertOrientation', () => {
  it('returns landscape when the image is wider than it is tall', async () => {
    stubFetchWith(await png(200, 100));
    expect(await detectAdvertOrientation('https://x/a.png')).toBe('landscape');
  });

  it('returns portrait when the image is taller than it is wide', async () => {
    stubFetchWith(await png(100, 200));
    expect(await detectAdvertOrientation('https://x/a.png')).toBe('portrait');
  });

  it('treats a square image as portrait (not wider than tall)', async () => {
    stubFetchWith(await png(150, 150));
    expect(await detectAdvertOrientation('https://x/a.png')).toBe('portrait');
  });

  it('falls back to portrait when there is no image URL', async () => {
    expect(await detectAdvertOrientation(null)).toBe('portrait');
  });

  it('falls back to portrait when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await detectAdvertOrientation('https://x/a.png')).toBe('portrait');
  });

  it('falls back to portrait on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => Buffer.alloc(0) })));
    expect(await detectAdvertOrientation('https://x/a.png')).toBe('portrait');
  });
});
