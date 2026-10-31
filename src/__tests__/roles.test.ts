import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { roleAfterGrant } from '@/lib/roles';

describe('roleAfterGrant — granting never lowers a role', () => {
  it.each([
    ['exhibitor', 'steward', 'steward'],
    ['exhibitor', 'judge', 'judge'],
    ['judge', 'steward', 'steward'],
    ['steward', 'judge', 'steward'],
    ['secretary', 'steward', 'secretary'],
    ['secretary', 'judge', 'secretary'],
    ['admin', 'secretary', 'admin'],
    ['steward', 'secretary', 'secretary'],
  ] as const)('%s granted %s → %s', (current, requested, expected) => {
    expect(roleAfterGrant(current, requested)).toBe(expected);
  });
});

/**
 * Guard (bug hunt 2026-09-22): every write to users.role goes through the
 * grant owner, except the listed explicit demotions.
 */
describe('users.role writes — one owner guard', () => {
  it('no code writes a role except via roleAfterGrant or an allowlisted demotion', () => {
    const hits = execSync(
      "git grep -nE 'set\\(\\{([^}]*[ ,])?role[,: }]' -- 'src/server/**' 'src/app/**' ':!**/__tests__/**' || true",
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const ALLOWED = [
      'src/server/lib/utils.ts', // assignRole — role: granted (roleAfterGrant)
      'src/server/trpc/routers/secretary.ts', // assignSteward (roleAfterGrant) + removeSteward's explicit demotion
      'src/server/trpc/routers/dev.ts', // dev-only role switcher, explicit
    ];
    const offenders = hits.filter((h) => !ALLOWED.some((a) => h.startsWith(`${a}:`)));
    expect(offenders).toEqual([]);
    // And the allowlisted secretary.ts has exactly the two known writes.
    expect(hits.filter((h) => h.startsWith('src/server/trpc/routers/secretary.ts:')).length).toBe(2);
  });
});
