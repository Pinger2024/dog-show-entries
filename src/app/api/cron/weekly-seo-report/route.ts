import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyReport } from '@/lib/gsc-weekly-report';
import { requireCronSecret } from '@/server/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Triggered by a Render cron job once a week (Monday 08:00 UK time).
 * Auth via shared CRON_SECRET passed either as a Bearer token or a
 * `?secret=` query param — matches the pattern in `/api/cron`.
 *
 * Manual test:
 *   curl "https://remishowmanager.co.uk/api/cron/weekly-seo-report?secret=$CRON_SECRET"
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const result = await sendWeeklyReport();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Weekly SEO report failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Also accept POST so it works regardless of how the cron job is configured.
export const POST = GET;
