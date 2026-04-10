import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq, ilike } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { Resend as ResendClient } from 'resend';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: db
    ? DrizzleAdapter(db, {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      })
    : undefined,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
    newUser: '/onboarding',
    verifyRequest: '/login?verify=true',
  },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>',
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const resend = new ResendClient(process.env.RESEND_API_KEY);
        const from = provider.from ?? 'Remi <noreply@remishowmanager.co.uk>';

        await resend.emails.send({
          from,
          to: email,
          replyTo: 'feedback@remishowmanager.co.uk',
          subject: 'Your Remi sign-in link',
          text: [
            'Sign in to Remi',
            '',
            `Click the link below to sign in to your Remi account at remishowmanager.co.uk:`,
            '',
            url,
            '',
            'This link expires in 24 hours and can only be used once.',
            '',
            'If you did not request this email, you can safely ignore it.',
            '',
            '— Remi (remishowmanager.co.uk)',
            'The dog show entry management platform for UK RKC-licensed shows.',
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
        <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Sign in to Remi</h2>
      </div>

      <div style="padding: 28px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 15px; color: #333; line-height: 1.5;">
          Click the button below to sign in to your account. This link will expire in 24 hours.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #888;">
          Signing in as <strong style="color: #333;">${email}</strong>
        </p>

        <a href="${url}" style="display: inline-block; padding: 14px 36px; background: #2D5F3F; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">Sign in to Remi</a>

        <p style="margin: 24px 0 0; font-size: 12px; color: #999; line-height: 1.5;">
          If the button doesn\u2019t work, copy and paste this link into your browser:<br>
          <a href="${url}" style="color: #2D5F3F; word-break: break-all;">${url}</a>
        </p>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #999; line-height: 1.5;">
          If you did not request this email, you can safely ignore it.
          <br>No account changes will be made.
        </p>
      </div>
    </div>

    <div style="text-align: center; padding: 20px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">
        <a href="https://remishowmanager.co.uk" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a>
        &mdash; Dog show entries made simple.
      </p>
      <p style="margin: 6px 0 0;">
        RKC-licensed show management for exhibitors and secretaries across the UK.
      </p>
    </div>
  </div>
</body>
</html>`,
        });
      },
    }),
    Credentials({
      id: 'password',
      name: 'Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !db) return null;
        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(schema.users)
          .where(ilike(schema.users.email, email))
          .limit(1);

        if (!user?.passwordHash) return null;

        const { compare } = await import('bcryptjs');
        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        // Always fetch role from DB on sign-in. The Resend/Google providers
        // go through the DrizzleAdapter which strips custom fields (like role)
        // from the user object, so user.role is undefined and defaults to
        // 'exhibitor'. Only the Credentials provider returns role explicitly.
        if (db) {
          try {
            const [dbUser] = await db
              .select({ role: schema.users.role })
              .from(schema.users)
              .where(eq(schema.users.id, user.id as string))
              .limit(1);
            token.role = dbUser?.role ?? 'exhibitor';
          } catch {
            token.role = (user as typeof user & { role?: string }).role ?? 'exhibitor';
          }
        } else {
          token.role = (user as typeof user & { role?: string }).role ?? 'exhibitor';
        }
      }
      // On explicit session update (e.g. after role change), refresh role from DB.
      if (trigger === 'update' && token.id && db) {
        try {
          const [dbUser] = await db
            .select({ role: schema.users.role })
            .from(schema.users)
            .where(eq(schema.users.id, token.id as string))
            .limit(1);
          if (dbUser) {
            token.role = dbUser.role;
          }
        } catch {
          // Silently continue with existing role if DB query fails in edge
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
