import { Resend } from 'resend';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { orders, memberships, users, printOrders, showClasses } from '@/server/db/schema';
import { formatOrderRef, PRINT_PAYMENT_METHODS } from '@/lib/print-products';
import { isCatalogueItem } from '@/lib/catalogue-utils';
import { generateParkingPassPdf } from '@/server/services/parking-pass-pdf';
import { buildClassLabelMap } from '@/lib/class-labels';
import { BRAND } from '@/lib/brand';

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM =
  process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

export const APP_URL =
  process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export function btn(href: string, label: string, bg: string = BRAND.green) {
  return `<a href="${href}" style="display: inline-block; padding: 12px 28px; background: ${bg}; color: ${BRAND.cream}; text-decoration: none; border-radius: 13px; font-size: 14px; font-weight: 700;">${label}</a>`;
}

/**
 * Shared "Remi" wordmark header — the centered h1 + green dot, used at the
 * top of every transactional email. `size` is the h1 font-size in px (all
 * call sites use 26 except the compact "New Entry Received" secretary
 * notification, which now shares the standard 24px-0 wrapper padding —
 * previously 16px-0 — in exchange for de-duplicating this block).
 */
export function emailHeader(size = 26) {
  return `<div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: ${size}px; font-weight: 800; color: ${BRAND.green}; letter-spacing: -0.015em;">Remi<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${BRAND.fresh};margin-left:3px;"></span></h1>
    </div>`;
}

/**
 * Shared "Sent by Remi[ on behalf of X]." footer line. Normalizes the
 * handful of near-identical footer variants this replaces (a couple omitted
 * the trailing period or the "on behalf of" clause) onto one shape — pass
 * the org name to include it, or omit for the plain "Sent by Remi." form.
 */
export function emailFooter(orgName?: string | null) {
  return `<p style="text-align: center; margin-top: 16px; font-size: 12px; color: ${BRAND.ink2};">
      Sent by <a href="${APP_URL}" style="color: ${BRAND.green}; text-decoration: none; font-weight: 600;">Remi</a>${orgName ? ` on behalf of ${orgName}` : ''}.
    </p>`;
}

function formatLongDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDeliveryAddress(order: {
  deliveryAddress1: string | null;
  deliveryAddress2?: string | null;
  deliveryTown: string | null;
  deliveryPostcode: string | null;
}): string {
  return [order.deliveryAddress1, order.deliveryAddress2, order.deliveryTown, order.deliveryPostcode]
    .filter(Boolean)
    .join(', ');
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

  // Pre-compute class labels so JH classes render as JHA/JHB rather than
  // a blank numeric prefix (RKC licences don't count JH in the numbered
  // sequence, so classNumber is null — the label map lives outside the
  // per-row data).
  const allShowClasses = await db.query.showClasses.findMany({
    where: eq(showClasses.showId, show.id),
    with: { classDefinition: true },
  });
  const classLabelMap = buildClassLabelMap(allShowClasses, show.showRuleset);

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
        const label = ec.showClass?.id ? classLabelMap.get(ec.showClass.id) : undefined;
        const className = cd?.name ?? 'Class';
        const sexLabel = sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
        const prefix = label ? `${label}. ` : '';
        return `<div style="padding: 2px 0; color: ${BRAND.ink};">${prefix}${className}${sexLabel} — ${formatFee(ec.fee)}</div>`;
      })
      .join('');

    return `
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid ${BRAND.line};">
            <strong style="color: ${BRAND.ink};">${name}</strong>
            ${breed ? `<br><span style="color: ${BRAND.ink2}; font-size: 14px;">${breed}</span>` : ''}
            ${entry.isNfc ? '<br><span style="color: ${BRAND.ink2}; font-size: 12px; font-weight: 600;">NOT FOR COMPETITION</span>' : ''}
            <div style="margin-top: 8px; font-size: 14px;">
              ${classLines}
            </div>
          </td>
          <td style="padding: 16px; border-bottom: 1px solid ${BRAND.line}; text-align: right; font-weight: 600; vertical-align: top;">
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
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <!-- Header -->
    ${emailHeader()}

    <!-- Main card -->
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <!-- Green banner -->
      <div style="background: ${BRAND.deep}; padding: 24px 24px 20px; text-align: center;">
        <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: rgba(243,236,220,0.2); font-size: 20px; color: ${BRAND.cream}; margin-bottom: 8px;">&#10003;</div>
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 22px; font-weight: 700;">Entry Confirmed</h2>
        <p style="margin: 8px 0 0; color: rgba(243, 236, 220, 0.78); font-size: 14px;">
          Order ${orderRef} &middot; ${formatFee(order.totalAmount)}
        </p>
      </div>

      <!-- Show details -->
      <div style="padding: 20px 24px; border-bottom: 1px solid ${BRAND.line};">
        <h3 style="margin: 0 0 4px; font-size: 18px; color: ${BRAND.ink};">${show.name}</h3>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink2};">
          ${showDate}<br>
          ${venue}
        </p>
        ${show.organisation?.name ? `<p style="margin: 4px 0 0; font-size: 13px; color: ${BRAND.ink2};">${show.organisation.name}</p>` : ''}
      </div>

      <!-- Entries -->
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 12px 24px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2}; border-bottom: 1px solid ${BRAND.line};">Entry</th>
            <th style="padding: 12px 24px; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2}; border-bottom: 1px solid ${BRAND.line};">Fee</th>
          </tr>
        </thead>
        <tbody>
          ${entrySections.join('')}
        </tbody>
      </table>

      ${(order.orderSundryItems ?? []).length > 0 ? `
      <!-- Sundry Items -->
      <div style="padding: 16px 24px; border-top: 1px solid ${BRAND.line};">
        <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2};">Add-ons</p>
        ${(order.orderSundryItems ?? []).map((osi) => `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;">
          <span style="color: ${BRAND.ink};">${osi.sundryItem?.name ?? 'Item'}${osi.quantity > 1 ? ` x${osi.quantity}` : ''}</span>
          <span style="font-weight: 600;">${formatFee(osi.unitPrice * osi.quantity)}</span>
        </div>`).join('')}
      </div>` : ''}

      <!-- Total -->
      <div style="padding: 16px 24px; background: ${BRAND.paper};">
        <table style="width: 100%;">
          <tr>
            <td style="font-weight: 700; font-size: 16px; color: ${BRAND.ink};">Total Paid</td>
            <td style="text-align: right; font-weight: 700; font-size: 16px; color: ${BRAND.green};">${formatFee(order.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid ${BRAND.line};">
        ${btn(`${APP_URL}/entries`, 'View Your Entries')}
        <p style="margin: 12px 0 0; font-size: 12px; color: ${BRAND.ink2};">
          Manage your entries, change handlers, or withdraw from your dashboard.
        </p>
      </div>

      ${(order.orderSundryItems ?? []).some((osi) => osi.sundryItem?.name && isCatalogueItem(osi.sundryItem.name)) ? `
      <!-- Online Catalogue -->
      <div style="padding: 16px 24px; text-align: center; border-top: 1px solid ${BRAND.line}; background: #eaf7ee;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: ${BRAND.green};">Online Catalogue Purchased</p>
        <p style="margin: 0 0 12px; font-size: 13px; color: ${BRAND.ink2};">Your catalogue unlocks on the morning of the show — we&apos;ll email you the link first thing that day.</p>
        ${btn(`${APP_URL}/shows/${show.slug ?? show.id}/catalogue`, 'View Catalogue', '${BRAND.green}')}
      </div>` : ''}

      <!-- Share -->
      <div style="padding: 16px 24px; text-align: center; border-top: 1px solid ${BRAND.line}; background: #eaf7ee;">
        <p style="margin: 0 0 10px; font-size: 13px; font-weight: 600; color: ${BRAND.ink};">Tell your breed group!</p>
        <div style="display: inline-block;">
          <!--[if mso]><table><tr><td><![endif]-->
          <a href="https://wa.me/?text=${encodeURIComponent(`I've just entered ${show.name}! 🐕 ${APP_URL}/shows/${show.slug ?? show.id}`)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 8px 16px; background: #25D366; color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; margin: 0 4px;">WhatsApp</a>
          <!--[if mso]></td><td><![endif]-->
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${APP_URL}/shows/${show.slug ?? show.id}`)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 8px 16px; background: #1877F2; color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; margin: 0 4px;">Facebook</a>
          <!--[if mso]></td></tr></table><![endif]-->
        </div>
      </div>

      <!-- Exhibitor -->
      <div style="padding: 16px 24px; border-top: 1px solid ${BRAND.line}; font-size: 13px; color: ${BRAND.ink2};">
        <strong style="color: ${BRAND.ink};">Exhibitor:</strong> ${exhibitor.name ?? exhibitor.email}
        ${exhibitor.kcAccountNo ? `<br><strong style="color: ${BRAND.ink};">RKC Account:</strong> ${exhibitor.kcAccountNo}` : ''}
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: ${BRAND.ink2};">
      <p style="margin: 0;">
        This confirmation was sent by <a href="${APP_URL}" style="color: ${BRAND.green}; text-decoration: none; font-weight: 600;">Remi</a> on behalf of ${show.organisation?.name ?? 'the show society'}.
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
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
      subject: `Entry Confirmed — ${show.name}`,
      html,
    });

    if (result.error) {
      console.error(`[email] Resend rejected confirmation for order ${orderRef} to ${exhibitor.email}:`, result.error);
      return result;
    }
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

  // Find secretary email: the show's named secretary first (the person actually
  // running THIS show — clubs often appoint a different secretary per show),
  // then the org contact email, then first active secretary member.
  let secretaryEmail = show.secretaryEmail || org?.contactEmail;
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
        <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px;">
          <strong>${name}</strong>${breed ? ` (${breed})` : ''}
          ${entry.isNfc ? ' <span style="color: ${BRAND.ink2}; font-weight: 600;">NFC</span>' : ''}
        </td>
        <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px;">${classes}</td>
        <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px; text-align: right;">${formatFee(entry.totalFee)}</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader(24)}
    <div style="background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.deep}; padding: 16px 24px; text-align: center;">
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 18px; font-weight: 700;">New Entry Received</h2>
      </div>
      <div style="padding: 20px 24px;">
        <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600;">${show.name}</p>
        <p style="margin: 0 0 16px; font-size: 14px; color: ${BRAND.ink2};">
          Exhibitor: <strong>${exhibitor?.name ?? exhibitor?.email ?? 'Unknown'}</strong>
          ${exhibitor?.kcAccountNo ? ` · RKC: ${exhibitor.kcAccountNo}` : ''}
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Dog/Handler</th>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Classes</th>
              <th style="padding: 8px 16px; text-align: right; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Fee</th>
            </tr>
          </thead>
          <tbody>${entrySummary}</tbody>
        </table>
        ${(order.orderSundryItems ?? []).length > 0 ? `
        <div style="margin-top: 12px; padding: 8px 16px;">
          <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2};">Add-ons</p>
          ${(order.orderSundryItems ?? []).map((osi) =>
            `<p style="margin: 2px 0; font-size: 13px; color: ${BRAND.ink};">${osi.sundryItem?.name ?? 'Item'}${osi.quantity > 1 ? ` x${osi.quantity}` : ''} — ${formatFee(osi.unitPrice * osi.quantity)}</p>`
          ).join('')}
        </div>` : ''}
        <div style="margin-top: 16px; padding: 12px 16px; background: #eaf7ee; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; font-weight: 600;">Total: ${formatFee(order.totalAmount)}</p>
        </div>
        <div style="margin-top: 20px; text-align: center;">
          ${btn(`${APP_URL}/secretary/shows/${show.slug ?? show.id}/entries`, 'View All Entries')}
        </div>
      </div>
    </div>
    ${emailFooter(org?.name ?? 'your organisation')}
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: secretaryEmail,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
      subject: `New Entry — ${exhibitor?.name ?? 'Exhibitor'} → ${show.name}`,
      html,
    });
    if (result.error) {
      console.error(`[email] Resend rejected secretary notification to ${secretaryEmail}:`, result.error);
      return result;
    }
    console.log(`[email] Secretary notification sent to ${secretaryEmail}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send secretary notification:`, error);
  }
}

/**
 * Send a confirmation email to the secretary when a print order is submitted to Tradeprint.
 */
export async function sendPrintOrderConfirmationEmail(printOrderId: string) {
  const order = await db.query.printOrders.findFirst({
    where: eq(printOrders.id, printOrderId),
    with: {
      items: true,
      orderedBy: true,
      show: { with: { organisation: true } },
    },
  });

  if (!order || !order.orderedBy?.email) {
    console.error(`[email] Cannot send print order confirmation: order ${printOrderId} not found or no email`);
    return;
  }

  const orderRef = formatOrderRef(order.id);
  const show = order.show;
  const deliveryAddr = formatDeliveryAddress(order);

  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px;">
        ${item.documentLabel}
      </td>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px; text-align: right;">
        ${formatFee(item.lineTotal)}
      </td>
    </tr>`).join('');

  const estDelivery = order.estimatedDeliveryDate
    ? formatLongDate(order.estimatedDeliveryDate)
    : null;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.deep}; padding: 24px 24px 20px; text-align: center;">
        <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: rgba(243,236,220,0.2); font-size: 20px; color: ${BRAND.cream}; margin-bottom: 8px;">&#9998;</div>
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 22px; font-weight: 700;">Print Order Confirmed</h2>
        <p style="margin: 8px 0 0; color: rgba(243, 236, 220, 0.78); font-size: 14px;">
          Order ${orderRef} &middot; ${formatFee(order.totalAmount)}
        </p>
      </div>

      <div style="padding: 20px 24px; border-bottom: 1px solid ${BRAND.line};">
        <h3 style="margin: 0 0 4px; font-size: 18px; color: ${BRAND.ink};">${show.name}</h3>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink2};">
          Your print order has been received. We&apos;re preparing your documents and will be in touch shortly.
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Item</th>
            <th style="padding: 8px 16px; text-align: center; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Qty</th>
            <th style="padding: 8px 16px; text-align: right; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="padding: 16px 24px; background: ${BRAND.paper};">
        <table style="width: 100%;">
          <tr>
            <td style="font-weight: 700; font-size: 16px; color: ${BRAND.ink};">Total</td>
            <td style="text-align: right; font-weight: 700; font-size: 16px; color: ${BRAND.green};">${formatFee(order.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid ${BRAND.line};">
        <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2};">Delivery</p>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink};">
          ${order.deliveryName ? `<strong>${order.deliveryName}</strong><br>` : ''}
          ${deliveryAddr}
        </p>
        ${estDelivery ? `<p style="margin: 8px 0 0; font-size: 14px; color: ${BRAND.green}; font-weight: 600;">Estimated delivery: ${estDelivery}</p>` : ''}
      </div>

      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid ${BRAND.line};">
        ${btn(`${APP_URL}/secretary/shows/${show.slug ?? show.id}/print-shop/${order.id}`, 'Track Your Order')}
        <p style="margin: 12px 0 0; font-size: 12px; color: ${BRAND.ink2};">
          We'll email you again when your order is dispatched with tracking details.
        </p>
      </div>
    </div>
    ${emailFooter(show.organisation?.name ?? 'your organisation')}
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: order.orderedBy.email,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
      subject: `Print Order Confirmed — ${show.name} (${orderRef})`,
      html,
    });
    if (result.error) {
      console.error(`[email] Resend rejected print order confirmation for ${orderRef}:`, result.error);
      return result;
    }
    console.log(`[email] Print order confirmation sent for ${orderRef} to ${order.orderedBy.email}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send print order confirmation for ${orderRef}:`, error);
  }
}

/**
 * Notify Michael that a print order needs manual Mixam submission.
 * Sent instead of auto-submitting when PRINT_AUTO_SUBMIT is not set.
 */
export async function sendPrintOrderAdminNotificationEmail(printOrderId: string) {
  const order = await db.query.printOrders.findFirst({
    where: eq(printOrders.id, printOrderId),
    with: {
      items: true,
      orderedBy: true,
      show: { with: { organisation: true } },
    },
  });

  if (!order) {
    console.error(`[email] Cannot send admin print notification: order ${printOrderId} not found`);
    return;
  }

  const orderRef = formatOrderRef(order.id);
  const show = order.show;
  const deliveryAddr = formatDeliveryAddress(order);
  const adminEmail = process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';

  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px;">${item.documentLabel}</td>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 14px; text-align: right;">${formatFee(item.lineTotal)}</td>
      <td style="padding: 8px 16px; border-bottom: 1px solid ${BRAND.line}; font-size: 13px;">
        ${item.pdfPublicUrl ? `<a href="${item.pdfPublicUrl}" style="color: ${BRAND.green};">Download PDF</a>` : 'PDF pending'}
      </td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.honey}; padding: 24px 24px 20px; text-align: center;">
        <h2 style="margin: 0; color: ${BRAND.ink}; font-size: 22px; font-weight: 700;">Print Order — Action Required</h2>
        <p style="margin: 8px 0 0; color: rgba(27, 36, 29, 0.65); font-size: 14px;">
          Order ${orderRef} &middot; ${formatFee(order.totalAmount)}
        </p>
      </div>

      <div style="padding: 20px 24px; border-bottom: 1px solid ${BRAND.line};">
        <h3 style="margin: 0 0 4px; font-size: 18px; color: ${BRAND.ink};">${show.name}</h3>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink2};">
          ${order.paymentMethod === PRINT_PAYMENT_METHODS.DEDUCTED_FROM_PAYOUT
            ? 'A print order has been paid by deduction from entry income. Please submit the PDFs below to Mixam manually.'
            : 'A print order has been paid by card. Please submit the PDFs below to Mixam manually.'}
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Item</th>
            <th style="padding: 8px 16px; text-align: center; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Qty</th>
            <th style="padding: 8px 16px; text-align: right; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">Price</th>
            <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: ${BRAND.ink2}; border-bottom: 2px solid ${BRAND.line};">PDF</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="padding: 16px 24px; background: ${BRAND.paper};">
        <table style="width: 100%;">
          <tr>
            <td style="font-weight: 700; font-size: 16px; color: ${BRAND.ink};">Total paid</td>
            <td style="text-align: right; font-weight: 700; font-size: 16px; color: ${BRAND.green};">${formatFee(order.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid ${BRAND.line};">
        <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2};">Deliver to</p>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink};">
          ${order.deliveryName ? `<strong>${order.deliveryName}</strong><br>` : ''}
          ${deliveryAddr}
          ${order.deliveryPhone ? `<br>${order.deliveryPhone}` : ''}
        </p>
      </div>

      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid ${BRAND.line};">
        ${btn(`${APP_URL}/secretary/shows/${show.slug ?? show.id}/print-shop/${order.id}`, 'View Order')}
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `Print Order Action Required — ${show.name} (${orderRef})${order.paymentMethod === PRINT_PAYMENT_METHODS.DEDUCTED_FROM_PAYOUT ? ' [Deducted from payout]' : ''}`,
      html,
    });
    if (result.error) {
      console.error(`[email] Resend rejected admin print notification for ${orderRef}:`, result.error);
      return result;
    }
    console.log(`[email] Admin print notification sent for ${orderRef}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send admin print notification for ${orderRef}:`, error);
  }
}

/**
 * Send a dispatch notification when a print order ships, including tracking details.
 */
export async function sendPrintOrderDispatchEmail(printOrderId: string) {
  const order = await db.query.printOrders.findFirst({
    where: eq(printOrders.id, printOrderId),
    with: {
      items: true,
      orderedBy: true,
      show: { with: { organisation: true } },
    },
  });

  if (!order || !order.orderedBy?.email) {
    console.error(`[email] Cannot send dispatch notification: order ${printOrderId} not found or no email`);
    return;
  }

  const orderRef = formatOrderRef(order.id);
  const show = order.show;

  const itemList = order.items
    .map((item) => `<li style="padding: 4px 0; font-size: 14px; color: ${BRAND.ink};">${item.documentLabel} &times; ${item.quantity}</li>`)
    .join('');

  const trackingSection = order.trackingUrl
    ? `<div style="padding: 16px 24px; text-align: center;">
        ${btn(order.trackingUrl, 'Track Delivery')}
        ${order.trackingNumber ? `<p style="margin: 8px 0 0; font-size: 13px; color: ${BRAND.ink2};">Tracking: ${order.trackingNumber}</p>` : ''}
       </div>`
    : order.trackingNumber
      ? `<div style="padding: 16px 24px;">
          <p style="margin: 0; font-size: 14px; color: ${BRAND.ink};">Tracking number: <strong>${order.trackingNumber}</strong></p>
         </div>`
      : '';

  const estDelivery = order.estimatedDeliveryDate
    ? formatLongDate(order.estimatedDeliveryDate)
    : null;

  const deliveryAddr = formatDeliveryAddress(order);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.deep}; padding: 24px 24px 20px; text-align: center;">
        <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: rgba(243,236,220,0.2); font-size: 20px; color: ${BRAND.cream}; margin-bottom: 8px;">&#128230;</div>
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 22px; font-weight: 700;">Your Print Order Has Shipped!</h2>
        <p style="margin: 8px 0 0; color: rgba(243, 236, 220, 0.78); font-size: 14px;">Order ${orderRef}</p>
      </div>

      <div style="padding: 20px 24px; border-bottom: 1px solid ${BRAND.line};">
        <h3 style="margin: 0 0 4px; font-size: 18px; color: ${BRAND.ink};">${show.name}</h3>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink2};">
          Great news — your printing is on its way!
          ${estDelivery ? ` Expected delivery: <strong>${estDelivery}</strong>.` : ''}
        </p>
      </div>

      <div style="padding: 16px 24px; border-bottom: 1px solid ${BRAND.line};">
        <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2};">What's in the box</p>
        <ul style="margin: 0; padding-left: 20px;">${itemList}</ul>
      </div>

      ${trackingSection}

      <div style="padding: 16px 24px; border-bottom: 1px solid ${BRAND.line};">
        <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.ink2};">Delivering to</p>
        <p style="margin: 0; font-size: 14px; color: ${BRAND.ink};">
          ${order.deliveryName ? `<strong>${order.deliveryName}</strong><br>` : ''}
          ${deliveryAddr}
        </p>
      </div>

      <div style="padding: 20px 24px; text-align: center; border-top: 1px solid ${BRAND.line};">
        ${btn(`${APP_URL}/secretary/shows/${show.slug ?? show.id}/print-shop/${order.id}`, 'View Order Details')}
      </div>
    </div>
    ${emailFooter(show.organisation?.name ?? 'your organisation')}
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: order.orderedBy.email,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
      subject: `Your Print Order Has Shipped! — ${show.name} (${orderRef})`,
      html,
    });
    if (result.error) {
      console.error(`[email] Resend rejected dispatch notification for ${orderRef}:`, result.error);
      return result;
    }
    console.log(`[email] Dispatch notification sent for ${orderRef} to ${order.orderedBy.email}`, result);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send dispatch notification for ${orderRef}:`, error);
  }
}

/**
 * Send a results approval request email to a judge.
 */
export async function sendJudgeApprovalRequestEmail(params: {
  judge: { name: string; email: string };
  show: {
    name: string;
    startDate: string;
    slug: string | null;
    id: string;
    organisation: { name: string } | null;
  };
  approvalToken: string;
  // Derived by callers via buildJudgeBreedAndClassification — the ONE
  // builder for what a judge judges. This email used to take breed ids
  // and fall back to "All breeds", which is what a Junior Handling judge
  // (breed-null assignment) got told they were judging (Mandy, North East
  // Regional, 2026-08-03).
  breedLine: string;
  classificationLine: string;
}) {
  const { judge, show, approvalToken, breedLine, classificationLine } = params;
  const orgName = show.organisation?.name ?? 'the Show Society';

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const approvalUrl = `${APP_URL}/api/results-approval/${approvalToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.deep}; padding: 24px 24px 20px; text-align: center;">
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 22px; font-weight: 700;">Results Approval Required</h2>
        <p style="margin: 8px 0 0; color: rgba(243, 236, 220, 0.78); font-size: 14px;">from ${orgName}</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: ${BRAND.ink}; line-height: 1.6;">Dear ${judge.name},</p>
        <p style="font-size: 15px; color: ${BRAND.ink}; line-height: 1.6;">
          The results from your judging at <strong>${show.name}</strong> on <strong>${showDate}</strong> have been recorded digitally and are ready for your review and approval.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line}; font-weight: 600; color: ${BRAND.ink}; width: 100px;">Show</td><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line};">${show.name}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line}; font-weight: 600; color: ${BRAND.ink};">Date</td><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line};">${showDate}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line}; font-weight: 600; color: ${BRAND.ink};">Breed</td><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line};">${breedLine}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line}; font-weight: 600; color: ${BRAND.ink};">Classification</td><td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND.line};">${classificationLine}</td></tr>
        </table>
        <p style="font-size: 15px; color: ${BRAND.ink}; line-height: 1.6;">
          Please click the button below to review the results and confirm they are correct.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          ${btn(approvalUrl, 'Review & Approve Results')}
        </div>
        <p style="font-size: 13px; color: ${BRAND.ink2}; text-align: center;">
          No login required — simply click the button to review.
        </p>
      </div>
    </div>
    ${emailFooter(orgName)}
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: judge.email,
    replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
    subject: `Results Approval — ${show.name}`,
    html,
  });
  if (result.error) {
    console.error(`[email] Failed to send judge approval request to ${judge.email}:`, result.error);
    throw new Error(`Failed to send approval email to ${judge.email}: ${result.error.message ?? 'unknown error'}`);
  }
  console.log(`[email] Judge approval request sent to ${judge.email}`, result);
  return result;
}

/**
 * Show-morning "your catalogue is ready" email. Fired by the cron on the
 * morning of the show, once per (order) — never resends.
 *
 * Amanda's ask (2026-05-28): exhibitors who bought the catalogue shouldn't
 * see the field of competitors before show day, but they shouldn't have to
 * remember to come back and download it either — push them a link first
 * thing in the morning.
 */
export async function sendCatalogueReadyEmail(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      exhibitor: { columns: { name: true, email: true } },
      show: { columns: { id: true, name: true, slug: true, startDate: true } },
    },
  });

  if (!order?.exhibitor.email || !order.show) return;

  const { exhibitor, show } = order;
  const showSlug = show.slug ?? show.id;
  const catalogueUrl = `${APP_URL}/shows/${showSlug}/catalogue`;
  const showDate = formatLongDate(show.startDate);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="padding: 28px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: ${BRAND.ink2};">${showDate}</p>
        <h2 style="margin: 0 0 12px; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 800; letter-spacing: -0.015em; font-size: 22px; color: ${BRAND.ink};">${show.name}</h2>
        <p style="margin: 0 0 20px; font-size: 15px; color: ${BRAND.ink}; line-height: 1.5;">
          Good morning${exhibitor.name ? `, ${exhibitor.name.split(' ')[0]}` : ''} — your catalogue is ready.
        </p>
        <div style="margin: 0 0 16px;">
          ${btn(catalogueUrl, 'Open Your Catalogue')}
        </div>
        <p style="margin: 0; font-size: 13px; color: ${BRAND.ink2};">
          Best of luck in the ring today!
        </p>
      </div>
    </div>
    ${emailFooter()}
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: exhibitor.email,
    replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
    subject: `Your catalogue is ready — ${show.name}`,
    html,
  });

  if (result.error) {
    console.error(`[email] Failed catalogue-ready email to ${exhibitor.email}:`, result.error);
    throw new Error(result.error.message ?? 'send failed');
  }
  console.log(`[email] Catalogue-ready sent for order ${orderId} to ${exhibitor.email}`);
  return result;
}

/**
 * Pre-paid parking pass email. Fired by the cron a week before the show (and
 * on the next hourly tick for anyone who bought it late inside that window),
 * once per order — never resends. Mandy 2026-08-04: the pass shows name +
 * show details, no car registration capture, and must be readable printed
 * or on a phone at the gate.
 *
 * Generates the attached PDF via generateParkingPassPdf(orderId) — the SAME
 * helper the download route uses via renderToBuffer, so the emailed PDF and
 * the one an exhibitor downloads from their account can never drift apart.
 *
 * Returns `true` only when an email was genuinely sent (so the cron only
 * stamps `parkingPassEmailedAt` and counts a send on a real success) and
 * `false` when the order turns out to have no parking sundry or no
 * exhibitor email — a silent no-op, not an error.
 */
export async function sendParkingPassEmail(orderId: string): Promise<boolean> {
  const generated = await generateParkingPassPdf(orderId);
  if (!generated) return false;

  const { buffer, filename, order } = generated;
  const exhibitor = order.exhibitor;
  if (!exhibitor?.email) {
    console.error(`[email] Cannot send parking pass: order ${orderId} has no exhibitor email`);
    return false;
  }

  const show = order.show;
  const downloadUrl = `${APP_URL}/api/parking-pass/${orderId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 24px 16px;">
    ${emailHeader()}
    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="padding: 28px 24px; text-align: center;">
        <h2 style="margin: 0 0 12px; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 800; letter-spacing: -0.015em; font-size: 22px; color: ${BRAND.ink};">${show.name}</h2>
        <p style="margin: 0 0 20px; font-size: 15px; color: ${BRAND.ink}; line-height: 1.5;">
          Good news${exhibitor.name ? `, ${exhibitor.name.split(' ')[0]}` : ''} — your parking pass is attached.
          Print it out or just show it on your phone at the gate.
        </p>
        <div style="margin: 0 0 16px;">
          ${btn(downloadUrl, 'Download Your Pass')}
        </div>
        <p style="margin: 0; font-size: 13px; color: ${BRAND.ink2};">
          You can come back and download it again any time from your Remi account.
        </p>
      </div>
    </div>
    ${emailFooter()}
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: exhibitor.email,
    replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
    subject: `Your parking pass — ${show.name}`,
    html,
    attachments: [{ filename, content: buffer }],
  });

  if (result.error) {
    console.error(`[email] Failed parking pass email to ${exhibitor.email}:`, result.error);
    throw new Error(result.error.message ?? 'send failed');
  }
  console.log(`[email] Parking pass sent for order ${orderId} to ${exhibitor.email}`);
  return true;
}
