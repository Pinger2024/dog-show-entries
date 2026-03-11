import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Database } from '@/server/db';
import { getImpersonatedUserId } from '@/lib/impersonation';
import * as schema from '@/server/db/schema';

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export interface TRPCContext {
  db: Database;
  session: Session | null;
  impersonating: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  /** True when the real (non-impersonated) caller is an admin — survives session swap in middleware */
  callerIsAdmin: boolean;
}

export async function createTRPCContext(opts: {
  headers: Headers;
}): Promise<TRPCContext> {
  // Try to get the session from auth
  // Auth is being built in parallel — this will be wired up once ready
  let session: Session | null = null;

  try {
    const { auth } = await import('@/lib/auth');
    const authSession = await auth();
    if (authSession?.user?.id) {
      session = {
        user: {
          id: authSession.user.id,
          email: authSession.user.email ?? '',
          name: authSession.user.name ?? '',
          role: (authSession.user as { role?: string }).role ?? 'exhibitor',
        },
      };
    }
  } catch {
    // Auth not fully wired yet — session stays null
  }

  // Check for admin impersonation
  let impersonating: TRPCContext['impersonating'] = null;

  if (session?.user.role === 'admin') {
    try {
      const impersonatedUserId = await getImpersonatedUserId();
      if (impersonatedUserId && impersonatedUserId !== session.user.id) {
        const [targetUser] = await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            role: schema.users.role,
          })
          .from(schema.users)
          .where(eq(schema.users.id, impersonatedUserId))
          .limit(1);

        if (targetUser) {
          impersonating = {
            id: targetUser.id,
            email: targetUser.email ?? '',
            name: targetUser.name ?? '',
            role: targetUser.role,
          };
        }
      }
    } catch {
      // Cookie read failed — continue without impersonation
    }
  }

  return {
    db,
    session,
    impersonating,
    callerIsAdmin: session?.user.role === 'admin',
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;
export const middleware = t.middleware;
