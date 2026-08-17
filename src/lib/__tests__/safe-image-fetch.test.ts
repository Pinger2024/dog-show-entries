import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBlockedAddress, fetchClubImage } from '@/lib/safe-image-fetch';

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
