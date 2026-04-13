import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { TRPCContext, Session } from './init';
import { baseProcedure, middleware } from './init';
import { users } from '@/server/db/schema';

/** Returns the impersonated session when active, otherwise the real session. */
function getEffectiveSession(ctx: TRPCContext): Session {
  return ctx.impersonating
    ? { user: ctx.impersonating }
    : ctx.session!;
}

/**
 * JWT role can lag behind the DB — e.g. immediately after `applications.submit`
 * promotes an exhibitor to secretary, the browser's session cookie still holds
 * the old role until it's refreshed. Fall back to a DB read so freshly-promoted
 * users aren't blocked on their first elevated call.
 */
async function resolveCurrentRole(
  ctx: TRPCContext,
  session: Session,
): Promise<string> {
  const [dbUser] = await ctx.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return dbUser?.role ?? session.user.role;
}

const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      session: getEffectiveSession(ctx),
    },
  });
});

const isSecretary = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  const effectiveSession = getEffectiveSession(ctx);
  let role = effectiveSession.user.role;

  if (role !== 'secretary' && role !== 'admin') {
    role = await resolveCurrentRole(ctx, effectiveSession);
  }

  if (role !== 'secretary' && role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Secretary or admin access required',
    });
  }
  return next({
    ctx: {
      session: { user: { ...effectiveSession.user, role } },
    },
  });
});

const isSteward = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  const effectiveSession = getEffectiveSession(ctx);
  let role = effectiveSession.user.role;

  if (role !== 'steward' && role !== 'secretary' && role !== 'admin') {
    role = await resolveCurrentRole(ctx, effectiveSession);
  }

  if (role !== 'steward' && role !== 'secretary' && role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Steward, secretary, or admin access required',
    });
  }
  return next({
    ctx: {
      session: { user: { ...effectiveSession.user, role } },
    },
  });
});

const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  // Always check the REAL user's role, never the impersonated role.
  // This ensures impersonation can never grant admin access.
  if (ctx.session.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next({
    ctx: {
      session: ctx.session,
    },
  });
});

export const publicProcedure = baseProcedure;
export const protectedProcedure = baseProcedure.use(isAuthed);
export const secretaryProcedure = baseProcedure.use(isSecretary);
export const stewardProcedure = baseProcedure.use(isSteward);
export const adminProcedure = baseProcedure.use(isAdmin);
