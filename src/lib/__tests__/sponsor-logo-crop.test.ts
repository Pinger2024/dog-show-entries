/**
 * Mandy, North Eastern catalogue (29 Sept 2026): "why is the logo so small?"
 * CSJ's logo in the "With grateful thanks to" box printed about 5mm wide.
 * Two causes: the uploaded PNG was 449×384 with the logo in a 347×115 strip
 * (the rest empty, plus a 19%-opacity speck in the corner), and supporter
 * logos only got a 30×15pt box. Renderers size a logo by its whole canvas,
 * so every logo uploaded with empty space around it printed small.
 *
 * Fixed once: fetchPdfSafeImage crops to the visible content, every render
 * path prepares every sponsor's logo (withPreparedSponsorLogos), and every
 * renderer reads it through sponsorLogoSrc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchPdfSafeImage, cropToVisibleContent } from '@/lib/safe-image-fetch';
import { hydrateSnapshotForRender } from '@/server/services/catalogue-snapshot';
import { sponsorLogoSrc } from '@/lib/sponsor-logo';

const ALLOWED = 'https://pub-example.r2.dev/uploads/sponsor-logo.png';

/** A transparent canvas with a solid logo in the bottom-right corner and a
 *  faint speck top-left — the shape of CSJ's real upload. */
async function paddedTransparentLogo(): Promise<Buffer> {
  const w = 400;
  const h = 300;
  const px = Buffer.alloc(w * h * 4); // fully transparent
  const paint = (x0: number, y0: number, x1: number, y1: number, rgba: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(rgba, (y * w + x) * 4);
  };
  paint(250, 200, 390, 290, [40, 120, 40, 255]); // the logo, 140×90
  paint(2, 2, 4, 4, [0, 0, 0, 49]); // near-invisible speck
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** An opaque logo on white paper with wide margins. */
async function whiteMarginLogo(): Promise<Buffer> {
  return sharp({ create: { width: 500, height: 400, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 200, height: 60, channels: 3, background: '#1a4d8f' } }, left: 150, top: 170 }])
    .png()
    .toBuffer();
}

const dims = async (b: Buffer) => {
  const m = await sharp(b).metadata();
  return { w: m.width!, h: m.height! };
};

describe('cropToVisibleContent', () => {
  it('crops a transparent canvas to its solid logo, ignoring a faint speck', async () => {
    const d = await dims(await cropToVisibleContent(await paddedTransparentLogo()));
    expect(d.w).toBeLessThanOrEqual(150); // 140 + a small margin
    expect(d.h).toBeLessThanOrEqual(100); // 90 + a small margin
    expect(d.w).toBeGreaterThanOrEqual(140);
  });

  it('crops white paper off an opaque logo', async () => {
    const d = await dims(await cropToVisibleContent(await whiteMarginLogo()));
    expect(d.w).toBeLessThanOrEqual(210);
    expect(d.h).toBeLessThanOrEqual(70);
  });

  it('leaves a full-bleed logo and an empty image alone', async () => {
    const full = await sharp({ create: { width: 120, height: 40, channels: 3, background: '#aa2222' } }).png().toBuffer();
    expect(await cropToVisibleContent(full)).toBe(full);
    const empty = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect(await cropToVisibleContent(empty)).toBe(empty);
  });
});

describe('the PDF-ready sponsor logo is cropped, for every tier', () => {
  const fetchSpy = vi.fn();
  const reply = (body: Buffer) => ({
    ok: true,
    status: 200,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'content-type' ? 'image/png'
        : k.toLowerCase() === 'content-length' ? String(body.length)
        : null,
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-example.r2.dev');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetchPdfSafeImage returns the logo, not the empty canvas around it', async () => {
    fetchSpy.mockResolvedValue(reply(await paddedTransparentLogo()));
    const safe = await fetchPdfSafeImage(ALLOWED);
    expect(safe).not.toBeNull();
    const d = await dims(safe!);
    expect(d.w / d.h).toBeGreaterThan(1.4); // the 140×90 logo's shape, not the 4:3 canvas
    expect(d.w).toBeLessThanOrEqual(150);
  });

  it('the catalogue prepares a supporter-tier logo too, not only the show sponsor', async () => {
    fetchSpy.mockImplementation(async () => reply(await paddedTransparentLogo()));
    const snapshot = {
      showInfoBase: { adverts: [] },
      showSponsors: [
        { name: 'CSJ', tier: 'prize', logoUrl: ALLOWED, website: null, customTitle: null },
        { name: 'No Logo Ltd', tier: 'prize', logoUrl: null, website: null, customTitle: null },
      ],
    };
    const hydrated = await hydrateSnapshotForRender(snapshot as never);
    const [csj, noLogo] = hydrated.showSponsors;
    expect(Buffer.isBuffer(csj!.logoBuffer)).toBe(true);
    expect(noLogo!.logoBuffer).toBeNull();
    expect(sponsorLogoSrc(noLogo!)).toBeNull(); // name alone, never a bare URL
  });
});

describe('sponsor logos — one owner guard', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const grep = (pattern: string, ...paths: string[]) => {
    try {
      return execFileSync('git', ['grep', '-n', '-E', pattern, '--', ...paths], { cwd: ROOT })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  it('no renderer draws a sponsor logo from its raw URL', () => {
    expect(grep('(sp|sponsor|titleSponsor)\\.logoUrl', 'src/components')).toEqual([]);
  });

  it('every sponsor render path prepares the logos', () => {
    for (const f of [
      'src/server/services/catalogue-snapshot.ts',
      'src/server/services/pdf-generation.ts',
      'src/app/api/schedule/[showId]/route.ts',
    ]) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/withPreparedSponsorLogos\(/);
    }
  });
});
