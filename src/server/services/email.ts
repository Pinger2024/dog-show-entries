import { Resend } from 'resend';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM =
  process.env.EMAIL_FROM ?? 'Remi <onboarding@resend.dev>';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
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
      : entry.dog?.name ?? 'Unknown Dog';
    const breed = entry.dog?.breed?.name ?? '';

    const classes = (entry.entryClasses ?? [])
      .map((ec) => {
        const cd = ec.showClass?.classDefinition;
        const sex = ec.showClass?.sex;
        const className = cd?.name ?? 'Class';
        const sexLabel = sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
        return `${className}${sexLabel} — ${formatFee(ec.fee)}`;
      })
      .join('\n          ');

    return `
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e5e5e5;">
            <strong style="color: #1a1a1a;">${name}</strong>
            ${breed ? `<br><span style="color: #666; font-size: 14px;">${breed}</span>` : ''}
            ${entry.isNfc ? '<br><span style="color: #b45309; font-size: 12px; font-weight: 600;">NOT FOR COMPETITION</span>' : ''}
            <div style="margin-top: 8px; font-size: 14px; color: #444;">
              ${classes}
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
        <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
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

      <!-- Total -->
      <div style="padding: 16px 24px; background: #f9f8f6;">
        <table style="width: 100%;">
          <tr>
            <td style="font-weight: 700; font-size: 16px; color: #1a1a1a;">Total Paid</td>
            <td style="text-align: right; font-weight: 700; font-size: 16px; color: #2D5F3F;">${formatFee(order.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <!-- Exhibitor -->
      <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #666;">
        <strong style="color: #444;">Exhibitor:</strong> ${exhibitor.name ?? exhibitor.email}
        ${exhibitor.kcAccountNo ? `<br><strong style="color: #444;">KC Account:</strong> ${exhibitor.kcAccountNo}` : ''}
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">
        This confirmation was sent by <strong>Remi</strong> on behalf of ${show.organisation?.name ?? 'the show society'}.
      </p>
      <p style="margin: 8px 0 0;">
        If you have questions about this entry, please contact the show secretary.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: exhibitor.email,
      subject: `Entry Confirmed — ${show.name}`,
      html,
    });

    console.log(`[email] Confirmation sent for order ${orderRef} to ${exhibitor.email}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send confirmation for order ${orderRef}:`, error);
  }
}
