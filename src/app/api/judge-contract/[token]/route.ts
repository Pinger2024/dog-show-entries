import { NextRequest, NextResponse } from 'next/server';
import { eq, and, ilike } from 'drizzle-orm';
import { db } from '@/server/db';
import { judgeContracts, judgeAssignments, showChecklistItems } from '@/server/db/schema';
import { Resend } from 'resend';

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
    .container { max-width: 560px; width: 100%; }
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
    .detail-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .detail-table td { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; }
    .detail-table .label { font-weight: 600; color: #444; width: 120px; }
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
    .btn-danger { background: #dc2626; color: #ffffff; margin-left: 12px; }
    .btn-outline { background: transparent; border: 1px solid #ddd; color: #666; margin-left: 12px; }
    .success-icon { font-size: 48px; margin-bottom: 12px; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #999; }
    form { display: inline; }
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const action = request.nextUrl.searchParams.get('action');

  const contract = await db.query.judgeContracts.findFirst({
    where: eq(judgeContracts.offerToken, token),
    with: {
      show: { with: { venue: true, organisation: true } },
      judge: true,
    },
  });

  if (!contract) {
    return new NextResponse(
      renderPage('Not Found', `
        <div class="banner"><h2>Link Not Found</h2></div>
        <div class="body">
          <p>This contract link is not valid. It may have already been used or the contract may have been cancelled.</p>
          <p>If you believe this is an error, please contact the show secretary.</p>
        </div>
      `),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Check token expiry
  if (contract.tokenExpiresAt && new Date() > contract.tokenExpiresAt) {
    return new NextResponse(
      renderPage('Link Expired', `
        <div class="banner"><h2>Link Expired</h2></div>
        <div class="body">
          <p>This offer link has expired. Please contact the show secretary to request a new offer.</p>
        </div>
      `),
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // If already responded
  if (contract.stage === 'offer_accepted' || contract.stage === 'confirmed') {
    return new NextResponse(
      renderPage('Already Accepted', `
        <div class="banner">
          <div class="success-icon">&#10003;</div>
          <h2>Already Accepted</h2>
        </div>
        <div class="body">
          <p>You have already accepted this judging appointment${contract.stage === 'confirmed' ? ' and it has been confirmed by the society' : '. The society will send your formal confirmation shortly'}.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (contract.stage === 'declined') {
    return new NextResponse(
      renderPage('Declined', `
        <div class="banner"><h2>Offer Declined</h2></div>
        <div class="body">
          <p>You have already declined this judging appointment. If you would like to reconsider, please contact the show secretary directly.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Get breed assignments for display
  const assignments = await db.query.judgeAssignments.findMany({
    where: and(
      eq(judgeAssignments.showId, contract.showId),
      eq(judgeAssignments.judgeId, contract.judgeId)
    ),
    with: { breed: true, ring: true },
  });

  const breedNames = assignments.filter((a) => a.breed).map((a) => a.breed!.name);
  const breedsText = breedNames.length > 0 ? breedNames.join(', ') : 'All breeds';

  const show = contract.show;
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

  // Show acceptance page or decline confirmation based on action
  if (action === 'decline') {
    return new NextResponse(
      renderPage('Decline Appointment', `
        <div class="banner">
          <h2>Decline Appointment</h2>
          <div class="sub">${orgName}</div>
        </div>
        <div class="body">
          <p>You are about to decline the invitation to judge at <strong>${show.name}</strong> on <strong>${showDate}</strong>.</p>
          <p>Are you sure you wish to decline?</p>
          <div class="buttons">
            <form method="POST" action="/api/judge-contract/${token}">
              <input type="hidden" name="action" value="decline">
              <button type="submit" class="btn btn-danger">Yes, Decline</button>
            </form>
            <a href="/api/judge-contract/${token}" class="btn btn-outline">Go Back</a>
          </div>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Default: show the full offer page
  return new NextResponse(
    renderPage('Judging Offer', `
      <div class="banner">
        <h2>Judging Appointment Offer</h2>
        <div class="sub">from ${orgName}</div>
      </div>
      <div class="body">
        <p>Dear ${contract.judgeName},</p>
        <p>${orgName} would like to invite you to judge at the following show:</p>

        <table class="detail-table">
          <tr><td class="label">Show</td><td>${show.name}</td></tr>
          <tr><td class="label">Date</td><td>${showDate}</td></tr>
          <tr><td class="label">Venue</td><td>${venue}</td></tr>
          <tr><td class="label">Breeds</td><td>${breedsText}</td></tr>
          ${show.showType ? `<tr><td class="label">Show Type</td><td>${show.showType.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</td></tr>` : ''}
        </table>

        ${contract.notes ? `<p style="padding: 12px; background: #f9f8f6; border-radius: 8px; font-size: 14px; color: #555;">${contract.notes}</p>` : ''}

        <p>Please click the button below to accept or decline this appointment.</p>

        <div class="buttons">
          <form method="POST" action="/api/judge-contract/${token}">
            <input type="hidden" name="action" value="accept">
            <button type="submit" class="btn btn-primary">Accept Appointment</button>
          </form>
          <a href="/api/judge-contract/${token}?action=decline" class="btn btn-outline">Decline</a>
        </div>
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

  const contract = await db.query.judgeContracts.findFirst({
    where: eq(judgeContracts.offerToken, token),
    with: {
      show: { with: { venue: true, organisation: true } },
      judge: true,
    },
  });

  if (!contract) {
    return new NextResponse(
      renderPage('Not Found', `
        <div class="banner"><h2>Link Not Found</h2></div>
        <div class="body"><p>This contract link is not valid.</p></div>
      `),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (contract.tokenExpiresAt && new Date() > contract.tokenExpiresAt) {
    return new NextResponse(
      renderPage('Link Expired', `
        <div class="banner"><h2>Link Expired</h2></div>
        <div class="body"><p>This offer link has expired. Please contact the show secretary.</p></div>
      `),
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (contract.stage !== 'offer_sent') {
    return new NextResponse(
      renderPage('Already Responded', `
        <div class="banner"><h2>Already Responded</h2></div>
        <div class="body"><p>This offer has already been responded to.</p></div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const show = contract.show;
  const orgName = show.organisation?.name ?? 'the Show Society';

  if (action === 'accept') {
    // Update contract to accepted
    await db
      .update(judgeContracts)
      .set({ stage: 'offer_accepted', acceptedAt: new Date() })
      .where(eq(judgeContracts.id, contract.id));

    // Auto-update checklist: "Receive judge acceptance letters"
    await db
      .update(showChecklistItems)
      .set({
        status: 'complete',
        completedAt: new Date(),
        autoDetected: true,
      })
      .where(
        and(
          eq(showChecklistItems.showId, contract.showId),
          eq(showChecklistItems.entityType, 'judge'),
          eq(showChecklistItems.entityId, contract.judgeId),
          ilike(showChecklistItems.title, '%acceptance%')
        )
      );

    // Send notification email to secretary
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';

      // Get secretary/admin users for the show's organisation
      const notifyEmail = process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';

      await resend.emails.send({
        from: emailFrom,
        to: notifyEmail,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
        subject: `Judge Accepted — ${contract.judgeName} for ${show.name}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Judge Accepted</h2>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          <strong>${contract.judgeName}</strong> has accepted the invitation to judge at <strong>${show.name}</strong>.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          The next step is to send the formal confirmation letter. You can do this from the Judges tab in the show management page.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000'}/secretary/shows/${show.id}"
             style="display: inline-block; background: #2D5F3F; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none;">
            View Show
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
      });
    } catch (error) {
      console.error('[email] Failed to notify secretary of judge acceptance:', error);
    }

    return new NextResponse(
      renderPage('Accepted', `
        <div class="banner">
          <div class="success-icon">&#10003;</div>
          <h2>Thank You</h2>
        </div>
        <div class="body">
          <p>Thank you for accepting the invitation to judge at <strong>${show.name}</strong>.</p>
          <p>${orgName} has been notified and will send your formal confirmation letter shortly.</p>
          <p style="color: #666; font-size: 14px;">You can safely close this page.</p>
        </div>
      `),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (action === 'decline') {
    await db
      .update(judgeContracts)
      .set({ stage: 'declined', declinedAt: new Date() })
      .where(eq(judgeContracts.id, contract.id));

    // Notify secretary
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';
      const notifyEmail = process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';

      await resend.emails.send({
        from: emailFrom,
        to: notifyEmail,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
        subject: `Judge Declined — ${contract.judgeName} for ${show.name}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #dc2626; padding: 24px; text-align: center;">
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Judge Declined</h2>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          <strong>${contract.judgeName}</strong> has declined the invitation to judge at <strong>${show.name}</strong>.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          You may need to find a replacement judge and send a new offer.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000'}/secretary/shows/${show.id}"
             style="display: inline-block; background: #2D5F3F; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none;">
            View Show
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
      });
    } catch (error) {
      console.error('[email] Failed to notify secretary of judge decline:', error);
    }

    return new NextResponse(
      renderPage('Declined', `
        <div class="banner"><h2>Offer Declined</h2></div>
        <div class="body">
          <p>You have declined the invitation to judge at <strong>${show.name}</strong>.</p>
          <p>${orgName} has been notified.</p>
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
