import { Resend } from 'resend';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { orders, memberships, users } from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM =
  process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';

const APP_URL =
  process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function btn(href: string, label: string, bg = '#2D5F3F') {
  return `<a href="${href}" style="display: inline-block; padding: 12px 28px; background: ${bg}; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">${label}</a>`;
}

/**
 * Send a confirmation email after a successful payment.
 * Fetches full order data including show, entries, dogs, and classes.
 */
export async function sendEntryConfirmationEmail(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      exhibitor: true,
      show: {
        with: {
          organisation: true,
          venue: true,
        },
      },
      entries: {
        with: {
          dog: {
            with: {
              breed: true,
            },
          },
          entryClasses: {
            with: {
              showClass: {
                with: {
                  classDefinition: true,
                },
              },
            },
          },
          juniorHandlerDetails: true,
        },
      },
      orderSundryItems: {
        with: { sundryItem: true },
      },
    },
  });

  if (!order || !order.exhibitor?.email) {
    console.error(`[email] Cannot send confirmation: order ${orderId} not found or no email`);
    return;
  }

  const show = order.show;
  const exhibitor = order.exhibitor;
  const entryRows = order.entries ?? [];

  // Build entries summary
  const entrySections = entryRows.map((entry) => {
    const isJH = entry.entryType === 'junior_handler';
    const name = isJH
      ? `Junior Handler: ${entry.juniorHandlerDetails?.handlerName ?? 'Unknown'}`
      : entry.dog?.registeredName ?? 'Unknown Dog';
    const breed = entry.dog?.breed?.name ?? '';

    const classLines = (entry.entryClasses ?? [])
      .map((ec) => {
        const cd = ec.showClass?.classDefinition;
        const sex = ec.showClass?.sex;
        const classNum = ec.showClass?.classNumber;
        const className = cd?.name ?? 'Class';
        const sexLabel = sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
        const numPrefix = classNum != null ? `${classNum}. ` : '';
        return `<div style="padding: 2px 0; color: #444;">${numPrefix}${className}${sexLabel} — ${formatFee(ec.fee)}</div>`;
      })
      .join('');

    return `
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e5e5e5;">
            <strong style="color: #1a1a1a;">${name}</strong>
            ${breed ? `<br><span style="color: #666; font-size: 14px;">${breed}</span>` : ''}
            ${entry.isNfc ? '<br><span style="color: #b45309; font-size: 12px; font-weight: 600;">NOT FOR COMPETITION</span>' : ''}
            <div style="margin-top: 8px; font-size: 14px;">
              ${classLines}
            </div>
          </td>
          <td style="padding: 16px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; vertical-align: top;">
            ${formatFee(entry.totalFee)}
          </td>
        </tr>`;
  });

  const showDate = show.startDate
    ? new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'TBC';

  const venue = show.venue
    ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
    : 'Venue TBC';

  const orderRef = order.id.slice(0, 8).toUpperCase();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <!-- Header -->
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <!-- Green banner -->
      <div style="background: #2D5F3F; padding: 24px 24px 20px; text-align: center;">
        <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); font-size: 20px; color: #fff; margin-bottom: 8px;">&#10003;</div>
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Entry Confirmed</h2>
        <p style="margin: 8px 0 0; color: #b8d4c4; font-size: 14px;">
          Order ${orderRef} &middot; ${formatFee(order.totalAmount)}
        </p>
      </div>

      <!-- Show details -->
      <div style="padding: 20px 24px; border-bottom: 1px solid #e5e5e5;">
        <h3 style="margin: 0 0 4px; font-size: 18px; color: #1a1a1a;">${show.name}</h3>
        <p style="margin: 0; font-size: 14px; color: #666;">
          ${showDate}<br>
          ${venue}
        </p>
        ${show.organisation?.name ? `<p style="margin: 4px 0 0; font-size: 13px; color: #888;">${show.organisation.name}</p>` : ''}
      </div>

      <!-- Entries -->
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 12px 24px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #e5e5e5;">Entry</th>
            <th style="padding: 12px 24px; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #e5e5e5;">Fee</th>
          </tr>
        </thead>
        <tbody>
          ${entrySections.join('')}
        </tbody>
      </table>

      ${(order.orderSundryItems ?? []).length > 0 ? `
      <!-- Sundry Items -->
      <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5;">
        <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888;">Add-ons</p>
        ${(order.orderSundryItems ?? []).map((osi) => `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;">
          <span style="color: #444;">${osi.sundryItem?.name ?? 'Item'}${osi.quantity > 1 ? ` x${osi.quantity}` : ''}</span>
          <span style="font-weight: 600;">${formatFee(osi.unitPrice * osi.quantity)}</span>
        </div>`).join('')}
      </div>` : ''}

      <!-- Total -->
      <div style="padding: 16px 24px; background: #f9f8f6;">
        <table style="width: 100%;">
          <tr>
            <td style="font-weight: 700; font-size: 16px; color: #1a1a1a;">Total Paid</td>
            <td style="text-align: right; font-weight: 700; font-size: 16px; color: #2D5F3F;">${formatFee(order.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid #e5e5e5;">
        ${btn(`${APP_URL}/entries`, 'View Your Entries')}
        <p style="margin: 12px 0 0; font-size: 12px; color: #999;">
          Manage your entries, change handlers, or withdraw from your dashboard.
        </p>
      </div>

      <!-- Exhibitor -->
      <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #666;">
        <strong style="color: #444;">Exhibitor:</strong> ${exhibitor.name ?? exhibitor.email}
        ${exhibitor.kcAccountNo ? `<br><strong style="color: #444;">RKC Account:</strong> ${exhibitor.kcAccountNo}` : ''}
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">
        This confirmation was sent by <a href="${APP_URL}" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a> on behalf of ${show.organisation?.name ?? 'the show society'}.
      </p>
      <p style="margin: 8px 0 0;">
        If you have questions about this entry, please reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: exhibitor.email,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
      subject: `Entry Confirmed — ${show.name}`,
      html,
    });

    console.log(`[email] Confirmation sent for order ${orderRef} to ${exhibitor.email}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send confirmation for order ${orderRef}:`, error);
  }
}

/**
 * Send a notification to the show secretary when a new entry is confirmed.
 */
export async function sendSecretaryNotificationEmail(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      exhibitor: true,
      show: {
        with: {
          organisation: true,
        },
      },
      entries: {
        with: {
          dog: {
            with: { breed: true },
          },
          entryClasses: {
            with: {
              showClass: {
                with: { classDefinition: true },
              },
            },
          },
          juniorHandlerDetails: true,
        },
      },
      orderSundryItems: {
        with: { sundryItem: true },
      },
    },
  });

  if (!order) {
    console.error(`[email] Cannot send secretary notification: order ${orderId} not found`);
    return;
  }

  const show = order.show;
  const org = show.organisation;

  // Find secretary email: org contact email, or first active secretary member
  let secretaryEmail = org?.contactEmail;
  if (!secretaryEmail && org) {
    const secretaryMembership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.organisationId, org.id),
        eq(memberships.status, 'active')
      ),
      with: { user: true },
    });
    secretaryEmail = secretaryMembership?.user?.email ?? null;
  }

  if (!secretaryEmail) {
    console.error(`[email] No secretary email found for show ${show.name}`);
    return;
  }

  const exhibitor = order.exhibitor;
  const entryRows = order.entries ?? [];

  const entrySummary = entryRows.map((entry) => {
    const isJH = entry.entryType === 'junior_handler';
    const name = isJH
      ? `Junior Handler: ${entry.juniorHandlerDetails?.handlerName ?? 'Unknown'}`
      : entry.dog?.registeredName ?? 'Unknown Dog';
    const breed = entry.dog?.breed?.name ?? '';
    const classes = (entry.entryClasses ?? [])
      .map((ec) => ec.showClass?.classDefinition?.name ?? 'Class')
      .join(', ');

    return `
      <tr>
        <td style="padding: 8px 16px; border-bottom: 1px solid #e5e5e5; font-size: 14px;">
          <strong>${name}</strong>${breed ? ` (${breed})` : ''}
          ${entry.isNfc ? ' <span style="color: #b45309; font-weight: 600;">NFC</span>' : ''}
        </td>
        <td style="padding: 8px 16px; border-bottom: 1px solid #e5e5e5; font-size: 14px;">${classes}</td>
        <td style="padding: 8px 16px; border-bottom: 1px solid #e5e5e5; font-size: 14px; text-align: right;">${formatFee(entry.totalFee)}</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 16px 0;">
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2563eb; padding: 16px 24px; text-align: center;">
        <h2 style="margin: 0; color: #fff; font-size: 18px;">New Entry Received</h2>
      </div>
      <div style="padding: 20px 24px;">
        <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600;">${show.name}</p>
        <p style="margin: 0 0 16px; font-size: 14px; color: #666;">
          Exhibitor: <strong>${exhibitor?.name ?? exhibitor?.email ?? 'Unknown'}</strong>
          ${exhibitor?.kcAccountNo ? ` · RKC: ${exhibitor.kcAccountNo}` : ''}
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #888; border-bottom: 2px solid #e5e5e5;">Dog/Handler</th>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #888; border-bottom: 2px solid #e5e5e5;">Classes</th>
              <th style="padding: 8px 16px; text-align: right; font-size: 11px; text-transform: uppercase; color: #888; border-bottom: 2px solid #e5e5e5;">Fee</th>
            </tr>
          </thead>
          <tbody>${entrySummary}</tbody>
        </table>
        ${(order.orderSundryItems ?? []).length > 0 ? `
        <div style="margin-top: 12px; padding: 8px 16px;">
          <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #888;">Add-ons</p>
          ${(order.orderSundryItems ?? []).map((osi) =>
            `<p style="margin: 2px 0; font-size: 13px; color: #444;">${osi.sundryItem?.name ?? 'Item'}${osi.quantity > 1 ? ` x${osi.quantity}` : ''} — ${formatFee(osi.unitPrice * osi.quantity)}</p>`
          ).join('')}
        </div>` : ''}
        <div style="margin-top: 16px; padding: 12px 16px; background: #f0f9ff; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; font-weight: 600;">Total: ${formatFee(order.totalAmount)}</p>
        </div>
        <div style="margin-top: 20px; text-align: center;">
          ${btn(`${APP_URL}/secretary/shows/${show.slug ?? show.id}/entries`, 'View All Entries', '#2563eb')}
        </div>
      </div>
    </div>
    <p style="text-align: center; margin-top: 16px; font-size: 12px; color: #999;">
      Sent by <a href="${APP_URL}" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a> on behalf of ${org?.name ?? 'your organisation'}.
    </p>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: secretaryEmail,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
      subject: `New Entry — ${exhibitor?.name ?? 'Exhibitor'} → ${show.name}`,
      html,
    });
    console.log(`[email] Secretary notification sent to ${secretaryEmail}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send secretary notification:`, error);
  }
}
