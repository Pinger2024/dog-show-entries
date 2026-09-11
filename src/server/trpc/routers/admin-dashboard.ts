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
  payouts,
  shareEvents,
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
          // Net revenue: include partially_refunded payments (a partial refund
          // moves the row off 'succeeded') and subtract the refunded portion,
          // else the full gross of a partially-refunded payment counts as £0.
          v: sql<number>`coalesce(sum(${payments.amount} - coalesce(${payments.refundAmount}, 0)), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.status, ['succeeded', 'partially_refunded']),
            gte(payments.createdAt, thisMonthStart)
          )
        ),
      // Revenue: last month
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${payments.amount} - coalesce(${payments.refundAmount}, 0)), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.status, ['succeeded', 'partially_refunded']),
            gte(payments.createdAt, lastMonthStart),
            lt(payments.createdAt, thisMonthStart)
          )
        ),
      // Revenue: total
      ctx.db
        .select({
          v: sql<number>`coalesce(sum(${payments.amount} - coalesce(${payments.refundAmount}, 0)), 0)::int`,
        })
        .from(payments)
        .where(inArray(payments.status, ['succeeded', 'partially_refunded'])),

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
        // Include partially_refunded so a partial refund doesn't make the
        // payment vanish from the recent-activity list.
        .where(inArray(payments.status, ['succeeded', 'partially_refunded']))
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
          amount: sql<number>`coalesce(sum(${payments.amount} - coalesce(${payments.refundAmount}, 0)), 0)::int`,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.status, ['succeeded', 'partially_refunded']),
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
   * Admin-side payout ledger — one row per org showing what we owe them
   * vs. what we've already paid. Drives /admin/payouts.
   *
   * "Owed" is computed from paid orders collected THROUGH STRIPE only:
   * sum of orders.total_amount (the CLUB's share, exclusive of Remi's
   * handling fee) minus sum of past payouts for that org. Kept as a
   * single SQL round-trip per side so we don't fire N queries on a page
   * with many clubs.
   *
   * Secretaries can also record a manual entry for a postal/cash/
   * direct-to-club payment (`secretary.createManualEntry`) — that order
   * is inserted straight to status='paid' with NO
   * stripe_payment_intent_id, because the money never touched Remi's
   * Stripe balance; the club already has it in hand. Those orders must
   * NEVER be summed into "owed" — Michael found this live: GSD Club of
   * Scotland (£46 across 3 manual orders), Clyde Valley (£20), and South
   * Western (£3) were all inflating "owed" for money the club already
   * held, which would have had him BACS money Remi never collected.
   * They're surfaced separately as `totalOfflineCollectedPence` so the
   * admin can see "BACS this" vs "club already holds this" per club.
   * Mirrors the same split in show-metrics' clubReceivablePence /
   * offlineCollectedPence.
   */
  listPayouts: adminProcedure.query(async ({ ctx }) => {
    // The four queries are independent — fire them in parallel. Orgs
    // with neither money in either direction nor bank details on file
    // are noise for this view, so pull only the ones that qualify.
    const [owedRows, offlineRows, refundedRows, paidRows, activeOrgs] = await Promise.all([
      ctx.db
        .select({
          organisationId: shows.organisationId,
          totalOwed: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)::int`,
        })
        .from(orders)
        .innerJoin(shows, eq(orders.showId, shows.id))
        .where(and(eq(orders.status, 'paid'), isNotNull(orders.stripePaymentIntentId)))
        .groupBy(shows.organisationId),
      // Money the club already holds itself — paid orders with no Stripe
      // payment intent at all. Informational only; never added to "owed".
      ctx.db
        .select({
          organisationId: shows.organisationId,
          totalOfflineCollected: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)::int`,
        })
        .from(orders)
        .innerJoin(shows, eq(orders.showId, shows.id))
        .where(and(eq(orders.status, 'paid'), isNull(orders.stripePaymentIntentId)))
        .groupBy(shows.organisationId),
      // Partial (per-entry) refunds leave the order in status='paid' and record
      // the refunded amount only on the payment row, so the owed sum above
      // overstates the club's share by exactly the refund — meaning we'd BACS
      // the club too much and Remi (merchant of record) eats the difference.
      // Net it off, mirroring show-metrics' clubReceivablePence. Refunds only
      // ever exist against a real Stripe payment (nothing to refund on a
      // manually-recorded postal/cash order through this system), so this
      // implicitly only ever nets against the Stripe-collected bucket. (NOTE:
      // deducted_from_payout print orders are a SEPARATE netting gap owned by
      // the print-package work — see memory project_print_shop_model.)
      ctx.db
        .select({
          organisationId: shows.organisationId,
          totalRefunded: sql<number>`COALESCE(SUM(${payments.refundAmount}), 0)::int`,
        })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .innerJoin(shows, eq(orders.showId, shows.id))
        .where(eq(orders.status, 'paid'))
        .groupBy(shows.organisationId),
      ctx.db
        .select({
          organisationId: payouts.organisationId,
          totalPaid: sql<number>`COALESCE(SUM(${payouts.amountPence}), 0)::int`,
        })
        .from(payouts)
        .groupBy(payouts.organisationId),
      ctx.db.query.organisations.findMany({
        where: isNotNull(organisations.payoutSortCode),
        columns: {
          id: true,
          name: true,
          payoutAccountName: true,
          payoutSortCode: true,
          payoutAccountNumber: true,
        },
        orderBy: [desc(organisations.updatedAt)],
      }),
    ]);

    const owedMap = new Map(owedRows.map((r) => [r.organisationId, Number(r.totalOwed)]));
    const offlineMap = new Map(offlineRows.map((r) => [r.organisationId, Number(r.totalOfflineCollected)]));
    const refundedMap = new Map(refundedRows.map((r) => [r.organisationId, Number(r.totalRefunded)]));
    const paidMap = new Map(paidRows.map((r) => [r.organisationId, Number(r.totalPaid)]));

    // Union: orgs with bank details on file + any org with money in
    // either direction (so a club with an owed balance still surfaces
    // even if bank details haven't been added yet — Michael sees they
    // need chasing).
    const relevantOrgIds = new Set<string>([
      ...activeOrgs.map((o) => o.id),
      ...owedMap.keys(),
      ...paidMap.keys(),
      ...offlineMap.keys(),
    ]);

    const orgsNeedingBankLookup = [...relevantOrgIds].filter(
      (id) => !activeOrgs.some((o) => o.id === id)
    );
    const extraOrgs = orgsNeedingBankLookup.length
      ? await ctx.db.query.organisations.findMany({
          where: inArray(organisations.id, orgsNeedingBankLookup),
          columns: {
            id: true,
            name: true,
            payoutAccountName: true,
            payoutSortCode: true,
            payoutAccountNumber: true,
          },
        })
      : [];

    const allRelevantOrgs = [...activeOrgs, ...extraOrgs];
    const filtered = allRelevantOrgs.map((org) => {
      // Net the club's gross Stripe-collected share down by any partial
      // refunds on still-paid orders. Offline-collected money never
      // touches this — it was never Remi's to owe.
      const totalOwed = (owedMap.get(org.id) ?? 0) - (refundedMap.get(org.id) ?? 0);
      const totalPaid = paidMap.get(org.id) ?? 0;
      const totalOfflineCollected = offlineMap.get(org.id) ?? 0;
      return {
        ...org,
        totalOwedPence: totalOwed,
        totalPaidPence: totalPaid,
        outstandingPence: totalOwed - totalPaid,
        totalOfflineCollectedPence: totalOfflineCollected,
      };
    });

    const summary = filtered.reduce(
      (acc, r) => ({
        totalOwed: acc.totalOwed + r.totalOwedPence,
        totalPaid: acc.totalPaid + r.totalPaidPence,
        totalOutstanding: acc.totalOutstanding + r.outstandingPence,
        totalOfflineCollected: acc.totalOfflineCollected + r.totalOfflineCollectedPence,
      }),
      { totalOwed: 0, totalPaid: 0, totalOutstanding: 0, totalOfflineCollected: 0 }
    );

    return { rows: filtered, summary };
  }),

  /**
   * Record a manual BACS payout to a club. Doesn't actually move money —
   * that happens in Michael's own bank app — this just books the payment
   * so our "outstanding" figure reflects it.
   */
  recordPayout: adminProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        amountPence: z.number().int().positive(),
        bankReference: z.string().max(200).optional(),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(payouts)
        .values({
          organisationId: input.organisationId,
          amountPence: input.amountPence,
          bankReference: input.bankReference ?? null,
          notes: input.notes ?? null,
          paidByUserId: ctx.session.user.id,
        })
        .returning();
      if (!row) throw new Error('Payout insert returned no row');
      return row;
    }),

  /**
   * History of payouts for one org, newest first — drives the drill-down
   * panel on the admin payouts page.
   */
  listPayoutHistory: adminProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.payouts.findMany({
        where: eq(payouts.organisationId, input.organisationId),
        with: {
          show: { columns: { id: true, name: true } },
          paidBy: { columns: { id: true, name: true, email: true } },
        },
        orderBy: [desc(payouts.paidAt)],
      });
    }),

  /**
   * Referral-source attribution: group paid orders by the `referralSource`
   * captured from share URLs (?src=whatsapp|facebook|instagram|…). Used by
   * the admin referrals report to see which channel drives most entries.
   */
  getReferralSourceBreakdown: adminProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(730).default(90),
        })
        .default({ days: 90 })
    )
    .query(async ({ ctx, input }) => {
      const sinceMs = Date.now() - input.days * 24 * 60 * 60 * 1000;
      const since = new Date(sinceMs);

      // Only paid orders count toward attribution — pending/failed/cancelled
      // were never actually conversions.
      const rows = await ctx.db
        .select({
          source: orders.referralSource,
          orderCount: sql<number>`count(*)`.as('order_count'),
          grossAmount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('gross_amount'),
          firstSeen: sql<Date>`min(${orders.createdAt})`.as('first_seen'),
          lastSeen: sql<Date>`max(${orders.createdAt})`.as('last_seen'),
        })
        .from(orders)
        .where(and(eq(orders.status, 'paid'), gte(orders.createdAt, since)))
        .groupBy(orders.referralSource)
        .orderBy(desc(sql`count(*)`));

      const totals = rows.reduce(
        (acc, r) => ({
          orderCount: acc.orderCount + Number(r.orderCount),
          grossAmount: acc.grossAmount + Number(r.grossAmount),
        }),
        { orderCount: 0, grossAmount: 0 }
      );

      return {
        since: since.toISOString(),
        days: input.days,
        totals,
        rows: rows.map((r) => ({
          source: r.source, // null = direct (no ?src)
          orderCount: Number(r.orderCount),
          grossAmount: Number(r.grossAmount),
          firstSeen: r.firstSeen,
          lastSeen: r.lastSeen,
          sharePct:
            totals.orderCount === 0
              ? 0
              : Math.round((Number(r.orderCount) / totals.orderCount) * 1000) / 10,
        })),
      };
    }),

  /**
   * Share activity breakdown: how many shares per channel over the window.
   * Sibling of getReferralSourceBreakdown — this counts OUTGOING shares,
   * the other counts INCOMING paid conversions. Both together tell us
   * which channels drive activity AND which convert.
   */
  getShareEventBreakdown: adminProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(730).default(90),
        })
        .default({ days: 90 })
    )
    .query(async ({ ctx, input }) => {
      const sinceMs = Date.now() - input.days * 24 * 60 * 60 * 1000;
      const since = new Date(sinceMs);

      const rows = await ctx.db
        .select({
          channel: shareEvents.channel,
          count: sql<number>`count(*)`.as('share_count'),
          firstSeen: sql<Date>`min(${shareEvents.createdAt})`.as('first_seen'),
          lastSeen: sql<Date>`max(${shareEvents.createdAt})`.as('last_seen'),
        })
        .from(shareEvents)
        .where(gte(shareEvents.createdAt, since))
        .groupBy(shareEvents.channel)
        .orderBy(desc(sql`count(*)`));

      const total = rows.reduce((n, r) => n + Number(r.count), 0);

      return {
        since: since.toISOString(),
        days: input.days,
        total,
        rows: rows.map((r) => ({
          channel: r.channel,
          count: Number(r.count),
          firstSeen: r.firstSeen,
          lastSeen: r.lastSeen,
          sharePct:
            total === 0 ? 0 : Math.round((Number(r.count) / total) * 1000) / 10,
        })),
      };
    }),
});
