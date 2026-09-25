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

/**
 * Never let an UNEXPECTED error's message reach the browser.
 *
 * Errors we raise ourselves are written for the person reading them and are
 * safe to show. Anything else — a Postgres constraint violation, a driver
 * fault, a stray throw — arrives as INTERNAL_SERVER_ERROR carrying whatever
 * the underlying library said. For node-postgres that is the entire failed
 * query plus every bound parameter.
 *
 * An exhibitor adding her dog twice hit the UNIQUE index on kc_reg_number and
 * was shown a red wall containing the `dogs` schema, her dog's details and her
 * own owner id (Rebecca Landgren, via Mandy 2026-08-22). She had already tried
 * three times; that screen is what someone gives up at.
 *
 * Fixing it at the ~92 call sites that render `error.message` would be a sweep
 * that misses the next one. Replacing the message HERE closes it for every
 * caller at once, including ones not yet written. The real error still reaches
 * the server logs untouched.
 */
const SAFE_FALLBACK_MESSAGE =
  "Something went wrong at our end and it wasn't saved. Please try again — if it keeps happening, tell the show secretary and we'll sort it out.";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // Log the real thing for us; hand the user something they can act on.
      console.error('[trpc] internal error:', error.message, error.cause ?? '');
      return { ...shape, message: SAFE_FALLBACK_MESSAGE };
    }
    return shape;
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;
export const middleware = t.middleware;
