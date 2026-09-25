// Throwaway: retire the always-on 'remi-render-worker' Render Background
// Worker (srv-da7v4jlg1s2s73fh1820) now that catalogues are rendered by
// the 'remi-render-cron' Render Cron Job instead (every 5 minutes, bills
// only actual running seconds — see scripts/_provision-render-cron.ts).
// Refuses to delete the worker unless the cron job already exists, so this
// can never leave document_render_jobs with nothing to render it.
//
// Usage:
//   npx tsx scripts/_deprovision-render-worker.ts             (report only)
//   npx tsx scripts/_deprovision-render-worker.ts --confirm   (actually deletes)
//
// RENDER_API_KEY comes from the shell env, falling back to a gitignored
// .env.render file — nothing sensitive is ever printed, only key NAMES/ids.
import { existsSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'tea-csp7iebgbbvc73etiqv0';
const WORKER_SERVICE_ID = 'srv-da7v4jlg1s2s73fh1820';
const CRON_NAME = 'remi-render-cron';
const CONFIRM = process.argv.includes('--confirm');

async function loadApiKey(): Promise<string> {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;

  const envRenderPath = path.join(process.cwd(), '.env.render');
  if (existsSync(envRenderPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envRenderPath });
  }

  const key = process.env.RENDER_API_KEY;
  if (!key) {
    console.error(
      'RENDER_API_KEY not set. Export it in your shell, or put `RENDER_API_KEY=...` in a ' +
        '.env.render file at the repo root (gitignored via .env* — verified with `git check-ignore`).',
    );
    process.exit(1);
  }
  return key;
}

async function main() {
  const RKEY = await loadApiKey();

  async function api(pathAndQuery: string, init?: RequestInit): Promise<unknown> {
    const r = await fetch(`https://api.render.com/v1${pathAndQuery}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${RKEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    const text = await r.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (!r.ok) {
      throw new Error(`${r.status} ${pathAndQuery}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
    }
    return json;
  }

  // ── 1. Refuse to delete the always-on worker unless its replacement
  //      already exists — never leave document_render_jobs with nothing
  //      polling it. ──────────────────────────────────────────────────
  const existingList = (await api(
    `/services?name=${encodeURIComponent(CRON_NAME)}&ownerId=${encodeURIComponent(OWNER)}&limit=20`,
  )) as Array<{ service: Record<string, unknown> }>;
  const cron = existingList.map((entry) => entry.service).find((svc) => svc.name === CRON_NAME);
  if (!cron) {
    console.error(
      `✗ refusing to delete ${WORKER_SERVICE_ID} — '${CRON_NAME}' does not exist yet. Run ` +
        'scripts/_provision-render-cron.ts first.',
    );
    process.exit(1);
  }
  console.log(`• found '${CRON_NAME}' (id ${cron.id}) — safe to retire the always-on worker.`);

  // ── 2. Confirm the worker itself still exists — idempotent, so a re-run
  //      after a successful delete reports calmly rather than erroring. ──
  let worker: Record<string, unknown>;
  try {
    worker = (await api(`/services/${WORKER_SERVICE_ID}`)) as Record<string, unknown>;
  } catch (err) {
    console.log(
      `• '${WORKER_SERVICE_ID}' already gone (or inaccessible) — nothing to do. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
    return;
  }
  console.log(`• '${WORKER_SERVICE_ID}' exists — name '${worker.name as string}'.`);

  if (!CONFIRM) {
    console.log(`• dry-run: would DELETE /v1/services/${WORKER_SERVICE_ID}. Pass --confirm to actually delete.`);
    return;
  }

  await api(`/services/${WORKER_SERVICE_ID}`, { method: 'DELETE' });
  console.log(`✓ deleted ${WORKER_SERVICE_ID} (${worker.name as string}).`);
}

main().catch((e) => {
  console.error('✗ deprovision failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
