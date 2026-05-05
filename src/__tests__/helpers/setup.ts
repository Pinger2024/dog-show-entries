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
  getStripe: vi.fn(() => ({
    refunds: {
      create: vi.fn(async (opts: { payment_intent: string; amount: number }) => ({
        id: `re_test_${Math.random().toString(36).slice(2, 10)}`,
        payment_intent: opts.payment_intent,
        amount: opts.amount,
        status: 'succeeded',
      })),
    },
  })),
  createPaymentIntent: vi.fn(async (amount: number, metadata: Record<string, string>) => ({
    id: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    client_secret: `pi_test_${Math.random().toString(36).slice(2, 10)}_secret_x`,
    amount,
    currency: 'gbp',
    metadata,
    status: 'requires_payment_method',
  })),
  createEntryPaymentIntent: vi.fn(async (params: {
    amount: number;
    applicationFeeAmount: number;
    connectedAccountId: string;
    metadata: Record<string, string>;
  }) => ({
    id: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    client_secret: `pi_test_${Math.random().toString(36).slice(2, 10)}_secret_x`,
    amount: params.amount,
    currency: 'gbp',
    application_fee_amount: params.applicationFeeAmount,
    transfer_data: { destination: params.connectedAccountId },
    on_behalf_of: params.connectedAccountId,
    metadata: params.metadata,
    status: 'requires_payment_method',
  })),
  calculatePlatformFee: vi.fn((subtotal: number) => 100 + Math.round(subtotal * 0.01)),
  createConnectAccount: vi.fn(async (params: { organisationId: string }) => ({
    id: `acct_test_${Math.random().toString(36).slice(2, 10)}`,
    object: 'account',
    metadata: { organisationId: params.organisationId },
  })),
  createConnectOnboardingLink: vi.fn(async () => ({
    object: 'account_link',
    url: 'https://connect.stripe.test/onboard',
    expires_at: Math.floor(Date.now() / 1000) + 300,
  })),
  retrieveConnectAccount: vi.fn(async (accountId: string) => ({
    id: accountId,
    object: 'account',
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    requirements: { disabled_reason: null },
  })),
  deriveAccountStatus: vi.fn(() => 'active'),
  getOrCreateStripeCustomer: vi.fn(async () => 'cus_test_stub'),
  createSubscriptionCheckout: vi.fn(async () => 'https://checkout.stripe.test/session'),
  createBillingPortalSession: vi.fn(async () => 'https://billing.stripe.test/portal'),
}));

// Resend SDK mock — instances share captured send/receiving.get fns so
// tests can inspect call payloads via `import { resendMocks } from
// '../helpers/resend-mocks'`.
vi.mock('resend', async () => {
  const { resendMocks } = await import('./resend-mocks');
  return {
    Resend: class {
      emails = {
        send: resendMocks.send,
        receiving: { get: resendMocks.receivingGet },
      };
      contacts = { create: vi.fn(), remove: vi.fn() };
    },
  };
});

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
