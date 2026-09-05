import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { resolveImageSafely, ensurePdfSafeImage } from '@/lib/pdf-safe-image';

// react-pdf's own image resolver is the embeddability predicate these
// helpers wrap. Tests default to the REAL resolver (sharp-made fixtures
// all resolve); a test sets `resolveImageCtl.impl` to force the rejection
// path, since the real files that genuinely desync jay-peg can't be
// synthesised — same pattern as advert-orientation.test.ts, which shares
// this module.
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

afterEach(() => {
  resolveImageCtl.impl = null;
});

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } },
  }).jpeg().toBuffer();
}

describe('resolveImageSafely', () => {
  it('is true for a buffer react-pdf can actually embed', async () => {
    await expect(resolveImageSafely(await jpeg(50, 30))).resolves.toBe(true);
  });

  it('is false — never throws — when the resolver rejects the buffer', async () => {
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    await expect(resolveImageSafely(await jpeg(50, 30))).resolves.toBe(false);
  });

  it('is false when the resolver resolves null (unrecognised format) rather than throwing', async () => {
    resolveImageCtl.impl = () => null;
    await expect(resolveImageSafely(Buffer.from('not an image'))).resolves.toBe(false);
  });
});

describe('ensurePdfSafeImage', () => {
  it('returns the original buffer, same identity, when it already passes the predicate', async () => {
    const buf = await jpeg(64, 48);
    const result = await ensurePdfSafeImage(buf);
    expect(result).toBe(buf); // reference equality — zero recompression
  });

  it('re-encodes losslessly as PNG at full resolution when the predicate rejects the original', async () => {
    const buf = await jpeg(64, 48);
    // Reject the first resolveImage call (the original JPEG); accept the
    // second (our PNG re-encode) — simulates the real defect, where the
    // original bytes desync the parser but a fresh sharp re-encode doesn't.
    let call = 0;
    resolveImageCtl.impl = () => {
      call += 1;
      if (call === 1) throw new Error('Unknown version 49664');
      return { width: 64, height: 48, data: Buffer.alloc(1), format: 'png' };
    };

    const result = await ensurePdfSafeImage(buf);
    expect(result).not.toBeNull();
    expect(result).not.toBe(buf); // different buffer — it was re-encoded

    const meta = await sharp(result!).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48); // full resolution — never downsampled
  });

  it('returns null when even the re-encoded PNG fails the predicate', async () => {
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    await expect(ensurePdfSafeImage(await jpeg(64, 48))).resolves.toBeNull();
  });

  it('returns null — never throws — when sharp cannot decode the source at all', async () => {
    resolveImageCtl.impl = () => {
      throw new Error('Unknown version 49664');
    };
    await expect(ensurePdfSafeImage(Buffer.from('not an image at all'))).resolves.toBeNull();
  });
});
