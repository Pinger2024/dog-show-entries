/**
 * One owner for "granting someone a role".
 *
 * A user has ONE role column, and access rises with it: a steward can do
 * everything an exhibitor can, a secretary everything a steward can, and so
 * on. `judge` unlocks nothing extra today — it labels a user as a judge and
 * sits just above `exhibitor`.
 *
 * Bug hunt 2026-09-22: `assignRole` wrote the requested role unconditionally,
 * so an invitation could DEMOTE someone — an admin invited as a steward
 * stopped being an admin; another club's secretary invited as a judge lost
 * secretary access. `secretary.assignSteward` had its own separate rule
 * ("only if they're an exhibitor"), which also left a judge-labelled user
 * unable to open the steward pages they had just been given.
 *
 * Granting only ever RAISES a role. Taking one away (removing a steward,
 * the dev role switcher) is a separate, explicit act that does not go
 * through here.
 */
export type UserRole = 'exhibitor' | 'judge' | 'steward' | 'secretary' | 'admin';

const ROLE_RANK: Record<UserRole, number> = {
  exhibitor: 0,
  judge: 1,
  steward: 2,
  secretary: 3,
  admin: 4,
};

/** The role a user should hold after being granted `requested`. */
export function roleAfterGrant(current: UserRole, requested: UserRole): UserRole {
  return ROLE_RANK[requested] > ROLE_RANK[current] ? requested : current;
}
