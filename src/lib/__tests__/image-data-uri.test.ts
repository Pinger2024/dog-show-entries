import { describe, it, expect } from 'vitest';
import { toImageDataUri } from '../image-data-uri';

// A club logo uploaded as .jpg was served in a data: URI hardcoded to
// image/png, so Satori (next/og) couldn't decode it and the poster showed an
// empty circle (Mandy 2026-07-14). The MIME must follow the real bytes.
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('toImageDataUri — MIME sniffing', () => {
  it('detects JPEG from its ff d8 magic bytes', () => {
    expect(toImageDataUri(buf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('detects PNG from its 89 50 4e 47 magic bytes', () => {
    expect(toImageDataUri(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toMatch(/^data:image\/png;base64,/);
  });

  it('detects GIF', () => {
    expect(toImageDataUri(buf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toMatch(/^data:image\/gif;base64,/);
  });

  it('detects WEBP (RIFF….WEBP)', () => {
    expect(toImageDataUri(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toMatch(/^data:image\/webp;base64,/);
  });

  it('falls back to PNG for unrecognised bytes', () => {
    expect(toImageDataUri(buf(0x00, 0x01, 0x02, 0x03))).toMatch(/^data:image\/png;base64,/);
  });

  it('base64-encodes the payload', () => {
    // 0xff 0xd8 = "/9g=" — a valid JPEG-prefixed data URI
    expect(toImageDataUri(buf(0xff, 0xd8))).toBe('data:image/jpeg;base64,/9g=');
  });
});
