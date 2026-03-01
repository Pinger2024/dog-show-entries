import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, gte, lte, sql, desc, asc, isNull, or, inArray, isNotNull, exists } from 'drizzle-orm';
import {
  publicProcedure,
  protectedProcedure,
  secretaryProcedure,
} from '../procedures';
import { createTRPCRouter } from '../init';
import {
  shows,
  showClasses,
  venues,
  organisations,
} from '@/server/db/schema';

export const showsRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        showType: z
          .enum([
            'companion',
            'primary',
            'limited',
            'open',
            'premier_open',
            'championship',
          ])
          .optional(),
        status: z
          .enum([
            'draft',
            'published',
            'entries_open',
            'entries_closed',
            'in_progress',
            'completed',
            'cancelled',
          ])
          .optional(),
        breedId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];

      if (input.showType) {
        conditions.push(eq(shows.showType, input.showType));
      }
      if (input.status) {
        conditions.push(eq(shows.status, input.status));
      }
      if (input.startDate) {
        conditions.push(gte(shows.startDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(shows.endDate, input.endDate));
      }

      const where =
        conditions.length > 0 ? and(...conditions) : undefined;

      const items = await ctx.db.query.shows.findMany({
        where,
        with: {
          organisation: true,
          venue: true,
        },
        orderBy: [asc(shows.startDate)],
        limit: input.limit,
        offset: input.cursor,
      });

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(shows)
        .where(where);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items,
        total,
        nextCursor:
          input.cursor + input.limit < total
            ? input.cursor + input.limit
            : null,
      };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.id),
        with: {
          organisation: true,
          venue: true,
          showClasses: {
            with: {
              classDefinition: true,
              breed: true,
            },
            orderBy: [asc(showClasses.sortOrder)],
          },
          rings: true,
          judgeAssignments: {
            with: {
              judge: true,
              breed: true,
              ring: true,
            },
          },
        },
      });

      if (!show) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Show not found',
        });
      }

      return show;
    }),

  getClasses: publicProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        breedId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(showClasses.showId, input.showId)];

      if (input.breedId) {
        conditions.push(
          or(
            eq(showClasses.breedId, input.breedId),
            isNull(showClasses.breedId)
          )!
        );
      }

      return ctx.db.query.showClasses.findMany({
        where: and(...conditions),
        with: {
          classDefinition: true,
          breed: true,
        },
        orderBy: [asc(showClasses.sortOrder)],
      });
    }),

  upcoming: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split('T')[0]!;
      const where = and(
        gte(shows.startDate, today),
        inArray(shows.status, ['published', 'entries_open'])
      );

      const items = await ctx.db.query.shows.findMany({
        where,
        with: {
          organisation: true,
          venue: true,
        },
        orderBy: [asc(shows.startDate)],
        limit: input.limit,
        offset: input.cursor,
      });

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(shows)
        .where(where);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items,
        total,
        nextCursor:
          input.cursor + input.limit < total
            ? input.cursor + input.limit
            : null,
      };
    }),

  nearby: publicProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        radiusMiles: z.number().default(50),
        breedId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split('T')[0]!;
      const { lat, lng, radiusMiles, breedId, limit } = input;

      // Haversine distance formula in miles
      const distanceExpr = sql<number>`
        3959 * acos(
          cos(radians(${lat})) * cos(radians(${venues.lat})) *
          cos(radians(${venues.lng}) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(${venues.lat}))
        )
      `;

      // Build base conditions
      const conditions = [
        gte(shows.startDate, today),
        inArray(shows.status, ['published', 'entries_open']),
        isNotNull(venues.lat),
        isNotNull(venues.lng),
        sql`${distanceExpr} <= ${radiusMiles}`,
      ];

      // Breed filter: only shows that have at least one showClass matching the breed
      // or shows with non-breed-specific classes
      if (breedId) {
        conditions.push(
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(showClasses)
              .where(
                and(
                  eq(showClasses.showId, shows.id),
                  or(
                    eq(showClasses.breedId, breedId),
                    eq(showClasses.isBreedSpecific, false)
                  )
                )
              )
          )
        );
      }

      const results = await ctx.db
        .select({
          id: shows.id,
          name: shows.name,
          showType: shows.showType,
          showScope: shows.showScope,
          status: shows.status,
          startDate: shows.startDate,
          endDate: shows.endDate,
          startTime: shows.startTime,
          endTime: shows.endTime,
          entriesOpenDate: shows.entriesOpenDate,
          entryCloseDate: shows.entryCloseDate,
          postalCloseDate: shows.postalCloseDate,
          kcLicenceNo: shows.kcLicenceNo,
          scheduleUrl: shows.scheduleUrl,
          description: shows.description,
          distance: distanceExpr,
          organisation: {
            id: organisations.id,
            name: organisations.name,
          },
          venue: {
            id: venues.id,
            name: venues.name,
            address: venues.address,
            postcode: venues.postcode,
            lat: venues.lat,
            lng: venues.lng,
          },
        })
        .from(shows)
        .innerJoin(venues, eq(shows.venueId, venues.id))
        .innerJoin(organisations, eq(shows.organisationId, organisations.id))
        .where(and(...conditions))
        .orderBy(distanceExpr)
        .limit(limit);

      return results.map((row) => ({
        ...row,
        distance: Math.round(Number(row.distance) * 10) / 10,
      }));
    }),

  create: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        showType: z.enum([
          'companion',
          'primary',
          'limited',
          'open',
          'premier_open',
          'championship',
        ]),
        showScope: z.enum(['single_breed', 'group', 'general']),
        organisationId: z.string().uuid(),
        venueId: z.string().uuid().optional(),
        startDate: z.string(),
        endDate: z.string(),
        entriesOpenDate: z.string().datetime().optional(),
        entryCloseDate: z.string().datetime().optional(),
        postalCloseDate: z.string().datetime().optional(),
        kcLicenceNo: z.string().optional(),
        scheduleUrl: z.string().url().optional(),
        description: z.string().optional(),
        classDefinitionIds: z.array(z.string().uuid()).optional(),
        entryFee: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { classDefinitionIds, entryFee, ...showData } = input;

      const [show] = await ctx.db
        .insert(shows)
        .values({
          ...showData,
          entriesOpenDate: showData.entriesOpenDate
            ? new Date(showData.entriesOpenDate)
            : null,
          entryCloseDate: showData.entryCloseDate
            ? new Date(showData.entryCloseDate)
            : null,
          postalCloseDate: showData.postalCloseDate
            ? new Date(showData.postalCloseDate)
            : null,
          venueId: showData.venueId ?? null,
        })
        .returning();

      // Create show classes from selected class definitions
      if (classDefinitionIds && classDefinitionIds.length > 0) {
        await ctx.db.insert(showClasses).values(
          classDefinitionIds.map((classDefId, idx) => ({
            showId: show!.id,
            classDefinitionId: classDefId,
            entryFee: entryFee ?? 0,
            sortOrder: idx,
          }))
        );
      }

      return show!;
    }),

  update: secretaryProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        showType: z
          .enum([
            'companion',
            'primary',
            'limited',
            'open',
            'premier_open',
            'championship',
          ])
          .optional(),
        showScope: z.enum(['single_breed', 'group', 'general']).optional(),
        venueId: z.string().uuid().nullable().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        entriesOpenDate: z.string().datetime().nullable().optional(),
        entryCloseDate: z.string().datetime().nullable().optional(),
        postalCloseDate: z.string().datetime().nullable().optional(),
        status: z
          .enum([
            'draft',
            'published',
            'entries_open',
            'entries_closed',
            'in_progress',
            'completed',
            'cancelled',
          ])
          .optional(),
        kcLicenceNo: z.string().nullable().optional(),
        scheduleUrl: z.string().url().nullable().optional(),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, entriesOpenDate, entryCloseDate, postalCloseDate, ...rest } = input;

      const existing = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Show not found',
        });
      }

      const updateData: Record<string, unknown> = { ...rest };
      if (entriesOpenDate !== undefined) {
        updateData.entriesOpenDate = entriesOpenDate
          ? new Date(entriesOpenDate)
          : null;
      }
      if (entryCloseDate !== undefined) {
        updateData.entryCloseDate = entryCloseDate
          ? new Date(entryCloseDate)
          : null;
      }
      if (postalCloseDate !== undefined) {
        updateData.postalCloseDate = postalCloseDate
          ? new Date(postalCloseDate)
          : null;
      }

      const [updated] = await ctx.db
        .update(shows)
        .set(updateData)
        .where(eq(shows.id, id))
        .returning();

      return updated!;
    }),
});
