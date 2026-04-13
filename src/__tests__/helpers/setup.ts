import { beforeEach, vi } from 'vitest';
import { cleanDb } from './db';

// ── Safety: refuse to run tests against anything but localhost. ────────────
const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error(
    `Tests refuse to run against non-localhost DATABASE_URL.\n` +
      `Got: ${url}\n` +
      `Set DATABASE_URL in .env.test to a localhost Postgres.`,
  );
}

// ── Mock external services. Hoisted by Vitest above all imports. ──────────
// Tests inspect calls via `vi.mocked(importedFn)`.

vi.mock('@/server/services/stripe', () => ({
  getStripe: vi.fn(() => ({})),
  createPaymentIntent: vi.fn(async (amount: number, metadata: Record<string, string>) => ({
    id: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    client_secret: `pi_test_${Math.random().toString(36).slice(2, 10)}_secret_x`,
    amount,
    currency: 'gbp',
    metadata,
    status: 'requires_payment_method',
  })),
  getOrCreateStripeCustomer: vi.fn(async () => 'cus_test_stub'),
  createSubscriptionCheckout: vi.fn(async () => 'https://checkout.stripe.test/session'),
  createBillingPortalSession: vi.fn(async () => 'https://billing.stripe.test/portal'),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: vi.fn(async () => ({ data: { id: 'em_test' }, error: null })),
      receiving: { get: vi.fn(async () => ({ data: null, error: null })) },
    };
    contacts = { create: vi.fn(), remove: vi.fn() };
  },
}));

vi.mock('@/server/services/results-notifications', () => ({
  sendExhibitorResultsEmails: vi.fn(async () => undefined),
  sendFollowerResultsNotifications: vi.fn(async () => undefined),
  createResultsMilestonePosts: vi.fn(async () => undefined),
}));

vi.mock('@/server/services/email', async (importOriginal) => {
  // Keep helpers like FROM/btn/APP_URL real; only stub the network-touching senders.
  const actual = await importOriginal<typeof import('@/server/services/email')>();
  return {
    ...actual,
    sendEntryConfirmationEmail: vi.fn(async () => undefined),
    sendSecretaryNotificationEmail: vi.fn(async () => undefined),
    sendPrintOrderConfirmationEmail: vi.fn(async () => undefined),
    sendPrintOrderDispatchEmail: vi.fn(async () => undefined),
    sendJudgeApprovalRequestEmail: vi.fn(async () => undefined),
  };
});

// Note: storage service is intentionally NOT globally mocked — it has its own
// unit tests for pure validation logic. Integration tests that exercise the
// upload network call should mock @/server/services/storage locally.

// NextAuth import path — we never actually call auth() in tests because
// createTestCaller injects the session directly into TRPCContext.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

beforeEach(async () => {
  await cleanDb();
});
