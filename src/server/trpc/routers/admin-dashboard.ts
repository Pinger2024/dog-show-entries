import {
  sql,
  eq,
  and,
  gte,
  lt,
  desc,
  isNull,
  isNotNull,
  notInArray,
} from 'drizzle-orm';
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
      // ── KPI stats (10 queries, down from 13) ────────────────
      [totalUsersRow],
      [newUsersWeekRow],
      [activeShowsRow],
      [entriesMonthlyRow],
      [revenueAggRow],
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

      // Entries: this month + last month in one query via FILTER
      ctx.db
        .select({
          thisMonth: sql<number>`count(*) filter (where ${entries.createdAt} >= ${thisMonthStart})::int`,
          lastMonth: sql<number>`count(*) filter (where ${entries.createdAt} < ${thisMonthStart})::int`,
        })
        .from(entries)
        .where(
          and(isNull(entries.deletedAt), gte(entries.createdAt, lastMonthStart))
        ),

      // Revenue: this month + last month + total in one query via FILTER
      ctx.db
        .select({
          thisMonth: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.createdAt} >= ${thisMonthStart}), 0)::int`,
          lastMonth: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.createdAt} >= ${lastMonthStart} and ${payments.createdAt} < ${thisMonthStart}), 0)::int`,
          total: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
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
    ]);

    // ── Build unified activity feed ────────────────────────────
    type ActivityItem = {
      type: 'entry' | 'signup' | 'payment' | 'feedback';
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

    return {
      stats: {
        totalUsers: totalUsersRow.v,
        newUsersThisWeek: newUsersWeekRow.v,
        activeShows: activeShowsRow.v,
        totalShows,
        entriesThisMonth: entriesMonthlyRow.thisMonth,
        entryDelta: getDelta(
          entriesMonthlyRow.thisMonth,
          entriesMonthlyRow.lastMonth
        ),
        revenueThisMonth: revenueAggRow.thisMonth,
        revenueDelta: getDelta(
          revenueAggRow.thisMonth,
          revenueAggRow.lastMonth
        ),
        totalRevenue: revenueAggRow.total,
        pendingFeedback: pendingFeedbackRow.v,
        pendingApplications: pendingAppsRow.v,
        totalDogs: totalDogsRow.v,
        totalOrganisations: totalOrgsRow.v,
      },
      attention: {
        failedPayments: failedPaymentsList,
        agingFeedback: agingFeedbackList,
        showsClosingSoon: showsClosingSoonList,
        pendingApplications: pendingApplicationsList,
      },
      activity,
      showPipeline: pipeline,
      charts: {
        dailyEntries: dailyEntriesRows,
        dailyRevenue: dailyRevenueRows,
      },
    };
  }),
});
