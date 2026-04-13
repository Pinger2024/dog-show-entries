import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage's network-touching functions but keep validateUpload real.
vi.mock('@/server/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/storage')>();
  return {
    ...actual,
    generatePresignedPutUrl: vi.fn(async (key: string) => `https://r2.test/presigned/${key}?signature=stub`),
    getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
  };
});

import { auth } from '@/lib/auth';
import { POST as presignPOST } from '@/app/api/upload/presign/route';
import { makeUser } from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/upload/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/upload/presign', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await presignPOST(jsonRequest({
      fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 1000,
    }) as never);
    expect(res.status).toBe(401);
  });

  it('returns presignedUrl + publicUrl + key for an authenticated, valid request', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await presignPOST(jsonRequest({
      fileName: 'photo.jpeg',
      contentType: 'image/jpeg',
      sizeBytes: 100_000,
    }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(new RegExp(`^uploads/${user.id}/[0-9a-f-]+\\.jpg$`));
    expect(body.presignedUrl).toContain(body.key);
    expect(body.publicUrl).toContain(body.key);
  });

  it('rejects an unsupported MIME type with 400', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await presignPOST(jsonRequest({
      fileName: 'a.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 1000,
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not supported/);
  });

  it('rejects an over-sized file with 400', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await presignPOST(jsonRequest({
      fileName: 'huge.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 6 * 1024 * 1024, // > 5MB image limit
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/under 5MB/);
  });

  it('rejects missing fields with 400', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await presignPOST(jsonRequest({ fileName: 'a.jpg' }) as never);
    expect(res.status).toBe(400);
  });

  it('derives extension from MIME type, not from client filename', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await presignPOST(jsonRequest({
      fileName: 'misleading.exe', // attacker-controlled
      contentType: 'application/pdf',
      sizeBytes: 1000,
    }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(/\.pdf$/); // extension derived from MIME, not filename
    expect(body.key).not.toMatch(/\.exe/);
  });
});
