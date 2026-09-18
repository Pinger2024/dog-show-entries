import { describe, expect, it } from 'vitest';
import { tokenTtlMs } from '../mixam';

/** Build a fake JWT with the given payload (signature irrelevant). */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

describe('tokenTtlMs', () => {
  it('derives TTL from iat/exp claims minus the refresh margin', () => {
    // Mixam JWTs observed live (2026-06-10) have a 1-hour lifetime
    const oneHour = fakeJwt({ iat: 1_781_067_317, exp: 1_781_070_917 });
    expect(tokenTtlMs(oneHour)).toBe(55 * 60 * 1000);
  });

  it('never returns less than one minute for short-lived tokens', () => {
    const twoMinutes = fakeJwt({ iat: 1_000, exp: 1_120 });
    expect(tokenTtlMs(twoMinutes)).toBe(60 * 1000);
  });

  it('falls back to a conservative TTL when claims are missing', () => {
    const noClaims = fakeJwt({ sub: 'someone' });
    expect(tokenTtlMs(noClaims)).toBe(45 * 60 * 1000);
  });

  it('falls back to a conservative TTL for unparseable tokens', () => {
    expect(tokenTtlMs('not-a-jwt')).toBe(45 * 60 * 1000);
    expect(tokenTtlMs('a.%%%%.c')).toBe(45 * 60 * 1000);
  });
});
