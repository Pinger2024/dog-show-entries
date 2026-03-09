import { TRPCError } from '@trpc/server';
import { baseProcedure, middleware } from './init';

const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // When impersonating, use the impersonated user's session data
  const effectiveSession = ctx.impersonating
    ? { user: ctx.impersonating }
    : ctx.session;

  return next({
    ctx: {
      session: effectiveSession,
    },
  });
});

const isSecretary = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // When impersonating, use the impersonated user's role for access checks
  const effectiveSession = ctx.impersonating
    ? { user: ctx.impersonating }
    : ctx.session;

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

  // When impersonating, use the impersonated user's role for access checks
  const effectiveSession = ctx.impersonating
    ? { user: ctx.impersonating }
    : ctx.session;

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
