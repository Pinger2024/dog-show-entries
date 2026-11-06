/**
 * Entry point for the document-render worker — a SEPARATE OS process from
 * the Next.js app, so a heavy PDF render that exhausts memory kills this
 * process instead of the one serving exhibitors.
 *
 * Two run modes (see document-render-worker.ts's header for the full
 * rationale):
 *
 * Usage:   npx tsx scripts/run-render-worker.ts
 *            Forever-poll — claims jobs until SIGTERM/SIGINT. The demo's
 *            mode, run under launchd via demo-worker-service.sh.
 *
 *          npx tsx scripts/run-render-worker.ts --once
 *          RENDER_WORKER_EXIT_WHEN_IDLE=1 npx tsx scripts/run-render-worker.ts
 *            Drain-and-exit — claims and renders everything queued, then
 *            exits 0 the moment the queue is empty. Prod's mode (`npm run
 *            worker:render:once`), run every 5 minutes by a Render Cron Job
 *            — see scripts/_provision-render-cron.ts.
 *
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

  const exitWhenIdle = process.env.RENDER_WORKER_EXIT_WHEN_IDLE === '1' || process.argv.includes('--once');

  const controller = new AbortController();
  const stop = (signal: string) => {
    console.log(`[run-render-worker] ${signal} received, finishing current job and stopping`);
    controller.abort();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  await runWorkerLoop(db, { signal: controller.signal, exitWhenIdle });
  process.exit(0);
}

main().catch((err) => {
  console.error('[run-render-worker] fatal error:', err);
  process.exit(1);
});
