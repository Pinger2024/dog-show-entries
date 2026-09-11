// Throwaway: create the Render Cron Job 'remi-render-cron' via the Render
// API. Modelled on scripts/_provision-render-worker.ts (same key handling,
// same env-copy-from-web-service approach, same idempotency-by-name check)
// but swaps the always-on Background Worker for a Cron Job that fires every
// 5 minutes, drains document_render_jobs, and exits — see
// document-render-worker.ts's header for the full "why": Render bills a
// Background Worker for every second it exists (idle or not — ~$25/month
// for the 2GB 'standard' plan this needs), but bills a Cron Job only for
// the seconds it's actually running. Most 5-minute ticks find nothing
// queued and exit in well under a second, so the cron's real running time
// should land at pennies a month rather than $25.
//
// NOTE ON THE PAYLOAD SHAPE: the comment in _provision-render-worker.ts
// says it mirrors "scripts/_provision-backup-cron.ts's known-working
// cron_job payload" — but no such file exists anywhere in this repo's
// history (checked `git log --all` across every branch, 2026-08-27). The
// ops/db-backup nightly-backup cron it refers to was evidently provisioned
// by hand through the Render dashboard, not a script. So the shape below is
// instead built from Render's public API docs (api-docs.render.com/
// reference/create-service), fetched live 2026-08-27:
//   - serviceType enum includes 'cron_job' (as the top-level `type` field).
//   - cronJobDetailsPOST requires a `schedule` string directly under
//     `serviceDetails` — a SIBLING of `env`/`runtime`/`region`/`plan`, NOT
//     nested inside `envSpecificDetails`.
//   - the Docker envSpecificDetails schema (dockerDetailsPOST) exposes
//     `dockerfilePath`, `dockerContext`, and `dockerCommand` — all optional,
//     all confirmed by name straight from the schema.
// Like _provision-render-worker.ts, both `env: 'docker'` and
// `runtime: 'docker'` are set on serviceDetails for safety, since the docs
// call the sibling `env` field "deprecated" without saying whether it's
// rejected outright — if Render's API 400s on `env` for a cron job, drop it
// and rely on `runtime` alone.
//
// RENDER_API_KEY comes from the shell env, falling back to a gitignored
// .env.render file — nothing sensitive is ever printed, only key NAMES and
// counts (see the env summary below).
import { existsSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'tea-csp7iebgbbvc73etiqv0';
const WEB_SERVICE = 'srv-d6g578a4d50c73dj4rpg';
const REPO = 'https://github.com/Pinger2024/dog-show-entries';
const BRANCH = 'main';
const NAME = 'remi-render-cron';
const REGION = 'frankfurt';
// Same 'standard' (2GB) plan as remi-render-worker — this cron renders the
// exact same catalogues (same Dockerfile.worker, same worker:render code
// path), so it needs the same memory headroom that ruled out 'starter'
// there (a 20-advert catalogue peaked ~650MB RSS, 2026-08-26 demo run).
// Render bills cron compute per second RUNNING, not per second the plan
// theoretically reserves, so the bigger plan here doesn't cost anything
// like $25/month the way an always-on worker on the same plan would.
const PLAN = 'standard';
const SCHEDULE = '*/5 * * * *';
const DRY_RUN = process.argv.includes('--dry-run');

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

  // ── 1. Idempotency: bail out (exit 0) if the cron job already exists ────
  // Render's `name` filter behaviour (exact vs substring) isn't documented,
  // so filter the returned list ourselves rather than trust the query alone.
  const existingList = (await api(
    `/services?name=${encodeURIComponent(NAME)}&ownerId=${encodeURIComponent(OWNER)}&limit=20`,
  )) as Array<{ service: Record<string, unknown> }>;
  const existing = existingList.map((entry) => entry.service).find((svc) => svc.name === NAME);
  if (existing) {
    const details = existing.serviceDetails as Record<string, unknown> | undefined;
    console.log(`• '${NAME}' already exists — id ${existing.id}, not creating a duplicate.`);
    console.log(`  dashboard: ${(details?.dashboardUrl as string) || (existing.dashboardUrl as string) || '(see Render)'}`);
    return;
  }
  console.log(`• '${NAME}' does not exist yet — will ${DRY_RUN ? 'NOT (dry-run)' : ''} create it.`);

  // ── 2. Copy the web service's full environment ──────────────────────────
  // Same reasoning as _provision-render-worker.ts: this cron renders the
  // same catalogues, uploads to the same R2 bucket, hits the same Postgres,
  // so it needs the same Stripe/R2/DATABASE_URL/etc config as the web
  // service. Paginated per Render's cursor convention: each item is
  // `{ envVar: { key, value }, cursor }`, cursor is a sibling of the
  // resource (not nested in it) — take the LAST item's cursor as the next
  // page's `cursor` query param, stop once a page comes back shorter than
  // the requested limit.
  const copied: { key: string; value: string }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({ limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    const page = (await api(`/services/${WEB_SERVICE}/env-vars?${qs.toString()}`)) as Array<{
      envVar: { key: string; value: string };
      cursor: string;
    }>;
    if (page.length === 0) break;
    for (const item of page) copied.push(item.envVar);
    cursor = page[page.length - 1]?.cursor;
    if (page.length < 100) break;
  }
  console.log(`• copied ${copied.length} env var(s) from the web service (${WEB_SERVICE})`);

  // ── 3. Override/add cron-specific vars, drop platform-injected ones ────
  const envMap = new Map(copied.map((v) => [v.key, v.value]));
  envMap.delete('PORT'); // a cron run doesn't listen on a port
  envMap.set('DATABASE_POOL_MAX', '2'); // tiny pool — one job at a time, one connection to spare
  envMap.set('NODE_ENV', 'production');
  envMap.set('RENDER_WORKER_EXIT_WHEN_IDLE', '1'); // belt-and-braces — dockerCommand already runs `--once`
  const envVars = Array.from(envMap, ([key, value]) => ({ key, value }));
  console.log(`• final env: ${envVars.length} var(s) — ${envVars.map((v) => v.key).join(', ')}`);

  // ── 4. Create the service ────────────────────────────────────────────
  const payload = {
    type: 'cron_job',
    name: NAME,
    ownerId: OWNER,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: 'yes',
    rootDir: '',
    envVars,
    serviceDetails: {
      env: 'docker',
      runtime: 'docker',
      region: REGION,
      plan: PLAN,
      schedule: SCHEDULE,
      envSpecificDetails: {
        dockerfilePath: './Dockerfile.worker',
        dockerContext: '.',
        dockerCommand: 'npm run worker:render:once',
      },
    },
  };

  if (DRY_RUN) {
    const redacted = {
      ...payload,
      envVars: payload.envVars.map((v) => ({ key: v.key, value: '<redacted>' })),
    };
    console.log('--dry-run: would POST /v1/services with:');
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }

  const res = (await api('/services', { method: 'POST', body: JSON.stringify(payload) })) as Record<string, unknown>;
  const svc = (res.service as Record<string, unknown>) || res;
  console.log('✓ created cron job:', svc.id, '|', svc.name);
  const details = svc.serviceDetails as Record<string, unknown> | undefined;
  console.log('  dashboard:', (details?.dashboardUrl as string) || (svc.dashboardUrl as string) || '(see Render)');
  console.log(
    `  schedule: ${SCHEDULE} — Render guarantees at most one run active at a time; a tick that lands ` +
      'mid-render is delayed until the current run finishes, so a long render can never overlap the next tick.',
  );
}

main().catch((e) => {
  console.error('✗ provision failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
