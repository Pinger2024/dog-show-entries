import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  judgeAssignments,
  shows,
  showClasses,
  entryClasses,
  results,
  entries,
  achievements,
  breeds,
} from '@/server/db/schema';
import { Resend } from 'resend';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(title: string, body: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Remi</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background-color: #f5f3ef;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container { max-width: 680px; width: 100%; }
    .logo {
      text-align: center;
      padding: 24px 0;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 28px;
      color: #2D5F3F;
      letter-spacing: -0.5px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .banner {
      background: #2D5F3F;
      padding: 24px;
      text-align: center;
      color: #ffffff;
    }
    .banner h2 { font-size: 22px; font-weight: 700; }
    .banner .sub { color: #b8d4c4; font-size: 14px; margin-top: 8px; }
    .body { padding: 24px; }
    .body p { font-size: 15px; line-height: 1.6; color: #333; margin-bottom: 16px; }
    .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .detail-table td { padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
    .detail-table .label { font-weight: 600; color: #444; width: 100px; }
    .breed-section { margin: 24px 0; padding: 16px; background: #fafaf8; border-radius: 8px; border: 1px solid #e5e5e5; }
    .breed-section h3 { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    .class-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .class-table th { padding: 6px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 2px solid #e5e5e5; }
    .class-table td { padding: 6px 10px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .class-header { font-weight: 600; color: #444; padding: 10px 10px 4px; font-size: 14px; }
    .placement-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .p1 { background: #fef3c7; color: #92400e; }
    .p2 { background: #f3f4f6; color: #374151; }
    .p3 { background: #fde9d9; color: #7c3415; }
    .buttons { text-align: center; margin: 28px 0; }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-primary { background: #2D5F3F; color: #ffffff; }
    .btn-outline { background: transparent; border: 1px solid #ddd; color: #666; margin-left: 12px; }
    .success-icon { font-size: 48px; margin-bottom: 12px; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #999; }
    form { display: inline; }
    textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; margin-bottom: 16px; }
    .award-badge { display: inline-block; padding: 2px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 600; margin: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Remi</div>
    <div class="card">
      ${body}
    </div>
    <div class="footer">
      <p>Powered by <strong>Remi</strong> — Dog Show Entry Management</p>
    </div>
  </div>
</body>
</html>`;
}

const placementLabels: Record<number, string> = {
  1: '1st', 2: '2nd', 3: '3rd', 4: 'VHC', 5: 'HC', 6: 'Commended', 7: 'Reserve',
};

const achievementLabels: Record<string, string> = {
  best_in_show: 'Best in Show', reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show', best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed', best_veteran_in_breed: 'Best Veteran in Breed',
  dog_cc: 'Dog CC', reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC', reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog', best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog', best_long_coat_bitch: 'Best Long Coat Bitch',
  best_long_coat_in_show: 'Best Long Coat in Show', cc: 'CC', reserve_cc: 'Reserve CC',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Look up assignment by approval token
  const assignment = await db.query.judgeAssignments.findFirst({
    where: eq(judgeAssignments.approvalToken, token),
    with: {
      judge: true,
      show: { with: { venue: true, organisation: true } },
    },
  });

  if (!assignment) {
    return new NextResponse(
      renderPage('Not Found', `
        <div class="banner"><h2>Link Not Found</h2></div>
        <div class="body">
          <p>This approval link is not valid. It may have already been used or superseded by a newer request.</p>
          <p>If you believe this is an error, please contact the show secretary.</p>
        </div>
      `),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Already actioned (approved or declined/queried)
  if (assignment.approvalStatus && assignment.approvalStatus !== 'pending') {
    const isApproved = assignment.approvalStatus === 'approved';
    return new NextResponse(
      renderPage(isApproved ? 'Already Approved' : 'Query Submitted', `
        <div class="banner">
          <div class="success-icon">${isApproved ? '&#10003;' : '&#9888;'}</div>
          <h2>${isApproved ? 'Results Already Approved' : 'Query Already Submitted'}</h2>
        </div>
        <div class="body">
          <p>${isApproved
            ? `You have already approved the results for <strong>${esc(assignment.show.name)}</strong>.`
            : `A query has been submitted for the results of <strong>${esc(assignment.show.name)}</strong>. The secretary will review and contact you if needed.`
          }</p>
          <p style="color: #666; font-size: 14px;">You can safely close this page.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const show = assignment.show;
  const judge = assignment.judge;
  const orgName = show.organisation?.name ?? 'the Show Society';

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const venue = show.venue
    ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
    : 'Venue TBC';

  // Get ALL assignment rows for this judge/show (same token)
  const allAssignments = await db.query.judgeAssignments.findMany({
    where: and(
      eq(judgeAssignments.showId, show.id),
      eq(judgeAssignments.judgeId, judge.id),
      eq(judgeAssignments.approvalToken, token)
    ),
    with: { breed: true },
  });

  // Get breed IDs from assignments
  const breedIds = allAssignments.filter((a) => a.breedId).map((a) => a.breedId!);
  const breedNames = allAssignments.filter((a) => a.breed).map((a) => a.breed!.name);
  const breedsText = breedNames.length > 0 ? breedNames.join(', ') : 'All breeds';

  // Get results for the judge's assigned breeds
  const classes = await db.query.showClasses.findMany({
    where: eq(showClasses.showId, show.id),
    with: {
      classDefinition: true,
      breed: true,
      entryClasses: {
        with: {
          entry: {
            columns: { id: true, catalogueNumber: true, status: true, deletedAt: true, dogId: true, absent: true },
            with: {
              dog: { columns: { id: true, registeredName: true } },
            },
          },
          result: true,
        },
      },
    },
    orderBy: [asc(showClasses.sortOrder)],
  });

  // Filter to judge's breeds (or all if no breed filter)
  const filteredClasses = breedIds.length > 0
    ? classes.filter((c) => c.breedId && breedIds.includes(c.breedId))
    : classes;

  // Get achievements for the judge's breeds
  const showAchievements = await db.query.achievements.findMany({
    where: eq(achievements.showId, show.id),
    with: { dog: { columns: { id: true, registeredName: true } } },
  });

  // Build breed-grouped results HTML
  const breedGroupMap = new Map<string, {
    breedName: string;
    classesHtml: string[];
    entryCount: number;
    achievementsHtml: string[];
  }>();

  for (const sc of filteredClasses) {
    const breedName = sc.breed?.name ?? 'Any Breed';
    if (!breedGroupMap.has(breedName)) {
      breedGroupMap.set(breedName, { breedName, classesHtml: [], entryCount: 0, achievementsHtml: [] });
    }

    const confirmed = sc.entryClasses.filter(
      (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
    );
    const dogsForward = confirmed.filter((ec) => !ec.entry.absent).length;

    const resultRows = sc.entryClasses
      .filter((ec) => ec.result && ec.entry.status === 'confirmed' && !ec.entry.deletedAt)
      .sort((a, b) => (a.result!.placement ?? 99) - (b.result!.placement ?? 99))
      .map((ec) => {
        const r = ec.result!;
        const pLabel = r.placement ? placementLabels[r.placement] ?? `${r.placement}th` : '—';
        const pClass = r.placement === 1 ? 'p1' : r.placement === 2 ? 'p2' : r.placement === 3 ? 'p3' : '';
        return `<tr>
          <td>${ec.entry.catalogueNumber ?? '—'}</td>
          <td>${ec.entry.dog?.registeredName ?? 'Unknown'}</td>
          <td><span class="placement-badge ${pClass}">${pLabel}</span></td>
          <td>${r.specialAward ?? ''}</td>
        </tr>`;
      })
      .join('');

    const sexLabel = sc.sex === 'dog' ? ' Dog' : sc.sex === 'bitch' ? ' Bitch' : '';
    const classNum = sc.classNumber != null ? `#${sc.classNumber} ` : '';

    breedGroupMap.get(breedName)!.classesHtml.push(`
      <div class="class-header">${classNum}${sc.classDefinition.name}${sexLabel} <span style="color: #999; font-weight: normal; font-size: 12px;">(${confirmed.length} entered, ${dogsForward} forward)</span></div>
      ${resultRows ? `<table class="class-table"><thead><tr><th>Cat #</th><th>Dog</th><th>Place</th><th>Award</th></tr></thead><tbody>${resultRows}</tbody></table>` : '<p style="padding: 4px 10px; font-size: 13px; color: #999;">No results recorded</p>'}
    `);

    breedGroupMap.get(breedName)!.entryCount += confirmed.length;
  }

  // Add breed-level achievements
  for (const a of showAchievements) {
    // Find which breed this dog belongs to (from entries)
    for (const sc of filteredClasses) {
      const dogEntry = sc.entryClasses.find((ec) => ec.entry.dogId === a.dogId);
      if (dogEntry) {
        const breedName = sc.breed?.name ?? 'Any Breed';
        const group = breedGroupMap.get(breedName);
        if (group) {
          const label = achievementLabels[a.type] ?? a.type;
          group.achievementsHtml.push(
            `<span class="award-badge">${label}: ${a.dog?.registeredName ?? 'Unknown'}</span>`
          );
        }
        break;
      }
    }
  }

  const breedSections = Array.from(breedGroupMap.values())
    .sort((a, b) => a.breedName.localeCompare(b.breedName))
    .map((group) => `
      <div class="breed-section">
        <h3>${group.breedName} <span style="font-weight: normal; font-size: 13px; color: #666;">(${group.entryCount} entries)</span></h3>
        ${group.achievementsHtml.length > 0 ? `<div style="margin-bottom: 12px;">${group.achievementsHtml.join('')}</div>` : ''}
        ${group.classesHtml.join('')}
      </div>
    `)
    .join('');

  const action = request.nextUrl.searchParams.get('action');

  // Query page
  if (action === 'query') {
    return new NextResponse(
      renderPage('Query Results', `
        <div class="banner">
          <h2>Raise a Query</h2>
          <div class="sub">${show.name}</div>
        </div>
        <div class="body">
          <p>If you have concerns about the recorded results, please describe them below. The show secretary will be notified.</p>
          <form method="POST" action="/api/results-approval/${token}">
            <input type="hidden" name="action" value="query">
            <textarea name="note" rows="4" placeholder="Describe the issue..." required></textarea>
            <div class="buttons">
              <button type="submit" class="btn btn-outline" style="border-color: #dc2626; color: #dc2626;">Submit Query</button>
              <a href="/api/results-approval/${token}" class="btn btn-outline">Go Back</a>
            </div>
          </form>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Default: approval page with results
  return new NextResponse(
    renderPage('Results Approval', `
      <div class="banner">
        <h2>Results Approval</h2>
        <div class="sub">from ${orgName}</div>
      </div>
      <div class="body">
        <p>Dear ${judge.name},</p>
        <p>Please review the results recorded for your judging at <strong>${show.name}</strong> and confirm they are correct.</p>

        <table class="detail-table">
          <tr><td class="label">Show</td><td>${show.name}</td></tr>
          <tr><td class="label">Date</td><td>${showDate}</td></tr>
          <tr><td class="label">Venue</td><td>${venue}</td></tr>
          <tr><td class="label">Breeds</td><td>${breedsText}</td></tr>
        </table>

        ${breedSections}

        <form method="POST" action="/api/results-approval/${token}">
          <input type="hidden" name="action" value="approve">
          <p style="font-size: 14px; color: #666;">Optional note (e.g., minor corrections):</p>
          <textarea name="note" rows="3" placeholder="Any comments (optional)"></textarea>
          <div class="buttons">
            <button type="submit" class="btn btn-primary">I Approve These Results</button>
            <a href="/api/results-approval/${token}?action=query" class="btn btn-outline">I Have a Query</a>
          </div>
        </form>
      </div>
    `),
    { headers: { 'Content-Type': 'text/html' } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const formData = await request.formData();
  const action = formData.get('action') as string;
  const note = (formData.get('note') as string)?.trim() || null;

  const assignment = await db.query.judgeAssignments.findFirst({
    where: eq(judgeAssignments.approvalToken, token),
    with: {
      judge: true,
      show: { with: { organisation: true } },
    },
  });

  if (!assignment) {
    return new NextResponse(
      renderPage('Not Found', `
        <div class="banner"><h2>Link Not Found</h2></div>
        <div class="body"><p>This approval link is not valid.</p></div>
      `),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (assignment.approvalStatus && assignment.approvalStatus !== 'pending') {
    const statusMessage = assignment.approvalStatus === 'approved'
      ? 'You have already approved these results.'
      : 'A query has been submitted for these results. Please wait for the secretary to resend the approval request.';
    return new NextResponse(
      renderPage(assignment.approvalStatus === 'approved' ? 'Already Approved' : 'Query Submitted', `
        <div class="banner">
          <div class="success-icon">${assignment.approvalStatus === 'approved' ? '&#10003;' : '&#9888;'}</div>
          <h2>${assignment.approvalStatus === 'approved' ? 'Already Approved' : 'Query Already Submitted'}</h2>
        </div>
        <div class="body"><p>${statusMessage}</p></div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const show = assignment.show;
  const judge = assignment.judge;
  const orgName = show.organisation?.name ?? 'the Show Society';

  if (action === 'approve') {
    // Update all assignment rows for this judge/show/token
    await db
      .update(judgeAssignments)
      .set({
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvalNote: note,
      })
      .where(
        and(
          eq(judgeAssignments.showId, show.id),
          eq(judgeAssignments.judgeId, judge.id),
          eq(judgeAssignments.approvalToken, token)
        )
      );

    // Notify secretary
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';
      const adminEmail = process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';
      const secretaryEmail = show.secretaryEmail;
      const toAddresses = [adminEmail, ...(secretaryEmail && secretaryEmail !== adminEmail ? [secretaryEmail] : [])];

      await resend.emails.send({
        from: emailFrom,
        to: toAddresses,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
        subject: `Results Approved — ${judge.name} for ${show.name}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 28px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
        <h2 style="margin: 0; color: #fff; font-size: 22px;">Results Approved</h2>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          <strong>${judge.name}</strong> has approved the results for <strong>${show.name}</strong>.
        </p>
        ${note ? `<p style="font-size: 14px; color: #555; padding: 12px; background: #f9f8f6; border-radius: 8px;"><strong>Note from judge:</strong> ${esc(note)}</p>` : ''}
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          When all judges have approved, you can publish the results to make them visible to exhibitors and the public.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk'}/secretary/shows/${show.slug ?? show.id}/results"
             style="display: inline-block; background: #2D5F3F; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none;">
            View Results in Remi
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
      });
    } catch (error) {
      console.error('[email] Failed to notify secretary of results approval:', error);
    }

    return new NextResponse(
      renderPage('Approved', `
        <div class="banner">
          <div class="success-icon">&#10003;</div>
          <h2>Thank You</h2>
        </div>
        <div class="body">
          <p>Thank you for approving the results for <strong>${show.name}</strong>.</p>
          <p>${orgName} has been notified and will publish the results shortly.</p>
          ${note ? `<p style="font-size: 14px; padding: 12px; background: #f9f8f6; border-radius: 8px; color: #555;"><strong>Your note:</strong> ${esc(note)}</p>` : ''}
          <p style="color: #666; font-size: 14px;">You can safely close this page.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (action === 'query') {
    if (!note) {
      return new NextResponse(
        renderPage('Query Required', `
          <div class="banner"><h2>Please Describe the Issue</h2></div>
          <div class="body">
            <p>Please go back and describe your query before submitting.</p>
            <div class="buttons">
              <a href="/api/results-approval/${token}?action=query" class="btn btn-primary">Go Back</a>
            </div>
          </div>
        `),
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Store query on assignment rows
    await db
      .update(judgeAssignments)
      .set({
        approvalStatus: 'declined',
        approvalNote: note,
      })
      .where(
        and(
          eq(judgeAssignments.showId, show.id),
          eq(judgeAssignments.judgeId, judge.id),
          eq(judgeAssignments.approvalToken, token)
        )
      );

    // Notify secretary
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';
      const adminEmail = process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';
      const secretaryEmail = show.secretaryEmail;
      const toAddresses = [adminEmail, ...(secretaryEmail && secretaryEmail !== adminEmail ? [secretaryEmail] : [])];

      await resend.emails.send({
        from: emailFrom,
        to: toAddresses,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
        subject: `Results Query — ${judge.name} for ${show.name}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 28px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #dc2626; padding: 24px; text-align: center;">
        <h2 style="margin: 0; color: #fff; font-size: 22px;">Results Query from Judge</h2>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          <strong>${judge.name}</strong> has raised a query about the results for <strong>${show.name}</strong>.
        </p>
        <p style="font-size: 14px; color: #555; padding: 12px; background: #fef2f2; border-radius: 8px; border-left: 3px solid #dc2626;">
          <strong>Query:</strong> ${esc(note)}
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          Please review the results and make any corrections, then resend the approval request.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk'}/secretary/shows/${show.slug ?? show.id}/results"
             style="display: inline-block; background: #2D5F3F; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none;">
            Review Results in Remi
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
      });
    } catch (error) {
      console.error('[email] Failed to notify secretary of judge query:', error);
    }

    return new NextResponse(
      renderPage('Query Submitted', `
        <div class="banner"><h2>Query Submitted</h2></div>
        <div class="body">
          <p>Your query has been sent to the show secretary for <strong>${show.name}</strong>.</p>
          <p style="font-size: 14px; padding: 12px; background: #f9f8f6; border-radius: 8px; color: #555;"><strong>Your query:</strong> ${esc(note)}</p>
          <p>They will review the results and contact you if needed. Once any corrections have been made, you'll receive a new approval request.</p>
          <p style="color: #666; font-size: 14px;">You can safely close this page.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  return new NextResponse(
    renderPage('Invalid Action', `
      <div class="banner"><h2>Invalid Action</h2></div>
      <div class="body"><p>The action you requested is not valid.</p></div>
    `),
    { status: 400, headers: { 'Content-Type': 'text/html' } }
  );
}
