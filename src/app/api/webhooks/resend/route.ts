import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { db } from '@/server/db';
import { feedback } from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

interface ResendEmailReceivedPayload {
  type: 'email.received';
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    created_at: string;
  };
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let payload: ResendEmailReceivedPayload;

  try {
    const wh = new Webhook(secret);
    payload = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendEmailReceivedPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[resend-webhook] Verification failed:', message);
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
      { status: 400 }
    );
  }

  if (payload.type !== 'email.received') {
    return NextResponse.json({ received: true });
  }

  const data = payload.data;

  // Parse sender — could be "Name <email>" or just "email"
  const fromMatch = data.from.match(/^(.+?)\s*<(.+)>$/);
  const fromName = fromMatch ? fromMatch[1].trim() : null;
  const fromEmail = fromMatch ? fromMatch[2] : data.from;

  // Strip "Re: " / "Fwd: " prefixes to find original subject
  const inReplyToSubject = data.subject
    ? data.subject.replace(/^(?:Re|Fwd|Fw):\s*/i, '')
    : null;

  // Fetch full email content via Resend SDK (webhook payload doesn't include body)
  let textBody: string | null = null;
  let htmlBody: string | null = null;
  try {
    const { data: emailContent } = await resend.emails.receiving.get(data.email_id);
    if (emailContent) {
      textBody = emailContent.text || null;
      htmlBody = emailContent.html || null;
    }
  } catch (err) {
    console.warn('[resend-webhook] Email content fetch failed:', err);
  }

  try {
    await db
      .insert(feedback)
      .values({
        resendEmailId: data.email_id,
        fromEmail,
        fromName,
        subject: data.subject || null,
        textBody,
        htmlBody,
        inReplyToSubject,
      })
      .onConflictDoNothing({ target: feedback.resendEmailId });

    console.log(
      `[resend-webhook] Feedback stored from ${fromEmail}: "${data.subject}"`
    );

    // Notify Michael about new feedback
    const notifyEmail = process.env.FEEDBACK_NOTIFY_EMAIL;
    if (notifyEmail) {
      const displaySender = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
      const preview = textBody ? textBody.slice(0, 500) : '(No text body)';
      resend.emails
        .send({
          from: process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>',
          to: notifyEmail,
          subject: `New feedback from ${fromName ?? fromEmail}`,
          html: `<p><strong>From:</strong> ${displaySender}</p>
<p><strong>Subject:</strong> ${data.subject || '(No subject)'}</p>
<hr>
<p>${preview}</p>
<hr>
<p><a href="https://remishowmanager.co.uk/feedback">View in Remi</a></p>`,
        })
        .catch((err) =>
          console.error('[resend-webhook] Notification email failed:', err)
        );
    }
  } catch (err) {
    console.error('[resend-webhook] Failed to insert feedback:', err);
    return NextResponse.json(
      { error: 'Failed to store feedback' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
