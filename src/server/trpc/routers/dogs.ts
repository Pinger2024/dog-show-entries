import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, asc, desc, sql } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { dogs, dogOwners, dogTitles, users } from '@/server/db/schema';
import { scrapeKcDog } from '@/server/services/firecrawl';

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
        titles: true,
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
          owners: {
            orderBy: [asc(dogOwners.sortOrder)],
          },
          titles: true,
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
        owners: z.array(z.object({
          ownerName: z.string().min(1),
          ownerAddress: z.string().min(1),
          ownerEmail: z.string().email(),
          ownerPhone: z.string().optional(),
          isPrimary: z.boolean().default(false),
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { owners, ...dogData } = input;

      const [dog] = await ctx.db
        .insert(dogs)
        .values({
          ...dogData,
          kcRegNumber: dogData.kcRegNumber ?? null,
          sireName: dogData.sireName ?? null,
          damName: dogData.damName ?? null,
          breederName: dogData.breederName ?? null,
          colour: dogData.colour ?? null,
          ownerId: ctx.session.user.id,
        })
        .returning();

      // Create owner records — auto-create primary from user if not provided
      if (owners && owners.length > 0) {
        await ctx.db.insert(dogOwners).values(
          owners.map((o, i) => ({
            dogId: dog!.id,
            userId: i === 0 ? ctx.session.user.id : null,
            ownerName: o.ownerName,
            ownerAddress: o.ownerAddress,
            ownerEmail: o.ownerEmail,
            ownerPhone: o.ownerPhone ?? null,
            isPrimary: o.isPrimary || i === 0,
            sortOrder: i,
          }))
        );
      } else {
        // Default: create primary owner from session user
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, ctx.session.user.id),
        });
        await ctx.db.insert(dogOwners).values({
          dogId: dog!.id,
          userId: ctx.session.user.id,
          ownerName: ctx.session.user.name,
          ownerAddress: user?.address ?? '',
          ownerEmail: ctx.session.user.email,
          ownerPhone: user?.phone ?? null,
          isPrimary: true,
          sortOrder: 0,
        });
      }

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

  // ── Owner management ─────────────────────────────────────

  addOwner: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        ownerName: z.string().min(1),
        ownerAddress: z.string().min(1),
        ownerEmail: z.string().email(),
        ownerPhone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
        with: { owners: true },
      });

      if (!dog || dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      if (dog.owners.length >= 4) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum 4 owners per dog',
        });
      }

      const [owner] = await ctx.db
        .insert(dogOwners)
        .values({
          dogId: input.dogId,
          ownerName: input.ownerName,
          ownerAddress: input.ownerAddress,
          ownerEmail: input.ownerEmail,
          ownerPhone: input.ownerPhone ?? null,
          sortOrder: dog.owners.length,
          isPrimary: false,
        })
        .returning();

      return owner!;
    }),

  updateOwner: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        ownerName: z.string().min(1).optional(),
        ownerAddress: z.string().min(1).optional(),
        ownerEmail: z.string().email().optional(),
        ownerPhone: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const owner = await ctx.db.query.dogOwners.findFirst({
        where: eq(dogOwners.id, input.id),
        with: { dog: true },
      });

      if (!owner || owner.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(dogOwners)
        .set(data)
        .where(eq(dogOwners.id, id))
        .returning();

      return updated!;
    }),

  removeOwner: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await ctx.db.query.dogOwners.findFirst({
        where: eq(dogOwners.id, input.id),
        with: { dog: { with: { owners: true } } },
      });

      if (!owner || owner.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      if (owner.isPrimary) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the primary owner',
        });
      }

      await ctx.db.delete(dogOwners).where(eq(dogOwners.id, input.id));
      return { success: true };
    }),

  // ── Title management ─────────────────────────────────────

  addTitle: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        title: z.enum(['ch', 'sh_ch', 'ir_ch', 'ir_sh_ch', 'int_ch', 'ob_ch', 'ft_ch', 'wt_ch']),
        dateAwarded: z.string().optional(),
        awardingBody: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
      });

      if (!dog || dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      const [title] = await ctx.db
        .insert(dogTitles)
        .values({
          dogId: input.dogId,
          title: input.title,
          dateAwarded: input.dateAwarded ?? null,
          awardingBody: input.awardingBody ?? null,
        })
        .returning();

      return title!;
    }),

  removeTitle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const title = await ctx.db.query.dogTitles.findFirst({
        where: eq(dogTitles.id, input.id),
        with: { dog: true },
      });

      if (!title || title.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      await ctx.db.delete(dogTitles).where(eq(dogTitles.id, input.id));
      return { success: true };
    }),

  // ── KC Lookup ──────────────────────────────────────────────

  kcLookup: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(255) }))
    .mutation(async ({ input }) => {
      const result = await scrapeKcDog(input.query);
      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not find a dog matching that name or registration number on the KC website.',
        });
      }
      return result;
    }),

  // ── Owner profiles (reuse previous owners) ────────────────

  getMyOwnerProfiles: protectedProcedure.query(async ({ ctx }) => {
    // Get distinct owner profiles from all dogs owned by this user.
    // Uses a subquery to deduplicate by email and return the most recent version.
    const ownerRows = await ctx.db
      .selectDistinctOn([dogOwners.ownerEmail], {
        ownerName: dogOwners.ownerName,
        ownerAddress: dogOwners.ownerAddress,
        ownerEmail: dogOwners.ownerEmail,
        ownerPhone: dogOwners.ownerPhone,
      })
      .from(dogOwners)
      .innerJoin(dogs, eq(dogOwners.dogId, dogs.id))
      .where(
        and(
          eq(dogs.ownerId, ctx.session.user.id),
          isNull(dogs.deletedAt),
        )
      )
      .orderBy(dogOwners.ownerEmail, desc(dogOwners.createdAt));

    return ownerRows;
  }),
});
