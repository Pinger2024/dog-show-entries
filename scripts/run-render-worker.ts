/**
 * Entry point for the document-render worker — a SEPARATE OS process from
 * the Next.js app, so a heavy PDF render that exhausts memory kills this
 * process instead of the one serving exhibitors.
 *
 * Usage:   npx tsx scripts/run-render-worker.ts
 * Demo:    npx dotenv -e .env.demo -e .env -- npx tsx scripts/run-render-worker.ts
 */
import 'dotenv/config';
import { db } from '@/server/db';
import { runWorkerLoop } from '@/server/workers/document-render-worker';

async function main() {
  if (!db) {
    console.error('[run-render-worker] DB unavailable — check DATABASE_URL. Exiting.');
    process.exit(1);
  }

  const controller = new AbortController();
  const stop = (signal: string) => {
    console.log(`[run-render-worker] ${signal} received, finishing current job and stopping`);
    controller.abort();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  await runWorkerLoop(db, { signal: controller.signal });
  process.exit(0);
}

main().catch((err) => {
  console.error('[run-render-worker] fatal error:', err);
  process.exit(1);
});
