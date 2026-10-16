import crypto from 'crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { Resend } from 'resend';
import { db } from '@/server/db';
import { users, passwordResetTokens } from '@/server/db/schema';
import { emailHeader } from './email';
import { findPersonByEmail } from './people';
import { BRAND } from '@/lib/brand';
import { FEEDBACK_REPLY_TO } from '@/lib/email-addresses';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';
const APP_URL = process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

/**
 * The words of the email. A person who has never had a password (they bought
 * from Remi without signing up, or use emailed links or Google) is setting a
 * FIRST password, so the email must not say "reset".
 */
export function passwordEmailCopy(firstPassword: boolean) {
  return firstPassword
    ? {
        subject: 'Set your Remi password',
        heading: 'Set your password',
        textHeading: 'Set your password',
        textLead: 'Click the link below to set a password for your Remi account:',
        intro: 'Click the button below to set your password. This link will expire in 1 hour.',
        forLine: 'Set a password for',
        button: 'Set Password',
        notRequested: 'If you did not ask for this, you can safely ignore this email.',
        unchanged: 'Nothing will change on your account.',
        pagePath: '/reset-password',
        pageFlag: '&first=1',
      }
    : {
        subject: 'Reset your Remi password',
        heading: 'Reset Your Password',
        textHeading: 'Reset your password',
        textLead: 'Click the link below to reset your Remi password:',
        intro: '${copy.intro}',
        forLine: 'Resetting password for',
        button: 'Reset Password',
        notRequested: 'If you did not request this email, you can safely ignore it.',
        unchanged: 'Your password will not be changed.',
        pagePath: '/reset-password',
        pageFlag: '',
      };
}

/**
 * Generate a password reset token and send the reset email.
 * Always returns success to prevent user enumeration.
 * `firstPassword` words the email as setting a first password (register page,
 * for an address that is on Remi with no password yet).
 */
export async function requestPasswordReset(email: string, opts: { firstPassword?: boolean } = {}) {
  const copy = passwordEmailCopy(opts.firstPassword === true);
  const user = await findPersonByEmail(db, email);

  // Don't reveal whether the account exists
  if (!user) return;

  // Rate limit: skip if a token was created in the last 60 seconds
  const [recent] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        gt(passwordResetTokens.createdAt, new Date(Date.now() - 60_000))
      )
    )
    .limit(1);
  if (recent) return; // Silently skip — don't reveal anything

  // Invalidate any existing unused tokens for this user
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        isNull(passwordResetTokens.usedAt)
      )
    );

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const resetUrl = `${APP_URL}${copy.pagePath}?token=${token}${copy.pageFlag}`;

  const result = await resend.emails.send({
    from: FROM,
    to: user.email,
    replyTo: FEEDBACK_REPLY_TO,
    subject: copy.subject,
    text: [
      copy.textHeading,
      '',
      copy.textLead,
      '',
      resetUrl,
      '',
      'This link expires in 1 hour and can only be used once.',
      '',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— Remi (remishowmanager.co.uk)',
    ].join('\n'),
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 32px 16px;">

    ${emailHeader()}

    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${BRAND.deep}; padding: 24px; text-align: center;">
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 20px; font-weight: 700;">${copy.heading}</h2>
      </div>

      <div style="padding: 28px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 15px; color: ${BRAND.ink}; line-height: 1.5;">
          Click the button below to set a new password. This link will expire in 1 hour.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: ${BRAND.ink2};">
          ${copy.forLine} <strong style="color: ${BRAND.ink};">${user.email}</strong>
        </p>

        <a href="${resetUrl}" style="display: inline-block; padding: 14px 36px; background: ${BRAND.green}; color: ${BRAND.cream}; text-decoration: none; border-radius: 13px; font-size: 15px; font-weight: 700;">${copy.button}</a>

        <p style="margin: 24px 0 0; font-size: 12px; color: ${BRAND.ink2}; line-height: 1.5;">
          If the button doesn\u2019t work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: ${BRAND.green}; word-break: break-all;">${resetUrl}</a>
        </p>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid ${BRAND.line}; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: ${BRAND.ink2}; line-height: 1.5;">
          ${copy.notRequested}
          <br>${copy.unchanged}
        </p>
      </div>
    </div>

    <div style="text-align: center; padding: 20px 16px; font-size: 12px; color: ${BRAND.ink2};">
      <p style="margin: 0;">
        <a href="${APP_URL}" style="color: ${BRAND.green}; text-decoration: none; font-weight: 600;">Remi</a>
        &mdash; Dog show entries made simple.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
  // The public forgot-password flow must answer identically whether or not
  // the account exists (anti-enumeration), so a Resend rejection can't be
  // surfaced to the caller — but it MUST be loud in the logs: a suppressed
  // address here means the user can never reset their password.
  if (result.error) {
    console.error(`[password-reset] Resend rejected reset email to ${user.email}:`, result.error);
  }
}

/**
 * Validate a reset token and return the associated user ID.
 */
export async function validateResetToken(token: string) {
  const [record] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  return record ?? null;
}

/**
 * Reset the user's password using a valid token.
 */
export async function resetPassword(token: string, newPassword: string) {
  // Atomically claim the token — prevents TOCTOU race
  const [claimed] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .returning({ userId: passwordResetTokens.userId });

  if (!claimed) return { success: false, error: 'Invalid or expired link' };

  const passwordHash = await hash(newPassword, 12);

  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, claimed.userId));

  return { success: true };
}
