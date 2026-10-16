/**
 * Registering on an address that is already on Remi. With a password: the same
 * 409 as ever. WITHOUT one (they bought from Remi without signing up, or use
 * emailed links / Google): an email to set their first password, and a flag so
 * the page does not try to sign them in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { passwordResetTokens, users } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { resendMocks } from '../helpers/resend-mocks';
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { passwordEmailCopy } from '@/server/services/password-reset';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type SendArgs = { to: string; subject: string; text: string; html: string };
const sent = () => (resendMocks.send.mock.calls as unknown as Array<[SendArgs]>).map((c) => c[0]);

describe('POST /api/auth/register on an existing address', () => {
  beforeEach(() => resendMocks.send.mockClear());

  it('no password yet: emails a set-your-password link, returns the flag, creates no second row, sets no password', async () => {
    const buyer = await makeUser({ email: 'buyer@test.local', passwordHash: null });
    const res = await registerPOST(req({ email: ' Buyer@Test.local ', password: 'a-good-password' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, setPasswordEmailed: true });

    const mails = sent();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('buyer@test.local');
    expect(mails[0].subject).toBe('Set your Remi password');
    expect(mails[0].html).toContain('Set a password for');
    expect(mails[0].html).not.toContain('Resetting password for');
    expect(mails[0].text).toContain('&first=1');

    const tokens = await testDb.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, buyer.id));
    expect(tokens).toHaveLength(1);
    const rows = await testDb.select().from(users).where(eq(users.email, 'buyer@test.local'));
    expect(rows).toHaveLength(1);
    // The password typed on the page is NOT saved: only the emailed link can set one.
    expect(rows[0].passwordHash).toBeNull();
  });

  it('has a password: the same 409 as ever, and no email', async () => {
    await makeUser({ email: 'member@test.local', passwordHash: await hash('existing-pw-1', 4) });
    const res = await registerPOST(req({ email: 'member@test.local', password: 'another-password' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Unable to create account. Try signing in instead.');
    expect(sent()).toHaveLength(0);
  });

  it('a new address still registers (201)', async () => {
    const res = await registerPOST(req({ email: 'fresh@test.local', password: 'a-good-password' }));
    expect(res.status).toBe(201);
    expect(sent()).toHaveLength(0);
  });

  it('the ordinary reset email keeps its reset wording', () => {
    const c = passwordEmailCopy(false);
    expect(c.subject).toBe('Reset your Remi password');
    expect(c.forLine).toBe('Resetting password for');
    expect(c.pageFlag).toBe('');
  });
});
