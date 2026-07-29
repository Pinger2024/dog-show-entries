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
 * These three routes are hidden behind `role === 'admin'` in the secretary
 * Documents page. Before this suite, all three were reachable by any
 * authenticated member of the show's organisation (and the print wrapper by
 * anyone at all) — the client gate was cosmetic. Each route is checked from
 * four angles: anonymous, org member, unrelated user, and admin.
 */

// [route label, handler] — driven as a table so a new admin-only PDF route
// can be added in one line rather than a copied describe block.
const ADMIN_ONLY_PDF_ROUTES: ReadonlyArray<
  [string, (r: NextRequest, p: { params: Promise<{ showId: string }> }) => Promise<Response>]
> = [
  ['GET /api/prize-cards/[showId]', prizeCardsGET],
  ['GET /api/prize-cards/[showId]/print', prizeCardsPrintGET],
  ['GET /api/prize-card-overprint/[showId]', overprintGET],
];

describe.each(ADMIN_ONLY_PDF_ROUTES)('%s — admin-only enforcement', (_label, handler) => {
  it('returns 401 when unauthenticated', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    vi.mocked(auth).mockResolvedValue(null);

    const res = await handler(req(show.id), params(show.id));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a secretary who owns the show but is not an admin', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);

    const res = await handler(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('returns 403 for an exhibitor who is a member of the owning org', async () => {
    const org = await makeOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    await makeMembership({ userId: exhibitor.id, organisationId: org.id });
    const show = await makeShow({ organisationId: org.id });
    authedAs(exhibitor);

    const res = await handler(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a secretary of an unrelated club', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const { user: rival } = await makeSecretaryWithOrg();
    authedAs(rival);

    const res = await handler(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('allows an admin who is not a member of the owning org', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);

    const res = await handler(req(show.id), params(show.id));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/prize-cards/[showId]/print — response shape', () => {
  it('still serves the HTML print wrapper for an admin', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);

    const res = await prizeCardsPrintGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    await expect(res.text()).resolves.toContain(`/api/prize-cards/${show.id}?`);
  });

  it('does not reach the wrapper HTML for a non-admin', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);

    const res = await prizeCardsPrintGET(req(show.id), params(show.id));
    expect(res.headers.get('content-type')).not.toContain('text/html');
    await expect(res.text()).resolves.not.toContain('<iframe');
  });
});
