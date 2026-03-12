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
  sundryItems,
  memberships,
  entries,
  showSponsors,
} from '@/server/db/schema';
import { verifyShowAccess } from '../verify-show-access';
import { isUuid, generateShowSlug } from '@/lib/slugify';
import type { Database } from '@/server/db';

/** Resolve a show slug to its UUID (passthrough if already UUID) */
async function resolveShowId(db: Database, idOrSlug: string): Promise<string> {
  const show = await db.query.shows.findFirst({
    where: eq(shows.slug, idOrSlug),
    columns: { id: true },
  });
  if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
  return show.id;
}

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
        search: z.string().max(200).optional(),
        breedId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];

      // Public list: only show visible statuses unless a specific status is requested
      if (input.status) {
        conditions.push(eq(shows.status, input.status));
      } else {
        // Exclude drafts and cancelled from public listings
        conditions.push(
          inArray(shows.status, ['published', 'entries_open', 'entries_closed', 'in_progress', 'completed'])
        );
      }

      if (input.showType) {
        conditions.push(eq(shows.showType, input.showType));
      }
      if (input.startDate) {
        conditions.push(gte(shows.startDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(shows.endDate, input.endDate));
      }

      // Server-side text search across show name, organisation, and venue
      if (input.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(
          or(
            sql`${shows.name} ILIKE ${term}`,
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(organisations)
                .where(
                  and(
                    eq(organisations.id, shows.organisationId),
                    sql`${organisations.name} ILIKE ${term}`
                  )
                )
            ),
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(venues)
                .where(
                  and(
                    eq(venues.id, shows.venueId),
                    sql`${venues.name} ILIKE ${term}`
                  )
                )
            )
          )!
        );
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
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: isUuid(input.id)
          ? eq(shows.id, input.id)
          : eq(shows.slug, input.id),
        with: {
          organisation: true,
          venue: true,
          showClasses: {
            with: {
              classDefinition: true,
              breed: { with: { group: true } },
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

      // Hide draft/cancelled shows from non-secretary/admin users
      const userRole = ctx.session?.user?.role;
      const isPrivileged = userRole === 'secretary' || userRole === 'admin';
      if (!isPrivileged && (show.status === 'draft' || show.status === 'cancelled')) {
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
        showId: z.string().min(1),
        breedId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const showId = isUuid(input.showId) ? input.showId : await resolveShowId(ctx.db, input.showId);
      const conditions = [eq(showClasses.showId, showId)];

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
        description: z.string().optional(),
        secretaryUserId: z.string().uuid().optional(),
        secretaryEmail: z.string().email().optional(),
        secretaryName: z.string().optional(),
        secretaryAddress: z.string().optional(),
        secretaryPhone: z.string().optional(),
        showOpenTime: z.string().optional(),
        onCallVet: z.string().optional(),
        acceptsPostalEntries: z.boolean().optional(),
        classSexArrangement: z.enum(['separate_sex', 'combined_sex']).optional(),
        classDefinitionIds: z.array(z.string().uuid()).optional(),
        entryFee: z.number().int().min(0).optional(),
        firstEntryFee: z.number().int().min(0).optional(),
        subsequentEntryFee: z.number().int().min(0).optional(),
        nfcEntryFee: z.number().int().min(0).optional(),
        // All-breed show class data: breed selections + class template applied per breed
        allBreedClassData: z.object({
          breedIds: z.array(z.string().uuid()),
          classDefinitionIds: z.array(z.string().uuid()),
          splitBySex: z.boolean().default(false),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is a member of this organisation
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.status, 'active')
        ),
      });
      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this organisation',
        });
      }

      // Check subscription: first show is free, subsequent shows require an active subscription
      const [org, [showCount]] = await Promise.all([
        ctx.db.query.organisations.findFirst({
          where: eq(organisations.id, input.organisationId),
          columns: { subscriptionStatus: true },
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(shows)
          .where(eq(shows.organisationId, input.organisationId)),
      ]);

      if ((showCount?.count ?? 0) > 0 && org?.subscriptionStatus !== 'active') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'A subscription is required to create additional shows. Your first show was free — subscribe to keep going!',
        });
      }

      const { classDefinitionIds, entryFee, firstEntryFee, subsequentEntryFee, nfcEntryFee, allBreedClassData, ...showData } = input;

      // Generate a unique slug
      const baseSlug = generateShowSlug(showData.name, showData.startDate);
      let slug = baseSlug;
      let suffix = 2;
      while (await ctx.db.query.shows.findFirst({ where: eq(shows.slug, slug), columns: { id: true } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const [show] = await ctx.db
        .insert(shows)
        .values({
          ...showData,
          slug,
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
          firstEntryFee: firstEntryFee ?? null,
          subsequentEntryFee: subsequentEntryFee ?? null,
          nfcEntryFee: nfcEntryFee ?? null,
        })
        .returning();

      // Create show classes from selected class definitions (single-breed flow)
      if (classDefinitionIds && classDefinitionIds.length > 0 && !allBreedClassData) {
        const isSeparateSex = showData.classSexArrangement === 'separate_sex';

        if (isSeparateSex) {
          // All Dog classes first (age then achievement), then all Bitch classes
          const values: { showId: string; classDefinitionId: string; entryFee: number; sortOrder: number; sex: 'dog' | 'bitch' }[] = [];
          let sortOrder = 0;
          for (const sex of ['dog', 'bitch'] as const) {
            for (const classDefId of classDefinitionIds) {
              values.push({
                showId: show!.id,
                classDefinitionId: classDefId,
                entryFee: entryFee ?? 0,
                sortOrder: sortOrder++,
                sex,
              });
            }
          }
          await ctx.db.insert(showClasses).values(values);
        } else {
          // Combined: one row per class definition, sex = null
          await ctx.db.insert(showClasses).values(
            classDefinitionIds.map((classDefId, idx) => ({
              showId: show!.id,
              classDefinitionId: classDefId,
              entryFee: entryFee ?? 0,
              sortOrder: idx,
            }))
          );
        }
      }

      // Create show classes for all-breed shows (per-breed classes)
      if (allBreedClassData && allBreedClassData.breedIds.length > 0 && allBreedClassData.classDefinitionIds.length > 0) {
        const isSeparateSex = allBreedClassData.splitBySex;
        const fee = entryFee ?? 0;
        const allValues: {
          showId: string;
          classDefinitionId: string;
          breedId: string;
          entryFee: number;
          sortOrder: number;
          sex?: 'dog' | 'bitch';
          isBreedSpecific: boolean;
        }[] = [];

        let sortOrder = 0;

        // Sort breeds alphabetically for consistent class numbering
        // We'll batch-insert — sort order goes: breed1-classes, breed2-classes, etc.
        for (const breedId of allBreedClassData.breedIds) {
          if (isSeparateSex) {
            for (const sex of ['dog', 'bitch'] as const) {
              for (const classDefId of allBreedClassData.classDefinitionIds) {
                allValues.push({
                  showId: show!.id,
                  classDefinitionId: classDefId,
                  breedId,
                  entryFee: fee,
                  sortOrder: sortOrder++,
                  sex,
                  isBreedSpecific: true,
                });
              }
            }
          } else {
            for (const classDefId of allBreedClassData.classDefinitionIds) {
              allValues.push({
                showId: show!.id,
                classDefinitionId: classDefId,
                breedId,
                entryFee: fee,
                sortOrder: sortOrder++,
                isBreedSpecific: true,
              });
            }
          }
        }

        // Insert in batches of 500 to avoid exceeding parameter limits
        const BATCH_SIZE = 500;
        const batches = [];
        for (let i = 0; i < allValues.length; i += BATCH_SIZE) {
          batches.push(ctx.db.insert(showClasses).values(allValues.slice(i, i + BATCH_SIZE)));
        }
        await Promise.all(batches);
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
        description: z.string().nullable().optional(),
        secretaryUserId: z.string().uuid().nullable().optional(),
        secretaryEmail: z.string().email().nullable().optional(),
        secretaryName: z.string().nullable().optional(),
        secretaryAddress: z.string().nullable().optional(),
        secretaryPhone: z.string().nullable().optional(),
        showOpenTime: z.string().nullable().optional(),
        onCallVet: z.string().nullable().optional(),
        classSexArrangement: z.enum(['separate_sex', 'combined_sex']).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, entriesOpenDate, entryCloseDate, postalCloseDate, ...rest } = input;

      await verifyShowAccess(ctx.db, ctx.session.user.id, id, { callerIsAdmin: ctx.callerIsAdmin });

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

  getSundryItems: publicProcedure
    .input(z.object({ showId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const showId = isUuid(input.showId) ? input.showId : await resolveShowId(ctx.db, input.showId);
      return ctx.db.query.sundryItems.findMany({
        where: and(
          eq(sundryItems.showId, showId),
          eq(sundryItems.enabled, true)
        ),
        orderBy: [asc(sundryItems.sortOrder), asc(sundryItems.createdAt)],
      });
    }),

  getPublicStats: publicProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: and(
          eq(shows.id, input.showId),
          inArray(shows.status, ['entries_open', 'entries_closed', 'in_progress', 'completed'])
        ),
        columns: {
          id: true,
          status: true,
          startDate: true,
          entryCloseDate: true,
        },
      });

      if (!show) return null;

      const stats = await ctx.db
        .select({
          totalDogs: sql<number>`count(distinct ${entries.dogId})`,
          totalExhibitors: sql<number>`count(distinct ${entries.exhibitorId})`,
        })
        .from(entries)
        .where(
          and(
            eq(entries.showId, input.showId),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt)
          )
        );

      return {
        totalDogs: Number(stats[0]?.totalDogs ?? 0),
        totalExhibitors: Number(stats[0]?.totalExhibitors ?? 0),
        entryCloseDate: show.entryCloseDate?.toISOString() ?? null,
        startDate: show.startDate,
        status: show.status,
      };
    }),

  getShowSponsors: publicProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.showSponsors.findMany({
        where: eq(showSponsors.showId, input.showId),
        with: {
          sponsor: {
            columns: {
              id: true,
              name: true,
              logoUrl: true,
              website: true,
              category: true,
            },
          },
          classSponsorships: {
            with: {
              showClass: {
                with: { classDefinition: true, breed: true },
              },
            },
          },
        },
        orderBy: [asc(showSponsors.displayOrder)],
      });
    }),
});
