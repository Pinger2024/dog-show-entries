import crypto from 'crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { Resend } from 'resend';
import { db } from '@/server/db';
import { users, passwordResetTokens } from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';
const APP_URL = process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

/**
 * Generate a password reset token and send the reset email.
 * Always returns success to prevent user enumeration.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // Don't reveal whether the account exists
  if (!user) return;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to: user.email,
    replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
    subject: 'Reset your Remi password',
    text: [
      'Reset your password',
      '',
      'Click the link below to reset your Remi password:',
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
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; padding: 32px 16px;">

    <div style="text-align: center; padding: 20px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>

    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px; text-align: center;">
        <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Reset Your Password</h2>
      </div>

      <div style="padding: 28px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 15px; color: #333; line-height: 1.5;">
          Click the button below to set a new password. This link will expire in 1 hour.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #888;">
          Resetting password for <strong style="color: #333;">${user.email}</strong>
        </p>

        <a href="${resetUrl}" style="display: inline-block; padding: 14px 36px; background: #2D5F3F; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">Reset Password</a>

        <p style="margin: 24px 0 0; font-size: 12px; color: #999; line-height: 1.5;">
          If the button doesn\u2019t work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #2D5F3F; word-break: break-all;">${resetUrl}</a>
        </p>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #999; line-height: 1.5;">
          If you did not request this email, you can safely ignore it.
          <br>Your password will not be changed.
        </p>
      </div>
    </div>

    <div style="text-align: center; padding: 20px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">
        <a href="${APP_URL}" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a>
        &mdash; Dog show entries made simple.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
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
  const record = await validateResetToken(token);
  if (!record) return { success: false, error: 'Invalid or expired link' };

  const passwordHash = await hash(newPassword, 12);

  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, record.userId));

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  return { success: true };
}
