import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reports-merge (2026-07-27): Mandy proofs the catalogue and steward book
// while entries are still open — "as long as we can still generate things
// like the catalogue options, stewards catalogue etc between entries
// opening and closing as I use that to check the formatting etc." Nothing
// on the Documents & Reports page may be gated by show phase, catalogue
// numbers, or results status. This test locks that in: a show with no
// catalogue numbers and no published results must still return a real
// document (not a 4xx) for every before-the-show format.

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 stub')),
  Document: ({ children }: { children?: unknown }) => children,
  Page: ({ children }: { children?: unknown }) => children,
  View: ({ children }: { children?: unknown }) => children,
  Text: ({ children }: { children?: unknown }) => children,
  Image: () => null,
  StyleSheet: { create: <T>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/pdf-pad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-pad')>();
  return {
    ...actual,
    stripUnembeddedBase14Fonts: vi.fn(async (buf: Buffer) => buf),
    padPdfToMultiple: vi.fn(async (buf: Buffer) => buf),
  };
});

import { auth } from '@/lib/auth';
import { GET as catalogueGET } from '@/app/api/catalogue/[showId]/[format]/route';
import { GET as judgesBookGET } from '@/app/api/judges-book/[showId]/route';
import { NextRequest } from 'next/server';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const catalogueParams = (showId: string, format: string) => ({
  params: Promise.resolve({ showId, format }),
});
const showParams = (showId: string) => ({ params: Promise.resolve({ showId }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/x/${showId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('Documents & Reports — nothing gated by show phase', () => {
  it('catalogue standard/by-class/judging (steward) all return a PDF on an entries_open show with no catalogue numbers', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    for (const format of ['standard', 'by-class', 'judging']) {
      const res = await catalogueGET(req(show.id), catalogueParams(show.id, format));
      expect(res.status, `format=${format} should not be gated`).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    }
  });

  it("judge's book returns a PDF on an entries_open show with no catalogue numbers or results", async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    const res = await judgesBookGET(req(show.id), showParams(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('marked catalogue returns a PDF even before results are finalised', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    const res = await catalogueGET(req(show.id), catalogueParams(show.id, 'marked'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});
