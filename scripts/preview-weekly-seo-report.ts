/**
 * Render the weekly SEO report HTML locally and write it to
 * /tmp/weekly-seo-report.html so we can preview it in a browser before
 * the cron actually fires. Optionally sends a copy via Resend.
 *
 * Usage:
 *   npx tsx scripts/preview-weekly-seo-report.ts          # preview HTML only
 *   npx tsx scripts/preview-weekly-seo-report.ts --send   # also send via Resend
 *
 * Picks up the refresh token from ./secrets/gsc-oauth-token.json if
 * GSC_REFRESH_TOKEN isn't set in the environment, so you don't have to
 * shuffle env vars locally.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Hydrate GSC_* env vars from the local OAuth files if they aren't set —
// the refresh token is only valid against the OAuth client that minted it,
// so we have to use the matching pair.
const CLIENT_PATH = './secrets/gsc-oauth-client.json';
const TOKEN_PATH = './secrets/gsc-oauth-token.json';

if (existsSync(CLIENT_PATH)) {
  const c = JSON.parse(readFileSync(CLIENT_PATH, 'utf-8'));
  const k = c.installed || c.web || {};
  if (!process.env.GSC_CLIENT_ID && k.client_id) process.env.GSC_CLIENT_ID = k.client_id;
  if (!process.env.GSC_CLIENT_SECRET && k.client_secret)
    process.env.GSC_CLIENT_SECRET = k.client_secret;
}
if (!process.env.GSC_REFRESH_TOKEN && existsSync(TOKEN_PATH)) {
  const t = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) as { refresh_token?: string };
  if (t.refresh_token) process.env.GSC_REFRESH_TOKEN = t.refresh_token;
}

async function main() {
  const { buildWeeklyReportHtml, sendWeeklyReport } = await import('../src/lib/gsc-weekly-report');

  const send = process.argv.includes('--send');
  const { html, subject, summary } = await buildWeeklyReportHtml();
  const out = '/tmp/weekly-seo-report.html';
  writeFileSync(out, html);
  console.log(`✅ Wrote ${out}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Summary:`, summary);

  if (send) {
    const result = await sendWeeklyReport();
    console.log(`📧 Sent to: ${result.recipients.join(', ')}`);
  } else {
    console.log(`(dry run — pass --send to email it)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
