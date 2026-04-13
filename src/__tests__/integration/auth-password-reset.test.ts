import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { passwordResetTokens, users } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { POST as forgotPasswordPOST } from '@/app/api/auth/forgot-password/route';
import { POST as resetPasswordPOST } from '@/app/api/auth/reset-password/route';

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  it('inserts a token + sends email for an existing user', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'forgot@test.local' });

    const res = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', { email: user.email }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const tokens = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.token).toBeTruthy();
    expect(tokens[0]?.usedAt).toBeNull();
    // Token expires roughly 1 hour out
    const expiresInMs = tokens[0]!.expiresAt.getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(50 * 60 * 1000);
    expect(expiresInMs).toBeLessThan(70 * 60 * 1000);
  });

  it('returns 200 + creates no token for an unknown email (no enumeration)', async () => {
    const res = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', { email: 'nobody@test.local' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const tokens = await testDb.query.passwordResetTokens.findMany();
    expect(tokens).toHaveLength(0);
  });

  it('rate-limits: a second request within 60s creates no new token', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'rate@test.local' });
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    const tokens = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
    });
    expect(tokens).toHaveLength(1);
  });

  it('invalidates a previous unused token before issuing a new one (after the rate-limit window)', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'invalidate@test.local' });
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    // Move the existing token's createdAt back so it's no longer rate-limited
    await testDb.update(passwordResetTokens).set({
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    }).where(eq(passwordResetTokens.userId, user.id));

    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));

    const tokens = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.usedAt).not.toBeNull(); // old token marked used
    expect(tokens[1]?.usedAt).toBeNull(); // new token live
  });

  it('returns 200 even when body is empty (still no enumeration)', async () => {
    const res = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', {}),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('updates the user password hash for a valid token and burns the token', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'reset@test.local' });
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    const [token] = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
    });

    const res = await resetPasswordPOST(
      jsonRequest('http://localhost/api/auth/reset-password', {
        token: token!.token,
        password: 'fresh-strong-pw',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Token marked used
    const refreshedToken = await testDb.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.id, token!.id),
    });
    expect(refreshedToken?.usedAt).not.toBeNull();

    // Password hash now matches the new password
    const refreshedUser = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshedUser?.passwordHash).toBeTruthy();
    expect(await compare('fresh-strong-pw', refreshedUser!.passwordHash!)).toBe(true);
  });

  it('rejects an unknown token with a 400', async () => {
    const res = await resetPasswordPOST(
      jsonRequest('http://localhost', { token: 'no-such-token', password: 'goodpw1234' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid or expired/);
  });

  it('rejects a missing token with 400', async () => {
    const res = await resetPasswordPOST(
      jsonRequest('http://localhost', { password: 'goodpw1234' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a too-short password with 400', async () => {
    const res = await resetPasswordPOST(
      jsonRequest('http://localhost', { token: 'whatever', password: 'short' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/8 and 128/);
  });

  it('rejects an already-used token (single-use enforcement)', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'single@test.local' });
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    const [token] = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
    });
    // First reset succeeds
    await resetPasswordPOST(jsonRequest('http://localhost', {
      token: token!.token, password: 'first-pw-1234',
    }));
    // Second reset with the same token fails
    const res = await resetPasswordPOST(jsonRequest('http://localhost', {
      token: token!.token, password: 'second-pw-1234',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const user = await makeUser({ role: 'exhibitor', email: 'expired@test.local' });
    await forgotPasswordPOST(jsonRequest('http://localhost', { email: user.email }));
    const [token] = await testDb.query.passwordResetTokens.findMany({
      where: eq(passwordResetTokens.userId, user.id),
    });
    // Push expiry into the past
    await testDb.update(passwordResetTokens).set({
      expiresAt: new Date(Date.now() - 60_000),
    }).where(eq(passwordResetTokens.id, token!.id));

    const res = await resetPasswordPOST(jsonRequest('http://localhost', {
      token: token!.token, password: 'fresh-pw-1234',
    }));
    expect(res.status).toBe(400);
  });
});
