import { TRPCError } from '@trpc/server';
import type { TRPCContext, Session } from './init';
import { baseProcedure, middleware } from './init';

/** Returns the impersonated session when active, otherwise the real session. */
function getEffectiveSession(ctx: TRPCContext): Session {
  return ctx.impersonating
    ? { user: ctx.impersonating }
    : ctx.session!;
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

  if (
    effectiveSession.user.role !== 'secretary' &&
    effectiveSession.user.role !== 'admin'
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Secretary or admin access required',
    });
  }
  return next({
    ctx: {
      session: effectiveSession,
    },
  });
});

const isSteward = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  const effectiveSession = getEffectiveSession(ctx);

  if (
    effectiveSession.user.role !== 'steward' &&
    effectiveSession.user.role !== 'secretary' &&
    effectiveSession.user.role !== 'admin'
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Steward, secretary, or admin access required',
    });
  }
  return next({
    ctx: {
      session: effectiveSession,
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
