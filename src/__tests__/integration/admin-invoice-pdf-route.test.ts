import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock React-PDF to skip expensive rendering — same pattern as
// pdf-routes.test.ts. This route asserts on auth/access + response shape.
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

// The route pipes the rendered buffer through pdf-lib to strip react-pdf's
// unembedded base-14 font refs — pdf-lib can't parse the text stub above,
// so pass the buffer through unchanged (real stripping is exercised via
// the render smoke-test in the verify step, not through this route test).
vi.mock('@/lib/pdf-pad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-pad')>();
  return {
    ...actual,
    stripUnembeddedBase14Fonts: vi.fn(async (buf: Buffer) => buf),
  };
});

import { auth } from '@/lib/auth';
import { GET as invoicePdfGET } from '@/app/api/admin/invoices/[invoiceId]/pdf/route';
import { NextRequest } from 'next/server';
import { makeUser, makeOrg, makeBreed, makeShow } from '../helpers/factories';
import { createTestCaller } from '../helpers/context';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const params = (invoiceId: string) => ({ params: Promise.resolve({ invoiceId }) });
const req = (invoiceId: string) => new NextRequest(`http://localhost/api/admin/invoices/${invoiceId}/pdf`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function seedIssuedInvoice() {
  const admin = await makeUser({ role: 'admin' });
  const breed = await makeBreed();
  const org = await makeOrg();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const caller = createTestCaller(admin);
  const invoice = await caller.adminInvoices.issue({
    showId: show.id,
    packageFeePence: 5000,
    packageFeeDescription: 'Show package fee',
    perTransactionDiscountPence: 20,
  });
  return { admin, org, show, invoice };
}

describe('GET /api/admin/invoices/[invoiceId]/pdf', () => {
  it('rejects an unauthenticated request (403, same as the Award Board A3 admin-only pattern this route mirrors)', async () => {
    const { invoice } = await seedIssuedInvoice();
    vi.mocked(auth).mockResolvedValue(null);
    const res = await invoicePdfGET(req(invoice.id), params(invoice.id));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin (secretary) session — deliberately stricter than authenticatePdfRequest', async () => {
    const { invoice, org } = await seedIssuedInvoice();
    const secretary = await makeUser({ role: 'secretary' });
    // Even if this secretary were an org member, the route must still reject.
    authedAs(secretary);
    const res = await invoicePdfGET(req(invoice.id), params(invoice.id));
    expect(res.status).toBe(403);
    void org;
  });

  it('returns 200 PDF for an admin session', async () => {
    const { invoice, admin } = await seedIssuedInvoice();
    authedAs(admin);
    const res = await invoicePdfGET(req(invoice.id), params(invoice.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('GET /api/admin/invoices/[invoiceId]/pdf — not found', () => {
  it('returns 404 for an unknown invoice id', async () => {
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);
    const res = await invoicePdfGET(
      req('00000000-0000-0000-0000-000000000000'),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });
});
