import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same React-PDF stub as pdf-routes.test.ts — these tests assert authorisation,
// not rendering.
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

vi.mock('@/server/services/pdf-generation', () => ({
  generatePrizeCardsPdf: vi.fn(async () => Buffer.from('%PDF-1.4 prize-cards')),
  generatePrizeCardOverprintPdf: vi.fn(async () => Buffer.from('%PDF-1.4 overprint')),
}));

import { auth } from '@/lib/auth';
import { GET as prizeCardsGET } from '@/app/api/prize-cards/[showId]/route';
import { GET as prizeCardsPrintGET } from '@/app/api/prize-cards/[showId]/print/route';
import { GET as overprintGET } from '@/app/api/prize-card-overprint/[showId]/route';
import { NextRequest } from 'next/server';
import { makeSecretaryWithOrg, makeShow, makeUser, makeOrg, makeMembership } from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const params = (showId: string) => ({ params: Promise.resolve({ showId }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/x/${showId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Access model, pinned deliberately (2026-07-30):
 *
 * - /api/prize-cards/[showId] — ORG-MEMBER access. The Prize Cards row on the
 *   secretary Documents page is gated by documentRowVisible('prize-cards')
 *   (ruleset only, no role check), so every secretary of an RKC show uses it.
 *   A requireAdmin gate briefly shipped on 2026-07-30 403'd real secretaries
 *   out of their own prize cards; the org-member cases below pin the revert.
 *
 * - /api/prize-cards/[showId]/print — NO auth. Static HTML shell with no data;
 *   the embedded iframe hits the PDF route, which does its own auth.
 *
 * - /api/prize-card-overprint/[showId] — ADMIN-ONLY. Linked from nowhere in
 *   the UI; its doc comment says admin-only (Print Shop fulfilment), and the
 *   server now enforces that.
 */

describe('GET /api/prize-cards/[showId] — org-member access', () => {
  it('returns 401 when unauthenticated', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    vi.mocked(auth).mockResolvedValue(null);

    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(401);
  });

  it('allows the secretary who owns the show — the regression case', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);

    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('allows an exhibitor who is a member of the owning org', async () => {
    const org = await makeOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    await makeMembership({ userId: exhibitor.id, organisationId: org.id });
    const show = await makeShow({ organisationId: org.id });
    authedAs(exhibitor);

    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
  });

  it('returns 403 for a secretary of an unrelated club', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const { user: rival } = await makeSecretaryWithOrg();
    authedAs(rival);

    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('allows an admin who is not a member of the owning org', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);

    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/prize-cards/[showId]/print — static shell, no auth', () => {
  it('serves the HTML print wrapper without a session (iframe does the auth)', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    vi.mocked(auth).mockResolvedValue(null);

    const res = await prizeCardsPrintGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    await expect(res.text()).resolves.toContain(`/api/prize-cards/${show.id}?`);
  });

  it('serves the wrapper for a secretary — the mobile print flow', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);

    const res = await prizeCardsPrintGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});

describe('GET /api/prize-card-overprint/[showId] — admin-only enforcement', () => {
  it('returns 401 when unauthenticated', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    vi.mocked(auth).mockResolvedValue(null);

    const res = await overprintGET(req(show.id), params(show.id));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a secretary who owns the show but is not an admin', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);

    const res = await overprintGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('returns 403 for an exhibitor who is a member of the owning org', async () => {
    const org = await makeOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    await makeMembership({ userId: exhibitor.id, organisationId: org.id });
    const show = await makeShow({ organisationId: org.id });
    authedAs(exhibitor);

    const res = await overprintGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a secretary of an unrelated club', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const { user: rival } = await makeSecretaryWithOrg();
    authedAs(rival);

    const res = await overprintGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('allows an admin who is not a member of the owning org', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);

    const res = await overprintGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
  });
});
