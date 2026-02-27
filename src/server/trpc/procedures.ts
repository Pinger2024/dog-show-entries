import { TRPCError } from '@trpc/server';
import { baseProcedure, middleware } from './init';

const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      session: ctx.session,
    },
  });
});

const isSecretary = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (
    ctx.session.user.role !== 'secretary' &&
    ctx.session.user.role !== 'admin'
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Secretary or admin access required',
    });
  }
  return next({
    ctx: {
      session: ctx.session,
    },
  });
});

const isSteward = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (
    ctx.session.user.role !== 'steward' &&
    ctx.session.user.role !== 'secretary' &&
    ctx.session.user.role !== 'admin'
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Steward, secretary, or admin access required',
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
