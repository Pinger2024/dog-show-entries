/**
 * Next.js lifecycle hook — runs schema migrations on server boot.
 * Migrations must be idempotent (see startup-migrations.ts) because this
 * runs on every restart, not just deploys.
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
