import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/storage')>();
  return {
    ...actual,
    uploadToR2: vi.fn(async () => undefined),
    getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
  };
});

import { auth } from '@/lib/auth';
import { POST as judgePhotoPOST } from '@/app/api/upload/judge-photo/route';
import { POST as timelinePhotoPOST } from '@/app/api/upload/timeline-photo/route';
import { POST as feedbackAttachmentPOST } from '@/app/api/upload/feedback-attachment/route';
import { POST as checklistDocPOST } from '@/app/api/upload/checklist-document/route';
import { makeUser, makeDog } from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

function postForm(url: string, form: Record<string, string | Blob>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new Request(url, { method: 'POST', body: fd });
}

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValueOnce({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('POST /api/upload/judge-photo', () => {
  it('401 unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await judgePhotoPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(401);
  });

  it('400 when file is missing', async () => {
    const user = await makeUser({ role: 'secretary' });
    authedAs(user);
    const res = await judgePhotoPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(400);
  });

  it('400 for non-image MIME types', async () => {
    const user = await makeUser({ role: 'secretary' });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' });
    const res = await judgePhotoPOST(postForm('http://localhost', { file }) as never);
    expect(res.status).toBe(400);
  });

  it('200 for a valid image upload', async () => {
    const user = await makeUser({ role: 'secretary' });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'judge.jpg', { type: 'image/jpeg' });
    const res = await judgePhotoPOST(postForm('http://localhost', { file }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain('judge-photos/');
  });
});

describe('POST /api/upload/timeline-photo', () => {
  it('401 unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await timelinePhotoPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(401);
  });

  it('400 when missing file or dogId', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    authedAs(user);
    const res = await timelinePhotoPOST(postForm('http://localhost', { dogId: 'whatever' }) as never);
    expect(res.status).toBe(400);
  });

  it('200 for an owned dog with valid image', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'pic.jpg', { type: 'image/jpeg' });
    const res = await timelinePhotoPOST(
      postForm('http://localhost', { file, dogId: dog.id }) as never,
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/upload/feedback-attachment', () => {
  it('401 unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await feedbackAttachmentPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(401);
  });

  it('400 for non-image attachments', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' });
    const res = await feedbackAttachmentPOST(postForm('http://localhost', { file }) as never);
    expect(res.status).toBe(400);
  });

  it('200 for a valid screenshot', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'shot.png', { type: 'image/png' });
    const res = await feedbackAttachmentPOST(postForm('http://localhost', { file }) as never);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/upload/checklist-document', () => {
  it('401 unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await checklistDocPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(401);
  });

  it('400 when file is missing', async () => {
    const user = await makeUser({ role: 'secretary' });
    authedAs(user);
    const res = await checklistDocPOST(postForm('http://localhost', {}) as never);
    expect(res.status).toBe(400);
  });

  it('200 for a valid PDF', async () => {
    const user = await makeUser({ role: 'secretary' });
    authedAs(user);
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' });
    const res = await checklistDocPOST(postForm('http://localhost', { file }) as never);
    expect(res.status).toBe(200);
  });
});
