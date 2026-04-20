import {
  sql,
  eq,
  and,
  gte,
  lt,
  desc,
  isNull,
  inArray,
  isNotNull,
  notInArray,
} from 'drizzle-orm';
import { z } from 'zod';
import { adminProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { formatCurrency } from '@/lib/date-utils';
import {
  users,
  shows,
  entries,
  payments,
  orders,
  feedback,
  secretaryApplications,
  dogs,
  organisations,
  printOrders,
} from '@/server/db/schema';

/** Compute a percentage-change delta for KPI cards. */
function getDelta(
  current: number,
  previous: number
): { label: string; positive: boolean } | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { label: 'New', positive: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    label: `${pct >= 0 ? '+' : ''}${pct}%`,
    positive: pct >= 0,
  };
}

/** Print order statuses where payment has been received */
const PRINT_PAID_STATUSES = ['paid', 'submitted', 'in_production', 'dispatched', 'delivered'] as const;

/** Print order statuses excluded from admin reporting views */
const PRINT_EXCLUDED_STATUSES = ['draft', 'cancelled'] as const;

export const adminDashboardRouter = createTRPCRouter({
  getDashboard: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      // ── KPI stats ───────────────────────────────────────────
      [totalUsersRow],
      [newUsersWeekRow],
      [activeShowsRow],
      [entriesThisMonthRow],
      [entriesLastMonthRow],
      [revenueThisMonthRow],
      [revenueLastMonthRow],
      [revenueTotalRow],
      [pendingFeedbackRow],
      [pendingAppsRow],
      [totalDogsRow],
      [totalOrgsRow],

      // ── Attention items (4 queries) ──────────────────────────
      failedPaymentsList,
      agingFeedbackList,
      showsClosingSoonList,
      pendingApplicationsList,

      // ── Show pipeline (1 query — also derives totalShows) ────
      showPipelineRows,

      // ── Recent activity (4 queries) ──────────────────────────
      recentEntriesList,
      recentSignupsList,
      recentPaymentsList,
      recentFeedbackList,

      // ── Charts (2 queries) ───────────────────────────────────
      dailyEntriesRows,
      dailyRevenueRows,

      // ── Print Shop stats (5 queries) ───────────────────────
      [printRevenueThisMonthRow],
      [printRevenueLastMonthRow],
      [printRevenueTotalRow],
      [printOrderCountRow],
      printOrderPipelineRows,
      dailyPrintRevenueRows,
      recentPrintOrdersList,
    ] = await Promise.all([
      // KPI counts
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(users)
        .where(isNull(users.deletedAt)),
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(users)
        .where(and(isNull(users.deletedAt), gte(users.createdAt, weekAgo))),
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(shows)
        .where(
          notInArray(shows.status, ['completed', 'cancelled', 'draft'])
        ),

      // Entries: this month
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(entries)
        .where(
          and(isNull(entries.deletedAt), gte(entries.createdAt, thisMonthStart))
        ),
      // Entries: last month
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(entries)
        .where(
          and(
            isNull(entries.deletedAt),
            gte(entries.createdAt, lastMonthStart),
            lt(entries.createdAt, thisMonthStart)
          )
        ),
      // Revenue: this month
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'succeeded'),
            gte(payments.createdAt, thisMonthStart)
          )
        ),
      // Revenue: last month
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'succeeded'),
            gte(payments.createdAt, lastMonthStart),
            lt(payments.createdAt, thisMonthStart)
          )
        ),
      // Revenue: total
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        })
        .from(payments)
        .where(eq(payments.status, 'succeeded')),

      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(feedback)
        .where(eq(feedback.status, 'pending')),
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(secretaryApplications)
        .where(eq(secretaryApplications.status, 'pending')),
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(dogs)
        .where(isNull(dogs.deletedAt)),
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(organisations),

      // ── Attention: failed payments ───────────────────────────
      ctx.db
        .select({
          id: payments.id,
          amount: payments.amount,
          createdAt: payments.createdAt,
          showName: shows.name,
          exhibitorName: users.name,
        })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .innerJoin(shows, eq(shows.id, orders.showId))
        .innerJoin(users, eq(users.id, orders.exhibitorId))
        .where(eq(payments.status, 'failed'))
        .orderBy(desc(payments.createdAt))
        .limit(5),

      // ── Attention: aging feedback (pending > 3 days) ─────────
      ctx.db
        .select({
          id: feedback.id,
          subject: feedback.subject,
          fromName: feedback.fromName,
          createdAt: feedback.createdAt,
        })
        .from(feedback)
        .where(
          and(
            eq(feedback.status, 'pending'),
            lt(feedback.createdAt, threeDaysAgo)
          )
        )
        .orderBy(feedback.createdAt)
        .limit(5),

      // ── Attention: shows closing within 7 days ───────────────
      ctx.db
        .select({
          id: shows.id,
          name: shows.name,
          entryCloseDate: shows.entryCloseDate,
          entryCount: sql<number>`cast(count(${entries.id}) as int)`,
        })
        .from(shows)
        .leftJoin(
          entries,
          and(eq(entries.showId, shows.id), isNull(entries.deletedAt))
        )
        .where(
          and(
            eq(shows.status, 'entries_open'),
            isNotNull(shows.entryCloseDate),
            gte(shows.entryCloseDate, now),
            lt(shows.entryCloseDate, sevenDaysFromNow)
          )
        )
        .groupBy(shows.id, shows.name, shows.entryCloseDate),

      // ── Attention: pending secretary applications ─────────────
      ctx.db
        .select({
          id: secretaryApplications.id,
          organisationName: secretaryApplications.organisationName,
          createdAt: secretaryApplications.createdAt,
          userName: users.name,
        })
        .from(secretaryApplications)
        .innerJoin(users, eq(users.id, secretaryApplications.userId))
        .where(eq(secretaryApplications.status, 'pending'))
        .orderBy(secretaryApplications.createdAt)
        .limit(5),

      // ── Show pipeline ────────────────────────────────────────
      ctx.db
        .select({
          status: shows.status,
          count: sql<number>`count(*)::int`,
        })
        .from(shows)
        .groupBy(shows.status),

      // ── Recent entries ───────────────────────────────────────
      ctx.db
        .select({
          id: entries.id,
          createdAt: entries.createdAt,
          showName: shows.name,
          dogName: dogs.registeredName,
          userName: users.name,
        })
        .from(entries)
        .innerJoin(shows, eq(shows.id, entries.showId))
        .leftJoin(dogs, eq(dogs.id, entries.dogId))
        .innerJoin(users, eq(users.id, entries.exhibitorId))
        .where(isNull(entries.deletedAt))
        .orderBy(desc(entries.createdAt))
        .limit(8),

      // ── Recent signups ───────────────────────────────────────
      ctx.db
        .select({
          id: users.id,
          createdAt: users.createdAt,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt))
        .limit(8),

      // ── Recent payments ──────────────────────────────────────
      ctx.db
        .select({
          id: payments.id,
          createdAt: payments.createdAt,
          amount: payments.amount,
          exhibitorName: users.name,
        })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .innerJoin(users, eq(users.id, orders.exhibitorId))
        .where(eq(payments.status, 'succeeded'))
        .orderBy(desc(payments.createdAt))
        .limit(8),

      // ── Recent feedback ──────────────────────────────────────
      ctx.db
        .select({
          id: feedback.id,
          createdAt: feedback.createdAt,
          subject: feedback.subject,
          fromName: feedback.fromName,
        })
        .from(feedback)
        .orderBy(desc(feedback.createdAt))
        .limit(5),

      // ── Daily entries (30-day chart) ─────────────────────────
      ctx.db
        .select({
          date: sql<string>`to_char(${entries.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(entries)
        .where(
          and(
            isNull(entries.deletedAt),
            gte(entries.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`to_char(${entries.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${entries.createdAt}, 'YYYY-MM-DD')`),

      // ── Daily revenue (30-day chart) ─────────────────────────
      ctx.db
        .select({
          date: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`,
          amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'succeeded'),
            gte(payments.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`),

      // ── Print revenue: this month ──────────────────────────
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${printOrders.totalAmount}), 0)::int`,
        })
        .from(printOrders)
        .where(
          and(
            inArray(printOrders.status, PRINT_PAID_STATUSES),
            gte(printOrders.createdAt, thisMonthStart)
          )
        ),
      // ── Print revenue: last month ──────────────────────────
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${printOrders.totalAmount}), 0)::int`,
        })
        .from(printOrders)
        .where(
          and(
            inArray(printOrders.status, PRINT_PAID_STATUSES),
            gte(printOrders.createdAt, lastMonthStart),
            lt(printOrders.createdAt, thisMonthStart)
          )
        ),
      // ── Print revenue: total ───────────────────────────────
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${printOrders.totalAmount}), 0)::int`,
        })
        .from(printOrders)
        .where(inArray(printOrders.status, PRINT_PAID_STATUSES)),
      // ── Print order count ──────────────────────────────────
      ctx.db
        .select({ v: sql<number>`count(*)::int` })
        .from(printOrders)
        .where(inArray(printOrders.status, PRINT_PAID_STATUSES)),
      // ── Print order pipeline ───────────────────────────────
      ctx.db
        .select({
          status: printOrders.status,
          count: sql<number>`count(*)::int`,
        })
        .from(printOrders)
        .groupBy(printOrders.status),
      // ── Daily print revenue (30-day chart) ─────────────────
      ctx.db
        .select({
          date: sql<string>`to_char(${printOrders.createdAt}, 'YYYY-MM-DD')`,
          amount: sql<number>`coalesce(sum(${printOrders.totalAmount}), 0)::int`,
        })
        .from(printOrders)
        .where(
          and(
            inArray(printOrders.status, PRINT_PAID_STATUSES),
            gte(printOrders.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`to_char(${printOrders.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${printOrders.createdAt}, 'YYYY-MM-DD')`),
      // ── Recent print orders ────────────────────────────────
      ctx.db
        .select({
          id: printOrders.id,
          createdAt: printOrders.createdAt,
          totalAmount: printOrders.totalAmount,
          status: printOrders.status,
          showName: shows.name,
          showSlug: shows.slug,
          showId: shows.id,
          userName: users.name,
        })
        .from(printOrders)
        .innerJoin(shows, eq(shows.id, printOrders.showId))
        .leftJoin(users, eq(users.id, printOrders.orderedByUserId))
        .where(
          notInArray(printOrders.status, [...PRINT_EXCLUDED_STATUSES])
        )
        .orderBy(desc(printOrders.createdAt))
        .limit(8),
    ]);

    // ── Build unified activity feed ────────────────────────────
    type ActivityItem = {
      type: 'entry' | 'signup' | 'payment' | 'feedback' | 'print_order';
      timestamp: Date;
      title: string;
      subtitle: string;
    };

    const activity: ActivityItem[] = [
      ...recentEntriesList.map((e) => ({
        type: 'entry' as const,
        timestamp: e.createdAt!,
        title: `${e.userName ?? 'Someone'} entered ${e.dogName ?? 'Junior Handler'}`,
        subtitle: e.showName,
      })),
      ...recentSignupsList.map((u) => ({
        type: 'signup' as const,
        timestamp: u.createdAt!,
        title: `${u.name ?? 'New user'} joined Remi`,
        subtitle: u.email ?? '',
      })),
      ...recentPaymentsList.map((p) => ({
        type: 'payment' as const,
        timestamp: p.createdAt!,
        title: `${formatCurrency(p.amount ?? 0)} payment received`,
        subtitle: `from ${p.exhibitorName ?? 'Unknown'}`,
      })),
      ...recentFeedbackList.map((f) => ({
        type: 'feedback' as const,
        timestamp: f.createdAt!,
        title: f.subject ?? 'Feedback received',
        subtitle: `from ${f.fromName ?? 'Unknown'}`,
      })),
      ...recentPrintOrdersList.map((po) => ({
        type: 'print_order' as const,
        timestamp: po.createdAt!,
        title: `${formatCurrency(po.totalAmount)} print order`,
        subtitle: `${po.showName} — ${po.userName ?? 'Unknown'}`,
      })),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 15);

    // ── Build pipeline map + derive totalShows ─────────────────
    const pipeline: Record<string, number> = {};
    let totalShows = 0;
    for (const row of showPipelineRows) {
      pipeline[row.status] = row.count;
      totalShows += row.count;
    }

    // ── Build print order pipeline ───────────────────────────
    const printPipeline: Record<string, number> = {};
    let totalPrintOrders = 0;
    for (const row of printOrderPipelineRows) {
      printPipeline[row.status] = row.count;
      totalPrintOrders += row.count;
    }

    return {
      stats: {
        totalUsers: totalUsersRow.v,
        newUsersThisWeek: newUsersWeekRow.v,
        activeShows: activeShowsRow.v,
        totalShows,
        entriesThisMonth: entriesThisMonthRow.v,
        entryDelta: getDelta(
          entriesThisMonthRow.v,
          entriesLastMonthRow.v
        ),
        revenueThisMonth: revenueThisMonthRow.v,
        revenueDelta: getDelta(
          revenueThisMonthRow.v,
          revenueLastMonthRow.v
        ),
        totalRevenue: revenueTotalRow.v,
        pendingFeedback: pendingFeedbackRow.v,
        pendingApplications: pendingAppsRow.v,
        totalDogs: totalDogsRow.v,
        totalOrganisations: totalOrgsRow.v,
        printRevenueThisMonth: printRevenueThisMonthRow.v,
        printRevenueDelta: getDelta(
          printRevenueThisMonthRow.v,
          printRevenueLastMonthRow.v
        ),
        printRevenueTotal: printRevenueTotalRow.v,
        printOrderCount: printOrderCountRow.v,
        totalPrintOrders,
      },
      attention: {
        failedPayments: failedPaymentsList,
        agingFeedback: agingFeedbackList,
        showsClosingSoon: showsClosingSoonList,
        pendingApplications: pendingApplicationsList,
      },
      activity,
      showPipeline: pipeline,
      printPipeline,
      recentPrintOrders: recentPrintOrdersList,
      charts: {
        dailyEntries: dailyEntriesRows,
        dailyRevenue: dailyRevenueRows,
        dailyPrintRevenue: dailyPrintRevenueRows,
      },
    };
  }),

  /**
   * Admin view of every club's Stripe Connect state. Drives the support
   * dashboard at /admin/connect-accounts — lets us spot clubs stuck in
   * onboarding without waiting for them to ask.
   *
   * Sourced entirely from our mirror of Stripe's Account flags (no direct
   * Stripe call here — that's what `refreshConnectAccount` below is for
   * when a specific row looks stale).
   */
  listConnectAccounts: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.organisations.findMany({
      columns: {
        id: true,
        name: true,
        contactEmail: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeDetailsSubmitted: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingCompletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(organisations.updatedAt)],
    });

    // Bucket by status so the UI can show summary counts without
    // re-scanning on the client.
    const buckets = {
      active: 0,
      pending: 0,
      restricted: 0,
      rejected: 0,
      not_started: 0,
    };
    for (const r of rows) {
      buckets[r.stripeAccountStatus] = (buckets[r.stripeAccountStatus] ?? 0) + 1;
    }

    return { rows, buckets, total: rows.length };
  }),

  /**
   * Force a re-sync of one org's Connect state from Stripe. Useful when
   * the webhook hasn't delivered yet or we suspect drift.
   */
  refreshConnectAccount: adminProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { retrieveConnectAccount, deriveAccountStatus } = await import(
        '@/server/services/stripe'
      );
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.organisationId),
        columns: {
          id: true,
          stripeAccountId: true,
          stripeOnboardingCompletedAt: true,
        },
      });
      if (!org?.stripeAccountId) {
        return { status: 'not_started' as const, refreshed: false };
      }
      const account = await retrieveConnectAccount(org.stripeAccountId);
      const status = deriveAccountStatus(account);
      await ctx.db
        .update(organisations)
        .set({
          stripeAccountStatus: status,
          stripeDetailsSubmitted: account.details_submitted ?? false,
          stripeChargesEnabled: account.charges_enabled ?? false,
          stripePayoutsEnabled: account.payouts_enabled ?? false,
          stripeOnboardingCompletedAt:
            status === 'active' && !org.stripeOnboardingCompletedAt
              ? new Date()
              : org.stripeOnboardingCompletedAt,
        })
        .where(eq(organisations.id, org.id));
      return { status, refreshed: true };
    }),
});
