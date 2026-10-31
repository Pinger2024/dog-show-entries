// Throwaway: create the Render Background Worker 'remi-render-worker' via
// the Render API. Modelled on scripts/_provision-backup-cron.ts (which
// provisions the ops/db-backup cron the same way), but this service runs
// the document-render worker (Dockerfile.worker → scripts/run-render-
// worker.ts) instead of a nightly backup — separated out because it needs
// the WEB service's full runtime environment (Stripe keys, R2 creds,
// DATABASE_URL, …), not a hand-picked handful of backup secrets.
//
// RENDER_API_KEY comes from the shell env, falling back to a gitignored
// .env.render file — nothing sensitive is ever printed, only key NAMES and
// counts (see printSafeEnvSummary below).
import { existsSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'tea-csp7iebgbbvc73etiqv0';
const WEB_SERVICE = 'srv-d6g578a4d50c73dj4rpg';
const REPO = 'https://github.com/Pinger2024/dog-show-entries';
const BRANCH = 'main';
const NAME = 'remi-render-worker';
const REGION = 'frankfurt';
// standard = 2GB. The worker peaked ~650MB RSS rendering a 20-advert
// catalogue (2026-08-26 demo run) — starter's 512MB would OOM on a bigger
// show, which is the exact outage this worker exists to get away from.
const PLAN = 'standard';
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

  // ── 1. Idempotency: bail out (exit 0) if the worker already exists ──────
  // Render's `name` filter behaviour (exact vs substring) isn't documented,
  // so filter the returned list ourselves rather than trust the query alone.
  const existingList = (await api(
    `/services?name=${encodeURIComponent(NAME)}&ownerId=${encodeURIComponent(OWNER)}&limit=20`,
  )) as Array<{ service: Record<string, unknown> }>;
  const existing = existingList
    .map((entry) => entry.service)
    .find((svc) => svc.name === NAME);
  if (existing) {
    const details = existing.serviceDetails as Record<string, unknown> | undefined;
    console.log(`• '${NAME}' already exists — id ${existing.id}, not creating a duplicate.`);
    console.log(`  dashboard: ${(details?.dashboardUrl as string) || (existing.dashboardUrl as string) || '(see Render)'}`);
    return;
  }
  console.log(`• '${NAME}' does not exist yet — will ${DRY_RUN ? 'NOT (dry-run)' : ''} create it.`);

  // ── 2. Copy the web service's full environment ──────────────────────────
  // The worker needs the same Stripe/R2/DATABASE_URL/etc config as the web
  // service — it renders the same catalogues, uploads to the same R2
  // bucket, hits the same Postgres. Paginated per Render's cursor
  // convention: each item is `{ envVar: { key, value }, cursor }`, cursor
  // is a sibling of the resource (not nested in it) — take the LAST item's
  // cursor as the next page's `cursor` query param, stop once a page comes
  // back shorter than the requested limit.
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

  // ── 3. Override/add worker-specific vars, drop platform-injected ones ──
  const envMap = new Map(copied.map((v) => [v.key, v.value]));
  envMap.delete('PORT'); // background workers don't listen on a port
  envMap.set('DATABASE_POOL_MAX', '2'); // tiny pool — one job at a time, one connection to spare
  envMap.set('NODE_ENV', 'production');
  const envVars = Array.from(envMap, ([key, value]) => ({ key, value }));
  console.log(`• final env: ${envVars.length} var(s) — ${envVars.map((v) => v.key).join(', ')}`);

  // ── 4. Create the service ────────────────────────────────────────────
  // Shape mirrors _provision-backup-cron.ts's known-working `cron_job`
  // payload (which sets BOTH `serviceDetails.env` and `.runtime` to
  // 'docker') with `type` swapped for `background_worker` and `schedule`
  // dropped. Render's public API docs (api-docs.render.com/reference/
  // create-service, fetched 2026-08-27) describe background-worker
  // serviceDetails as using `runtime: 'docker'` alone and call the
  // sibling `env` field "deprecated" — but since the docs page wasn't
  // reachable for a byte-exact schema at the time of writing and the cron
  // script's shape is proven to work against this same API, both fields
  // are set here for safety. If Render's API rejects `env` outright for
  // background workers, drop it and rely on `runtime` alone.
  const payload = {
    type: 'background_worker',
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
      numInstances: 1,
      envSpecificDetails: {
        dockerfilePath: './Dockerfile.worker',
        dockerContext: '.',
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
  console.log('✓ created background worker:', svc.id, '|', svc.name);
  const details = svc.serviceDetails as Record<string, unknown> | undefined;
  console.log('  dashboard:', (details?.dashboardUrl as string) || (svc.dashboardUrl as string) || '(see Render)');
}

main().catch((e) => {
  console.error('✗ provision failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
