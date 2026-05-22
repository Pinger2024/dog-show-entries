/**
 * Weekly Google Search Console report builder for remishowmanager.co.uk.
 *
 * Pulls the last 7 days of GSC data, compares against the prior 7-day
 * window, and sends an HTML email via Resend. Modelled on the Oldman Homes
 * monthly report — same shape, weekly cadence, Remi branding.
 *
 * Auth: refreshes a Google OAuth token from `GSC_REFRESH_TOKEN`. The local
 * `scripts/search-console.ts` saves this token to disk; for Render we lift
 * the same value into an env var so the cron route can read it without a
 * filesystem dependency.
 *
 * Env vars:
 *   GSC_CLIENT_ID         (from secrets/gsc-oauth-client.json → installed.client_id)
 *   GSC_CLIENT_SECRET     (from secrets/gsc-oauth-client.json → installed.client_secret)
 *   GSC_REFRESH_TOKEN     (from secrets/gsc-oauth-token.json → refresh_token)
 *   GSC_SITE_URL          | GOOGLE_SEARCH_CONSOLE_SITE_URL  (default: https://remishowmanager.co.uk/)
 *   RESEND_API_KEY        (existing)
 *   REPORT_FROM           (default: Remi <noreply@remishowmanager.co.uk>)
 *   WEEKLY_SEO_RECIPIENTS (comma-separated; default: Michael + Amanda)
 *
 * Note: GSC_CLIENT_ID is distinct from GOOGLE_CLIENT_ID (which is NextAuth's
 * sign-in client). The refresh token is only valid against the OAuth client
 * that minted it — `secrets/gsc-oauth-client.json` — so we don't fall back
 * to GOOGLE_*.
 */

type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type GscResponse = { rows?: GscRow[] };

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GSC_CLIENT_ID || '';
  const clientSecret = process.env.GSC_CLIENT_SECRET || '';
  const refreshToken = process.env.GSC_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GSC OAuth env vars missing — need GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN',
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`GSC token refresh failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

async function gscQuery(
  accessToken: string,
  siteUrl: string,
  payload: Record<string, unknown>,
): Promise<GscResponse> {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GscResponse;
}

function totalsRow(r: GscResponse): {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
} {
  const row = r.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

function delta(now: number, prev: number): string {
  if (prev === 0) return now > 0 ? 'new' : 'n/a';
  const pct = ((now - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function buildWeeklyReportHtml(): Promise<{
  html: string;
  subject: string;
  summary: { clicks: number; impressions: number; ctrPct: number; position: number };
}> {
  const siteUrl =
    process.env.GSC_SITE_URL ||
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
    'https://remishowmanager.co.uk/';
  const accessToken = await getAccessToken();

  // GSC has a 2-3 day data lag; anchor the window two days back from today.
  const endA = isoDaysAgo(2);
  const startA = isoDaysAgo(9); // 7-day window
  const endB = isoDaysAgo(10);
  const startB = isoDaysAgo(17);

  const [totA, totB, queries, pages] = await Promise.all([
    gscQuery(accessToken, siteUrl, { startDate: startA, endDate: endA, dimensions: [] }),
    gscQuery(accessToken, siteUrl, { startDate: startB, endDate: endB, dimensions: [] }),
    gscQuery(accessToken, siteUrl, {
      startDate: startA,
      endDate: endA,
      dimensions: ['query'],
      rowLimit: 10,
    }),
    gscQuery(accessToken, siteUrl, {
      startDate: startA,
      endDate: endA,
      dimensions: ['page'],
      rowLimit: 10,
    }),
  ]);

  const a = totalsRow(totA);
  const b = totalsRow(totB);

  const subject = `Remi this week: ${a.clicks.toLocaleString()} visits from Google`;

  const positionPage = Math.max(1, Math.ceil(a.position / 10));
  const positionLabel =
    positionPage === 1 ? 'page 1 of Google' : `page ${positionPage} of Google`;

  const summarySentence =
    a.clicks > 0
      ? `In the last 7 days, <strong>${a.clicks.toLocaleString()} people visited Remi</strong> after finding it on Google. The site appeared in Google search results ${a.impressions.toLocaleString()} times.`
      : `In the last 7 days Remi received no Google clicks. This is usually fine in the first few weeks after launch or after big content changes — Google takes time to reindex.`;

  const queryRows = (queries.rows ?? [])
    .map((r) => {
      const pos = Math.max(1, Math.ceil((r.position ?? 0) / 10));
      const posLabel = pos === 1 ? 'Page 1' : `Page ${pos}`;
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">${esc(r.keys?.[0] ?? '')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;">${r.clicks}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#666;">${r.impressions}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#666;">${posLabel}</td>
      </tr>`;
    })
    .join('');

  const pageRows = (pages.rows ?? [])
    .map((r) => {
      const url = r.keys?.[0] ?? '';
      const short =
        url
          .replace('https://remishowmanager.co.uk', '')
          .replace('https://www.remishowmanager.co.uk', '') || '/';
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;"><a href="${esc(url)}" style="color:#2D5F3F;text-decoration:none;">${esc(short)}</a></td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;">${r.clicks}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#666;">${r.impressions}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;">

        <tr><td style="height:4px;background:linear-gradient(to right,#2D5F3F,#B8963E);"></td></tr>

        <tr><td style="padding:28px 36px 8px;text-align:center;">
          <h1 style="margin:0;font-size:22px;color:#2D5F3F;font-weight:600;letter-spacing:0.5px;">Remi · weekly SEO report</h1>
          <p style="margin:6px 0 0;color:#7A7A7A;font-size:13px;">${esc(startA)} to ${esc(endA)}</p>
        </td></tr>

        <tr><td style="padding:20px 36px 4px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#1A1A1A;">${summarySentence}</p>
        </td></tr>

        <tr><td style="padding:20px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="32%" style="padding:14px;background:#F5F3EE;border-radius:4px;text-align:center;vertical-align:top;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;font-weight:600;">Visits from Google</p>
                <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D5F3F;line-height:1;">${a.clicks.toLocaleString()}</p>
                <p style="margin:0;font-size:12px;color:#4A4A4A;">${delta(a.clicks, b.clicks)} vs the week before</p>
              </td>
              <td width="2%"></td>
              <td width="32%" style="padding:14px;background:#F5F3EE;border-radius:4px;text-align:center;vertical-align:top;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;font-weight:600;">Times shown on Google</p>
                <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D5F3F;line-height:1;">${a.impressions.toLocaleString()}</p>
                <p style="margin:0;font-size:12px;color:#4A4A4A;">${delta(a.impressions, b.impressions)} vs the week before</p>
              </td>
              <td width="2%"></td>
              <td width="32%" style="padding:14px;background:#F5F3EE;border-radius:4px;text-align:center;vertical-align:top;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;font-weight:600;">Average Google ranking</p>
                <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D5F3F;line-height:1;">${a.position.toFixed(0)}</p>
                <p style="margin:0;font-size:12px;color:#4A4A4A;">roughly ${positionLabel}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 36px 8px;">
          <p style="margin:0 0 10px;font-size:13px;color:#1A1A1A;font-weight:600;">What people searched for to find Remi</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E0D5;border-radius:6px;overflow:hidden;font-size:14px;">
            <tr style="background:#F5F3EE;">
              <th align="left" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Search term</th>
              <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Visits</th>
              <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Times shown</th>
              <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Where you rank</th>
            </tr>
            ${queryRows || `<tr><td colspan="4" style="padding:14px;text-align:center;color:#7A7A7A;">No Google search data yet for this window.</td></tr>`}
          </table>
        </td></tr>

        <tr><td style="padding:16px 36px 24px;">
          <p style="margin:0 0 10px;font-size:13px;color:#1A1A1A;font-weight:600;">Most-visited pages on Remi</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E0D5;border-radius:6px;overflow:hidden;font-size:14px;">
            <tr style="background:#F5F3EE;">
              <th align="left" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Page</th>
              <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Visits</th>
              <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;">Times shown</th>
            </tr>
            ${pageRows || `<tr><td colspan="3" style="padding:14px;text-align:center;color:#7A7A7A;">No page data yet for this window.</td></tr>`}
          </table>
        </td></tr>

        <tr><td style="padding:0 36px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;border-radius:6px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:#7A7A7A;font-weight:600;">Quick guide</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#4A4A4A;">
                <strong style="color:#1A1A1A;">Visits</strong> = people who clicked from Google to Remi.
                <strong style="color:#1A1A1A;">Times shown</strong> = how often Remi appeared in Google's search results.
                <strong style="color:#1A1A1A;">Where you rank</strong> = roughly which page of Google Remi appears on for that search (page 1 is best).
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background-color:#2D5F3F;padding:18px 36px;">
          <p style="margin:0;color:#F5F3EE;font-size:12px;text-align:center;">
            Automated weekly report from <a href="https://remishowmanager.co.uk" style="color:#B8963E;text-decoration:none;">remishowmanager.co.uk</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  return {
    html,
    subject,
    summary: {
      clicks: a.clicks,
      impressions: a.impressions,
      ctrPct: a.ctr * 100,
      position: a.position,
    },
  };
}

export async function sendWeeklyReport(): Promise<{
  ok: boolean;
  recipients: string[];
  summary: unknown;
}> {
  const { html, subject, summary } = await buildWeeklyReportHtml();

  const recipients = (
    process.env.WEEKLY_SEO_RECIPIENTS ||
    'michael@prometheus-it.com,hundarkgsd@gmail.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const from = process.env.REPORT_FROM || 'Remi <noreply@remishowmanager.co.uk>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      reply_to: process.env.FEEDBACK_EMAIL || 'feedback@inbound.remishowmanager.co.uk',
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }

  return { ok: true, recipients, summary };
}
