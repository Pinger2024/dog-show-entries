import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '@/lib/auth';
import { getImpersonatedUserId } from '@/lib/impersonation';
import { getCurrentUser } from '@/lib/auth-utils';
import { makeUser } from '../helpers/factories';

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

/**
 * `remi_impersonate_user` holds a RAW, UNSIGNED user id (lib/impersonation.ts).
 * Nothing about the cookie proves the bearer is an admin — httpOnly stops
 * JavaScript, not devtools or curl — so every reader must check the REAL
 * session's role before trusting it. The admin check on
 * /api/admin/impersonate is not that guard: an attacker sets the cookie
 * directly rather than calling the route.
 *
 * server/trpc/init.ts and /api/dog-autosave both check. getCurrentUser did
 * not (found 2026-09-11), and it is what requireAuth / requireRole /
 * requireAnyRole and authenticatePdfRequest are all built on — so one forged
 * cookie let any logged-in exhibitor act as any user they could name, and
 * collect that user's parking pass and their club's secretary-only documents.
 */

function sessionFor(user: { id: string; email: string; name: string | null; role: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(auth).mockResolvedValue({ user: { ...user } } as any);
}

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(getImpersonatedUserId).mockResolvedValue(null);
});

describe('getCurrentUser — impersonation cookie', () => {
  it('IGNORES the cookie when the real caller is not an admin', async () => {
    const attacker = await makeUser({ role: 'exhibitor' });
    const victim = await makeUser({ role: 'secretary' });

    sessionFor(attacker);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(victim.id);

    const user = await getCurrentUser();

    expect(user?.id).toBe(attacker.id);
    expect(user?.id).not.toBe(victim.id);
    expect(user?.role).toBe('exhibitor');
  });

  it('IGNORES the cookie for a secretary too — only admins may impersonate', async () => {
    const secretary = await makeUser({ role: 'secretary' });
    const victim = await makeUser({ role: 'secretary' });

    sessionFor(secretary);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(victim.id);

    const user = await getCurrentUser();
    expect(user?.id).toBe(secretary.id);
  });

  it('HONOURS the cookie for a real admin (the supported feature still works)', async () => {
    const admin = await makeUser({ role: 'admin' });
    const target = await makeUser({ role: 'exhibitor' });

    sessionFor(admin);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(target.id);

    const user = await getCurrentUser();
    expect(user?.id).toBe(target.id);
    expect(user?.role).toBe('exhibitor');
  });

  it('returns the caller themselves when no cookie is set', async () => {
    const admin = await makeUser({ role: 'admin' });
    sessionFor(admin);

    const user = await getCurrentUser();
    expect(user?.id).toBe(admin.id);
  });

  // The stale-JWT DB re-read for exhibitors predates this guard and must
  // survive it — a freshly-promoted secretary still needs their real role.
  it('still re-reads an exhibitor role from the DB with no cookie present', async () => {
    const promoted = await makeUser({ role: 'secretary' });
    sessionFor({ ...promoted, role: 'exhibitor' });

    const user = await getCurrentUser();
    expect(user?.id).toBe(promoted.id);
    expect(user?.role).toBe('secretary');
  });
});
