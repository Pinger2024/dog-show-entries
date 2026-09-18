import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { feedback } from '@/server/db/schema';
import { testDb } from '../helpers/db';

// Mock svix's Webhook class so the route's signature verification is bypassed.
// `verify` returns whatever payload the test injects.
let svixPayload: unknown = null;
let svixShouldThrow: string | null = null;
vi.mock('svix', () => ({
  Webhook: class {
    constructor(_secret: string) { void _secret; }
    verify(_body: string, _headers: Record<string, string>): unknown {
      void _body; void _headers;
      if (svixShouldThrow) throw new Error(svixShouldThrow);
      return svixPayload;
    }
  },
}));

import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';

beforeEach(() => {
  svixPayload = null;
  svixShouldThrow = null;
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret';
});

function svixRequest(body = '{}', headers: Record<string, string> = {
  'svix-id': 'msg_test',
  'svix-timestamp': String(Math.floor(Date.now() / 1000)),
  'svix-signature': 'v1,test_signature',
}) {
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/webhooks/resend', () => {
  it('returns 400 when svix-id header is missing', async () => {
    const res = await resendWebhookPOST(
      svixRequest('{}', {
        'svix-timestamp': '1',
        'svix-signature': 'v1,sig',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when svix verification throws', async () => {
    svixShouldThrow = 'No matching signature';
    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/verification failed/);
  });

  it('returns 500 if RESEND_WEBHOOK_SECRET is missing', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(500);
  });

  it('inserts a feedback row for an email.received payload', async () => {
    svixPayload = {
      type: 'email.received',
      data: {
        email_id: 'em_test_received_1',
        from: 'Mandy Sender <mandy@hundarkgsd.co.uk>',
        to: ['feedback@inbound.remishowmanager.co.uk'],
        subject: 'Re: A bug I noticed',
        text: 'Quick note about the entry form…',
        html: '<p>Quick note</p>',
        created_at: new Date().toISOString(),
      },
    };

    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(200);

    const row = await testDb.query.feedback.findFirst({
      where: eq(feedback.resendEmailId, 'em_test_received_1'),
    });
    expect(row?.fromName).toBe('Mandy Sender');
    expect(row?.fromEmail).toBe('mandy@hundarkgsd.co.uk');
    expect(row?.subject).toBe('Re: A bug I noticed');
    expect(row?.inReplyToSubject).toBe('A bug I noticed'); // "Re: " stripped
    expect(row?.source).toBe('email');
  });

  it('handles a from address without display name', async () => {
    svixPayload = {
      type: 'email.received',
      data: {
        email_id: 'em_test_received_plain',
        from: 'plain@example.test',
        to: ['feedback@inbound.remishowmanager.co.uk'],
        subject: 'No prefix here',
        text: 'body', html: '',
        created_at: new Date().toISOString(),
      },
    };
    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(200);
    const row = await testDb.query.feedback.findFirst({
      where: eq(feedback.resendEmailId, 'em_test_received_plain'),
    });
    expect(row?.fromName).toBeNull();
    expect(row?.fromEmail).toBe('plain@example.test');
  });

  it('is idempotent — re-delivering the same email_id does not duplicate (onConflictDoNothing)', async () => {
    const payload = {
      type: 'email.received',
      data: {
        email_id: 'em_test_idempotent',
        from: 'sender@test.local',
        to: ['feedback@inbound.remishowmanager.co.uk'],
        subject: 'Same email twice',
        text: 'Hello', html: '',
        created_at: new Date().toISOString(),
      },
    };
    svixPayload = payload;
    await resendWebhookPOST(svixRequest() as never);
    svixPayload = payload; // re-inject for second call
    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(200);

    const rows = await testDb.query.feedback.findMany({
      where: eq(feedback.resendEmailId, 'em_test_idempotent'),
    });
    expect(rows).toHaveLength(1);
  });

  it('ignores non-email.received event types', async () => {
    svixPayload = { type: 'email.delivered', data: { email_id: 'em_other' } };
    const res = await resendWebhookPOST(svixRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    // No feedback row inserted
    const rows = await testDb.query.feedback.findMany();
    expect(rows).toHaveLength(0);
  });

  // The Resend account is shared with Lettiva — its email.received webhook
  // fires for every recipient on the account, not just Remi's. Without a
  // recipient filter, Lettiva's holiday-let enquiries land in Remi's
  // feedback table.
  describe('recipient filtering (shared Resend account)', () => {
    it('ignores mail addressed to another project on the shared Resend account', async () => {
      svixPayload = {
        type: 'email.received',
        data: {
          email_id: 'em_test_lettiva',
          from: 'michael@prometheus-it.com',
          to: ['enquiries-bhhl-bcac@inbound.lettiva.com'],
          subject: 'Fwd: Email re Forest House',
          text: 'body', html: '',
          created_at: new Date().toISOString(),
        },
      };
      const res = await resendWebhookPOST(svixRequest() as never);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ignored: true, reason: 'recipient not ours' });

      const rows = await testDb.query.feedback.findMany();
      expect(rows).toHaveLength(0);
    });

    it('inserts mail addressed to our inbound domain', async () => {
      svixPayload = {
        type: 'email.received',
        data: {
          email_id: 'em_test_ours_to',
          from: 'mandy@hundarkgsd.co.uk',
          to: ['feedback@inbound.remishowmanager.co.uk'],
          subject: 'A note',
          text: 'body', html: '',
          created_at: new Date().toISOString(),
        },
      };
      const res = await resendWebhookPOST(svixRequest() as never);
      expect(res.status).toBe(200);

      const row = await testDb.query.feedback.findFirst({
        where: eq(feedback.resendEmailId, 'em_test_ours_to'),
      });
      expect(row).toBeDefined();
    });

    it('inserts mail with our inbound domain only in cc', async () => {
      svixPayload = {
        type: 'email.received',
        data: {
          email_id: 'em_test_ours_cc',
          from: 'someone@example.test',
          to: ['someone-else@example.test'],
          cc: ['feedback@inbound.remishowmanager.co.uk'],
          subject: 'A cc note',
          text: 'body', html: '',
          created_at: new Date().toISOString(),
        },
      };
      const res = await resendWebhookPOST(svixRequest() as never);
      expect(res.status).toBe(200);

      const row = await testDb.query.feedback.findFirst({
        where: eq(feedback.resendEmailId, 'em_test_ours_cc'),
      });
      expect(row).toBeDefined();
    });
  });
});
