import { sql, eq, and, gte, lt, desc, isNull, isNotNull, notInArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, shows, entries, payments, orders, feedback, secretaryApplications, dogs, organisations } from '@/server/db/schema';
import { formatCurrency } from '@/lib/date-utils';

async function test() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [
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
      failedPaymentsList,
      agingFeedbackList,
      showsClosingSoonList,
      pendingApplicationsList,
      showPipelineRows,
      recentEntriesList,
      recentSignupsList,
      recentPaymentsList,
      recentFeedbackList,
      dailyEntriesRows,
      dailyRevenueRows,
    ] = await Promise.all([
      db.select({ v: sql<number>`count(*)::int` }).from(users).where(isNull(users.deletedAt)),
      db.select({ v: sql<number>`count(*)::int` }).from(users).where(and(isNull(users.deletedAt), gte(users.createdAt, weekAgo))),
      db.select({ v: sql<number>`count(*)::int` }).from(shows).where(notInArray(shows.status, ['completed', 'cancelled', 'draft'])),
      db.select({ v: sql<number>`count(*)::int` }).from(entries).where(and(isNull(entries.deletedAt), gte(entries.createdAt, thisMonthStart))),
      db.select({ v: sql<number>`count(*)::int` }).from(entries).where(and(isNull(entries.deletedAt), gte(entries.createdAt, lastMonthStart), lt(entries.createdAt, thisMonthStart))),
      db.select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, thisMonthStart))),
      db.select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, lastMonthStart), lt(payments.createdAt, thisMonthStart))),
      db.select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(eq(payments.status, 'succeeded')),
      db.select({ v: sql<number>`count(*)::int` }).from(feedback).where(eq(feedback.status, 'pending')),
      db.select({ v: sql<number>`count(*)::int` }).from(secretaryApplications).where(eq(secretaryApplications.status, 'pending')),
      db.select({ v: sql<number>`count(*)::int` }).from(dogs).where(isNull(dogs.deletedAt)),
      db.select({ v: sql<number>`count(*)::int` }).from(organisations),
      db.select({ id: payments.id, amount: payments.amount, createdAt: payments.createdAt, showName: shows.name, exhibitorName: users.name }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(shows, eq(shows.id, orders.showId)).innerJoin(users, eq(users.id, orders.exhibitorId)).where(eq(payments.status, 'failed')).orderBy(desc(payments.createdAt)).limit(5),
      db.select({ id: feedback.id, subject: feedback.subject, fromName: feedback.fromName, createdAt: feedback.createdAt }).from(feedback).where(and(eq(feedback.status, 'pending'), lt(feedback.createdAt, threeDaysAgo))).orderBy(feedback.createdAt).limit(5),
      db.select({ id: shows.id, name: shows.name, entryCloseDate: shows.entryCloseDate, entryCount: sql<number>`cast(count(${entries.id}) as int)` }).from(shows).leftJoin(entries, and(eq(entries.showId, shows.id), isNull(entries.deletedAt))).where(and(eq(shows.status, 'entries_open'), isNotNull(shows.entryCloseDate), gte(shows.entryCloseDate, now), lt(shows.entryCloseDate, sevenDaysFromNow))).groupBy(shows.id, shows.name, shows.entryCloseDate),
      db.select({ id: secretaryApplications.id, organisationName: secretaryApplications.organisationName, createdAt: secretaryApplications.createdAt, userName: users.name }).from(secretaryApplications).innerJoin(users, eq(users.id, secretaryApplications.userId)).where(eq(secretaryApplications.status, 'pending')).orderBy(secretaryApplications.createdAt).limit(5),
      db.select({ status: shows.status, count: sql<number>`count(*)::int` }).from(shows).groupBy(shows.status),
      db.select({ id: entries.id, createdAt: entries.createdAt, showName: shows.name, dogName: dogs.registeredName, userName: users.name }).from(entries).innerJoin(shows, eq(shows.id, entries.showId)).leftJoin(dogs, eq(dogs.id, entries.dogId)).innerJoin(users, eq(users.id, entries.exhibitorId)).where(isNull(entries.deletedAt)).orderBy(desc(entries.createdAt)).limit(8),
      db.select({ id: users.id, createdAt: users.createdAt, name: users.name, email: users.email }).from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt)).limit(8),
      db.select({ id: payments.id, createdAt: payments.createdAt, amount: payments.amount, exhibitorName: users.name }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(users, eq(users.id, orders.exhibitorId)).where(eq(payments.status, 'succeeded')).orderBy(desc(payments.createdAt)).limit(8),
      db.select({ id: feedback.id, createdAt: feedback.createdAt, subject: feedback.subject, fromName: feedback.fromName }).from(feedback).orderBy(desc(feedback.createdAt)).limit(5),
      db.select({ date: sql<string>`to_char(${entries.createdAt}, 'YYYY-MM-DD')`, count: sql<number>`count(*)::int` }).from(entries).where(and(isNull(entries.deletedAt), gte(entries.createdAt, thirtyDaysAgo))).groupBy(sql`to_char(${entries.createdAt}, 'YYYY-MM-DD')`).orderBy(sql`to_char(${entries.createdAt}, 'YYYY-MM-DD')`),
      db.select({ date: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`, amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, thirtyDaysAgo))).groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`).orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`),
    ]);

    console.log('✓ ALL QUERIES PASSED');
    console.log('  Users:', totalUsersRow.v, '| New this week:', newUsersWeekRow.v);
    console.log('  Active shows:', activeShowsRow.v);
    console.log('  Entries this month:', entriesThisMonthRow.v, '| Last month:', entriesLastMonthRow.v);
    console.log('  Revenue this month:', formatCurrency(revenueThisMonthRow.v), '| Last month:', formatCurrency(revenueLastMonthRow.v), '| Total:', formatCurrency(revenueTotalRow.v));
    console.log('  Pending feedback:', pendingFeedbackRow.v, '| Pending apps:', pendingAppsRow.v);
    console.log('  Dogs:', totalDogsRow.v, '| Orgs:', totalOrgsRow.v);
    console.log('  Failed payments:', failedPaymentsList.length);
    console.log('  Activity items:', recentEntriesList.length + recentSignupsList.length + recentPaymentsList.length + recentFeedbackList.length);
  } catch (e: any) {
    console.error('FAILED:', e.message);
    if (e.cause) console.error('CAUSE:', JSON.stringify(e.cause));
  }
  process.exit(0);
}
test();
