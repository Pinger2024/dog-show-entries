/**
 * Google Search Console insights for remishowmanager.co.uk
 *
 * Pulls Search Analytics, sitemap status, and URL inspection data. The whole
 * point is to give Claude (and humans) a fast read on how Remi is showing up
 * in Google.
 *
 * Auth modes (in priority order):
 *   1. OAuth user (recommended): you authenticate as yourself once, the script
 *      saves a refresh token, and Search Console treats every call as you.
 *      No "Add user" step in Search Console required.
 *   2. Service account (fallback): the script uses a service-account JSON key.
 *      Requires the service account email to be added in Search Console →
 *      Settings → Users and permissions, which sometimes refuses with
 *      "email could not be found".
 *
 * OAuth setup (one-off):
 *   1. GCP Credentials → Create credentials → OAuth client ID → Desktop app
 *      https://console.cloud.google.com/apis/credentials
 *   2. Download the JSON, save as secrets/gsc-oauth-client.json
 *   3. Add yourself as a test user on the OAuth consent screen (if the app is
 *      in "Testing" status — check at /apis/credentials/consent)
 *   4. Run: npx tsx scripts/search-console.ts auth
 *      Browser opens, you click Allow, refresh token saved.
 *   5. Set GOOGLE_SEARCH_CONSOLE_SITE_URL in .env (sc-domain:... or https://...)
 *
 * Usage:
 *   npx tsx scripts/search-console.ts auth             # one-off OAuth login
 *   npx tsx scripts/search-console.ts                  # 28-day summary
 *   npx tsx scripts/search-console.ts --days 90        # custom lookback
 *   npx tsx scripts/search-console.ts queries          # top 50 queries
 *   npx tsx scripts/search-console.ts pages            # top 50 pages
 *   npx tsx scripts/search-console.ts devices          # device split
 *   npx tsx scripts/search-console.ts countries        # country split
 *   npx tsx scripts/search-console.ts dates            # daily time series
 *   npx tsx scripts/search-console.ts sitemaps         # sitemap status
 *   npx tsx scripts/search-console.ts sites            # list verified properties
 *   npx tsx scripts/search-console.ts inspect <url>    # URL inspection
 */

import 'dotenv/config';
import { google, type searchconsole_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';

const KEY_PATH = process.env.GOOGLE_SEARCH_CONSOLE_KEY_PATH;
const SITE_URL = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const OAUTH_CLIENT_PATH = './secrets/gsc-oauth-client.json';
const OAUTH_TOKEN_PATH = './secrets/gsc-oauth-token.json';

function loadOAuthClientConfig(): { clientId: string; clientSecret: string } | null {
  if (!existsSync(OAUTH_CLIENT_PATH)) return null;
  const cfg = JSON.parse(readFileSync(OAUTH_CLIENT_PATH, 'utf-8'));
  // Desktop apps put the credentials under `installed`, web apps under `web`.
  const block = cfg.installed ?? cfg.web;
  if (!block?.client_id || !block?.client_secret) {
    fail(`${OAUTH_CLIENT_PATH} doesn't look like a valid OAuth client JSON (no client_id/client_secret).`);
  }
  return { clientId: block.client_id, clientSecret: block.client_secret };
}

let cached: searchconsole_v1.Searchconsole | null = null;
async function getClient(): Promise<searchconsole_v1.Searchconsole> {
  if (cached) return cached;

  // Prefer OAuth user credentials when available — bypasses Search Console
  // "Add user" entirely because we authenticate as a real user.
  if (existsSync(OAUTH_TOKEN_PATH)) {
    const clientCfg = loadOAuthClientConfig();
    if (!clientCfg) {
      fail(`Found ${OAUTH_TOKEN_PATH} but ${OAUTH_CLIENT_PATH} is missing. Both are required.`);
    }
    const tokens = JSON.parse(readFileSync(OAUTH_TOKEN_PATH, 'utf-8'));
    if (!tokens.refresh_token) {
      fail(`${OAUTH_TOKEN_PATH} has no refresh_token. Re-run: npx tsx scripts/search-console.ts auth`);
    }
    const oauth = new OAuth2Client({
      clientId: clientCfg.clientId,
      clientSecret: clientCfg.clientSecret,
    });
    oauth.setCredentials({ refresh_token: tokens.refresh_token });
    cached = google.searchconsole({ version: 'v1', auth: oauth });
    return cached;
  }

  // Service-account fallback.
  if (KEY_PATH) {
    const path = resolve(KEY_PATH);
    if (!existsSync(path)) {
      fail(`Service account key not found at ${path}`);
    }
    const auth = new google.auth.GoogleAuth({ keyFile: path, scopes: SCOPES });
    cached = google.searchconsole({ version: 'v1', auth: (await auth.getClient()) as never });
    return cached;
  }

  fail(
    'No credentials configured. Either:\n' +
      '  • Run `npx tsx scripts/search-console.ts auth` to set up OAuth (recommended), or\n' +
      '  • Set GOOGLE_SEARCH_CONSOLE_KEY_PATH in .env to a service-account JSON key.'
  );
}

async function runAuthFlow() {
  const clientCfg = loadOAuthClientConfig();
  if (!clientCfg) {
    fail(
      `OAuth client config not found at ${OAUTH_CLIENT_PATH}\n\n` +
        'To create one:\n' +
        '  1. https://console.cloud.google.com/apis/credentials?project=remi-show-manager-489413\n' +
        '  2. Create credentials → OAuth client ID → Application type: Desktop app\n' +
        '  3. Name it (e.g. "Remi GSC CLI") → Create\n' +
        '  4. Download the JSON, save as secrets/gsc-oauth-client.json\n' +
        '  5. Add yourself as a test user on the OAuth consent screen if needed\n' +
        '     https://console.cloud.google.com/apis/credentials/consent?project=remi-show-manager-489413'
    );
  }

  // Spawn a local loopback server on a random free port and use it as redirect URI.
  const server = createServer();
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const oauth = new OAuth2Client({
    clientId: clientCfg.clientId,
    clientSecret: clientCfg.clientSecret,
    redirectUri,
  });
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even on subsequent runs
    scope: SCOPES,
  });

  console.log('\nOpening your browser to authorise…');
  console.log("If it doesn't open automatically, paste this URL:\n");
  console.log(authUrl + '\n');
  spawn('open', [authUrl], { detached: true, stdio: 'ignore' }).unref();

  const code = await new Promise<string>((resolveCode, rejectCode) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const errParam = url.searchParams.get('error');
      const codeParam = url.searchParams.get('code');
      if (errParam) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authorisation failed</h1><p>${errParam}</p>`);
        rejectCode(new Error(errParam));
        return;
      }
      if (codeParam) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>You\'re in.</h1><p>Authorisation complete — you can close this tab.</p>');
        resolveCode(codeParam);
      }
    });
    setTimeout(() => rejectCode(new Error('OAuth timed out after 5 min')), 5 * 60 * 1000);
  });
  server.close();

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    fail('Google did not return a refresh_token. Re-run with prompt=consent (already enabled — try revoking access at https://myaccount.google.com/permissions and re-authing).');
  }

  mkdirSync('./secrets', { recursive: true });
  writeFileSync(
    OAUTH_TOKEN_PATH,
    JSON.stringify({ refresh_token: tokens.refresh_token, scope: tokens.scope, saved_at: new Date().toISOString() }, null, 2)
  );
  console.log(`\n✓ Refresh token saved to ${OAUTH_TOKEN_PATH}`);
  console.log('\nNext: npx tsx scripts/search-console.ts sites');
}

function ensureSite(): string {
  if (!SITE_URL) {
    fail(
      'GOOGLE_SEARCH_CONSOLE_SITE_URL not set in .env.\n' +
        '  Domain property:     sc-domain:remishowmanager.co.uk\n' +
        '  URL-prefix property: https://remishowmanager.co.uk/  (trailing slash!)'
    );
  }
  return SITE_URL;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : Math.round(n).toLocaleString('en-GB');
const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `${(n * 100).toFixed(2)}%`;
const fmtPos = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));

// GSC has a ~3-day data lag — querying "today" returns nothing useful.
function dateRange(days: number) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

type Row = searchconsole_v1.Schema$ApiDataRow;

async function querySearchAnalytics(opts: {
  days: number;
  dimensions?: string[];
  rowLimit?: number;
}): Promise<Row[]> {
  const sc = await getClient();
  const siteUrl = ensureSite();
  const { startDate, endDate } = dateRange(opts.days);
  const rows: Row[] = [];
  const pageSize = opts.rowLimit ?? 25_000;
  let startRow = 0;
  // Paginate so we don't silently truncate once the site has volume.
  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: opts.dimensions ?? [],
        rowLimit: pageSize,
        startRow,
      },
    });
    const got = res.data.rows ?? [];
    rows.push(...got);
    if (got.length < pageSize) break;
    startRow += got.length;
    if (startRow >= 100_000) break; // safety cap
  }
  return rows;
}

function table(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    console.log('  (no rows)');
    return;
  }
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ');
  console.log(line(headers));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

const rowToCells = (r: Row, keyTransform: (k: string) => string = (k) => k) => [
  keyTransform(r.keys?.[0] ?? ''),
  fmtNum(r.clicks),
  fmtNum(r.impressions),
  fmtPct(r.ctr),
  fmtPos(r.position),
];

async function summary(days: number) {
  const siteUrl = ensureSite();
  const { startDate, endDate } = dateRange(days);
  console.log(`\nSearch Console — ${siteUrl}`);
  console.log(`Window: ${startDate} → ${endDate}  (${days} days; GSC has ~3-day lag)\n`);

  const [totals, queries, pages, devices, countries] = await Promise.all([
    querySearchAnalytics({ days }),
    querySearchAnalytics({ days, dimensions: ['query'], rowLimit: 10 }),
    querySearchAnalytics({ days, dimensions: ['page'], rowLimit: 10 }),
    querySearchAnalytics({ days, dimensions: ['device'] }),
    querySearchAnalytics({ days, dimensions: ['country'], rowLimit: 5 }),
  ]);

  const t = totals[0];
  if (!t) {
    console.log('No data in this window. Either the property is brand new, or the service account doesn\'t have access.');
    return;
  }
  console.log('TOTALS');
  console.log(`  Clicks:        ${fmtNum(t.clicks)}`);
  console.log(`  Impressions:   ${fmtNum(t.impressions)}`);
  console.log(`  CTR:           ${fmtPct(t.ctr)}`);
  console.log(`  Avg position:  ${fmtPos(t.position)}`);

  console.log('\nTOP 10 QUERIES');
  table(['Query', 'Clicks', 'Impr.', 'CTR', 'Pos'], queries.map((r) => rowToCells(r)));

  console.log('\nTOP 10 PAGES');
  table(['Page', 'Clicks', 'Impr.', 'CTR', 'Pos'], pages.map((r) => rowToCells(r)));

  console.log('\nDEVICE SPLIT');
  table(
    ['Device', 'Clicks', 'Impr.', 'CTR', 'Pos'],
    devices.map((r) => rowToCells(r, (k) => k.toLowerCase()))
  );

  console.log('\nTOP 5 COUNTRIES');
  table(
    ['Country', 'Clicks', 'Impr.', 'CTR', 'Pos'],
    countries.map((r) => rowToCells(r, (k) => k.toUpperCase()))
  );
  console.log();
}

async function topQueries(days: number, limit = 50) {
  const rows = await querySearchAnalytics({ days, dimensions: ['query'], rowLimit: limit });
  console.log(`\nTop ${rows.length} queries (${days}d):\n`);
  table(['Query', 'Clicks', 'Impr.', 'CTR', 'Pos'], rows.map((r) => rowToCells(r)));
  console.log();
}

async function topPages(days: number, limit = 50) {
  const rows = await querySearchAnalytics({ days, dimensions: ['page'], rowLimit: limit });
  console.log(`\nTop ${rows.length} pages (${days}d):\n`);
  table(['Page', 'Clicks', 'Impr.', 'CTR', 'Pos'], rows.map((r) => rowToCells(r)));
  console.log();
}

async function devicesReport(days: number) {
  const rows = await querySearchAnalytics({ days, dimensions: ['device'] });
  console.log(`\nDevice split (${days}d):\n`);
  table(
    ['Device', 'Clicks', 'Impr.', 'CTR', 'Pos'],
    rows.map((r) => rowToCells(r, (k) => k.toLowerCase()))
  );
  console.log();
}

async function countriesReport(days: number, limit = 25) {
  const rows = await querySearchAnalytics({ days, dimensions: ['country'], rowLimit: limit });
  console.log(`\nCountries (${days}d):\n`);
  table(
    ['Country', 'Clicks', 'Impr.', 'CTR', 'Pos'],
    rows.map((r) => rowToCells(r, (k) => k.toUpperCase()))
  );
  console.log();
}

async function datesReport(days: number) {
  const rows = await querySearchAnalytics({ days, dimensions: ['date'] });
  console.log(`\nDaily time series (${days}d):\n`);
  table(['Date', 'Clicks', 'Impr.', 'CTR', 'Pos'], rows.map((r) => rowToCells(r)));
  console.log();
}

async function sitemapsReport() {
  const sc = await getClient();
  const siteUrl = ensureSite();
  const res = await sc.sitemaps.list({ siteUrl });
  const list = res.data.sitemap ?? [];
  console.log(`\nSitemaps for ${siteUrl}:\n`);
  if (list.length === 0) {
    console.log('  (none submitted)\n');
    return;
  }
  for (const s of list) {
    console.log(`  ${s.path}`);
    console.log(`    Last submitted:  ${s.lastSubmitted ?? '—'}`);
    console.log(`    Last downloaded: ${s.lastDownloaded ?? '—'}`);
    if (s.contents?.[0]) {
      console.log(`    URLs submitted:  ${s.contents[0].submitted ?? '—'}`);
      console.log(`    URLs indexed:    ${s.contents[0].indexed ?? '—'}`);
    }
    console.log(`    Errors: ${s.errors ?? 0}, Warnings: ${s.warnings ?? 0}`);
    console.log();
  }
}

async function listSites() {
  const sc = await getClient();
  const res = await sc.sites.list({});
  const sites = res.data.siteEntry ?? [];
  console.log('\nVerified properties this service account can see:\n');
  if (sites.length === 0) {
    console.log('  (none — make sure you added the service account email in Search Console → Settings → Users)\n');
    return;
  }
  for (const s of sites) {
    console.log(`  ${(s.permissionLevel ?? '').padEnd(18)} ${s.siteUrl}`);
  }
  console.log();
}

async function inspect(url: string) {
  const sc = await getClient();
  const siteUrl = ensureSite();
  const res = await sc.urlInspection.index.inspect({
    requestBody: { inspectionUrl: url, siteUrl },
  });
  const r = res.data.inspectionResult;
  if (!r) {
    console.log('No result returned.');
    return;
  }
  console.log(`\nURL inspection: ${url}\n`);
  const idx = r.indexStatusResult;
  console.log(`  Verdict:        ${idx?.verdict ?? '—'}`);
  console.log(`  Coverage:       ${idx?.coverageState ?? '—'}`);
  console.log(`  Last crawl:     ${idx?.lastCrawlTime ?? '—'}`);
  console.log(`  Robots.txt:     ${idx?.robotsTxtState ?? '—'}`);
  console.log(`  Indexing state: ${idx?.indexingState ?? '—'}`);
  console.log(`  Page fetch:     ${idx?.pageFetchState ?? '—'}`);
  console.log(`  Google canon:   ${idx?.googleCanonical ?? '—'}`);
  console.log(`  User canon:     ${idx?.userCanonical ?? '—'}`);
  if (r.mobileUsabilityResult) {
    console.log(`  Mobile:         ${r.mobileUsabilityResult.verdict ?? '—'}`);
  }
  if (r.richResultsResult) {
    console.log(`  Rich results:   ${r.richResultsResult.verdict ?? '—'}`);
  }
  console.log();
}

const HELP = `Google Search Console insights

Commands:
  auth                  One-off OAuth login (saves a refresh token to secrets/)
  summary               28-day overview: totals + top queries/pages/devices/countries
  queries               Top 50 search queries
  pages                 Top 50 landing pages
  devices               Mobile / desktop / tablet split
  countries             Top 25 countries
  dates                 Daily time series
  sitemaps              Submitted sitemaps + indexed-URL counts
  sites                 List all properties this account can see
  inspect <url>         URL inspection (index status, canonical, mobile, rich results)

Flags:
  --days N              Lookback window in days (default 28)
  -h, --help            Show this help

Examples:
  npx tsx scripts/search-console.ts
  npx tsx scripts/search-console.ts queries --days 90
  npx tsx scripts/search-console.ts inspect https://remishowmanager.co.uk/shows/abc-123
`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let days = 28;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') {
      days = parseInt(argv[++i] ?? '28', 10);
      if (Number.isNaN(days) || days <= 0) fail('--days must be a positive integer');
    } else if (a === '--help' || a === '-h' || a === 'help') {
      help = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, days, help };
}

async function main() {
  const { positional, days, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    return;
  }
  const cmd = positional[0] ?? 'summary';
  switch (cmd) {
    case 'auth':      return runAuthFlow();
    case 'summary':   return summary(days);
    case 'queries':   return topQueries(days);
    case 'pages':     return topPages(days);
    case 'devices':   return devicesReport(days);
    case 'countries': return countriesReport(days);
    case 'dates':     return datesReport(days);
    case 'sitemaps':  return sitemapsReport();
    case 'sites':     return listSites();
    case 'inspect': {
      const url = positional[1];
      if (!url) fail('Usage: search-console.ts inspect <url>');
      return inspect(url);
    }
    default:
      fail(
        `Unknown command: ${cmd}\n` +
          'Available: auth | summary | queries | pages | devices | countries | dates | sitemaps | sites | inspect <url>\n' +
          'Add --days N to override lookback (default 28)'
      );
  }
}

main().catch((err: unknown) => {
  const e = err as { message?: string; errors?: unknown; response?: { data?: unknown } };
  console.error('\nError:', e.message ?? err);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  else if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
  process.exit(1);
});
