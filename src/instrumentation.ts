/**
 * Next.js server-lifecycle hook. Runs once when the Node runtime boots
 * (not on the Edge runtime). Ideal slot for a one-shot idempotent
 * migration because Render auto-deploys on every git push anyway —
 * pushing a new version of this file triggers the re-run.
 *
 * Everything in here MUST be:
 *   - idempotent (we may restart many times, code shouldn't care)
 *   - safe to run in test/CI (no-ops when DATABASE_URL points to test DB
 *     or isn't set — actually fine, drizzle test push handles schema)
 *   - fast (we're blocking server startup)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Dev and test environments don't need startup migrations — drizzle-kit
  // push already handles local, and the pretest hook handles remi_test.
  // Only run on production.
  if (process.env.NODE_ENV !== 'production') return;

  try {
    const { runStartupMigrations } = await import('@/server/db/startup-migrations');
    await runStartupMigrations();
  } catch (err) {
    // Don't take the server down on a migration failure — surface loud
    // logs instead so the bad state is obvious but the service stays up.
    console.error('[instrumentation] startup migration failed:', err);
  }
}
