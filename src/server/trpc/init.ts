import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { db } from '@/server/db';
import type { Database } from '@/server/db';

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

  return {
    db,
    session,
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
