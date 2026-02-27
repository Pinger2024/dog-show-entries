import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

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
  },
  pages: {
    signIn: '/login',
    newUser: '/register',
    verifyRequest: '/login?verify=true',
  },
  providers: [
    // Demo login — sign in with just an email, no verification
    Credentials({
      id: 'demo',
      name: 'Demo',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !db) return null;
        const email = credentials.email as string;
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    Resend({
      from: process.env.EMAIL_FROM ?? 'Remi <noreply@remi.dog>',
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
        token.role = (user as typeof user & { role: string }).role;
      }
      // On explicit session update (e.g. after role change), refresh role from DB.
      // We only do this on "update" trigger, not every request, because the JWT
      // callback runs in edge runtime where DB access can be unreliable.
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
