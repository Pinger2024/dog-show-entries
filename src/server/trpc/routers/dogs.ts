import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { dogs } from '@/server/db/schema';

export const dogsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.dogs.findMany({
      where: and(
        eq(dogs.ownerId, ctx.session.user.id),
        isNull(dogs.deletedAt)
      ),
      with: {
        breed: {
          with: {
            group: true,
          },
        },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
        with: {
          breed: {
            with: {
              group: true,
            },
          },
          achievements: true,
        },
      });

      if (!dog) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      return dog;
    }),

  create: protectedProcedure
    .input(
      z.object({
        registeredName: z.string().min(1).max(255),
        kcRegNumber: z.string().optional(),
        breedId: z.string().uuid(),
        sex: z.enum(['dog', 'bitch']),
        dateOfBirth: z.string(),
        sireName: z.string().optional(),
        damName: z.string().optional(),
        breederName: z.string().optional(),
        colour: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [dog] = await ctx.db
        .insert(dogs)
        .values({
          ...input,
          kcRegNumber: input.kcRegNumber ?? null,
          sireName: input.sireName ?? null,
          damName: input.damName ?? null,
          breederName: input.breederName ?? null,
          colour: input.colour ?? null,
          ownerId: ctx.session.user.id,
        })
        .returning();

      return dog!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        registeredName: z.string().min(1).max(255).optional(),
        kcRegNumber: z.string().nullable().optional(),
        breedId: z.string().uuid().optional(),
        sex: z.enum(['dog', 'bitch']).optional(),
        dateOfBirth: z.string().optional(),
        sireName: z.string().nullable().optional(),
        damName: z.string().nullable().optional(),
        breederName: z.string().nullable().optional(),
        colour: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, id), isNull(dogs.deletedAt)),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (existing.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      const [updated] = await ctx.db
        .update(dogs)
        .set(data)
        .where(eq(dogs.id, id))
        .returning();

      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (existing.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      const [deleted] = await ctx.db
        .update(dogs)
        .set({ deletedAt: new Date() })
        .where(eq(dogs.id, input.id))
        .returning();

      return deleted!;
    }),
});
