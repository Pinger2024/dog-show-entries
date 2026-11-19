import { describe, it, expect } from 'vitest';
import { isContractOfferExpired } from '../judge-contract-offer';

/**
 * ONE owner (CLAUDE.md "One owner per rule") for "has this judge-contract
 * offer link expired" — previously copied verbatim between the GET and POST
 * handlers of src/app/api/judge-contract/[token]/route.ts.
 */
describe('isContractOfferExpired', () => {
  it('is false when tokenExpiresAt is null (never expires)', () => {
    expect(isContractOfferExpired({ tokenExpiresAt: null })).toBe(false);
  });

  it('is true when now is strictly after tokenExpiresAt', () => {
    const expiry = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T00:00:00.001Z');
    expect(isContractOfferExpired({ tokenExpiresAt: expiry }, now)).toBe(true);
  });

  it('is false when now is before tokenExpiresAt', () => {
    const expiry = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2025-12-31T23:59:59.999Z');
    expect(isContractOfferExpired({ tokenExpiresAt: expiry }, now)).toBe(false);
  });

  it('is false at the EXACT expiry instant — strict ">" boundary preserved', () => {
    const expiry = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(isContractOfferExpired({ tokenExpiresAt: expiry }, now)).toBe(false);
  });

  it('defaults `now` to the current time when omitted', () => {
    const pastExpiry = new Date(Date.now() - 1000);
    expect(isContractOfferExpired({ tokenExpiresAt: pastExpiry })).toBe(true);

    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60);
    expect(isContractOfferExpired({ tokenExpiresAt: futureExpiry })).toBe(false);
  });
});
