/**
 * Sending a judge the link to send in their critiques — ONE owner for it:
 *  - the secretary's Invite button (critiques.invite), and
 *  - Remi by itself: two weeks after the show to every BREED judge who hasn't
 *    been sent it, and one reminder four weeks after the link if nothing has
 *    come back (Mandy, 30 Sept 2026 — dates in lib/critique-schedule.ts).
 *
 * Before this, only the button sent it, and on live it had been pressed for
 * one show out of five.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, gte, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { critiqueDocuments, judgeAssignments, judges, shows } from '@/server/db/schema';
import {
  APP_URL,
  sendCritiqueAutoInviteNoticeEmail,
  sendCritiqueInviteEmail,
  sendCritiqueReminderEmail,
} from '@/server/services/email';
import { isBreedClassAssignment } from '@/lib/judge-breed-classification';
import {
  CRITIQUE_AUTO_SEND_WINDOW_DAYS,
  CRITIQUE_INVITE_DAYS_AFTER_SHOW,
  addCalendarDays,
  isCritiqueInviteDue,
  isCritiqueReminderDue,
} from '@/lib/critique-schedule';
import { londonCalendarDateStr } from '@/lib/date-utils';
import { documentRowVisible, type DocumentEligibilityContext } from '@/app/(secretary)/secretary/shows/[id]/_lib/document-eligibility';

export function critiqueLink(uploadToken: string): string {
  return `${APP_URL}/critiques/${uploadToken}`;
}

/** Does this show have the critique link at all? The Documents page's own
 *  rule (RKC shows only for now — regionals grade instead). */
export function showHasCritiqueLink(show: {
  showRuleset: DocumentEligibilityContext['showRuleset'];
  showType: string | null;
}): boolean {
  return documentRowVisible('judge-critiques', { showRuleset: show.showRuleset, showType: show.showType ?? undefined });
}

/**
 * Give a judge a fresh critique link and email it to them. Re-inviting reuses
 * the judge's row with a new token (and a fresh four-week reminder clock).
 * Saved BEFORE the email goes, so if the email fails the secretary still has
 * a real link to copy and send another way.
 */
export async function inviteJudgeForCritiques(
  db: Database,
  input: { showId: string; judgeId: string; email: string },
) {
  const [judge, showRow] = await Promise.all([
    db.query.judges.findFirst({ where: eq(judges.id, input.judgeId), columns: { id: true, name: true } }),
    db.query.shows.findFirst({ where: eq(shows.id, input.showId), columns: { id: true, name: true, startDate: true } }),
  ]);
  if (!judge) throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge not found' });
  if (!showRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

  const existing = await db.query.critiqueDocuments.findFirst({
    where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
    columns: { status: true },
  });
  if (existing?.status === 'published') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'These critiques are already published — unpublish first if you need to send a new invite.',
    });
  }

  const uploadToken = crypto.randomUUID();
  const [doc] = await db
    .insert(critiqueDocuments)
    .values({
      showId: input.showId,
      judgeId: input.judgeId,
      uploadToken,
      status: 'invited',
      invitedEmail: input.email,
      invitedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [critiqueDocuments.showId, critiqueDocuments.judgeId],
      set: {
        uploadToken,
        status: 'invited',
        invitedEmail: input.email,
        invitedAt: new Date(),
        submittedAt: null,
        reminderSentAt: null,
      },
    })
    .returning();

  const link = critiqueLink(uploadToken);
  let emailSent = true;
  try {
    await sendCritiqueInviteEmail({
      judgeName: judge.name,
      email: input.email,
      showName: showRow.name,
      showDate: showRow.startDate,
      link,
    });
  } catch (err) {
    console.error(`[critiques] Failed to send invite email to ${input.email}:`, err);
    emailSent = false;
  }
  return { ...doc!, link, emailSent };
}

/** The show's breed judges (not Junior Handling, not Special Awards), once
 *  each — a judge of several breeds or both sexes gets one link. */
export async function breedJudgesForShow(db: Database, showId: string) {
  const assignments = await db.query.judgeAssignments.findMany({
    where: eq(judgeAssignments.showId, showId),
    with: {
      judge: { columns: { id: true, name: true, contactEmail: true } },
      breed: { columns: { name: true } },
    },
  });
  const byId = new Map<string, { id: string; name: string; contactEmail: string | null }>();
  for (const a of assignments) {
    if (a.judge && isBreedClassAssignment(a) && !byId.has(a.judge.id)) byId.set(a.judge.id, a.judge);
  }
  return [...byId.values()];
}

/**
 * Two weeks after each show: send every breed judge who hasn't had it the
 * critique link, then tell the secretary who it went to and whom Remi couldn't
 * email. Each show is claimed once (critique_auto_invites_at) BEFORE anything
 * is sent, so two overlapping runs can never email a judge twice.
 */
export async function runCritiqueAutoInvites(db: Database, today: string) {
  const latestEnd = addCalendarDays(today, -CRITIQUE_INVITE_DAYS_AFTER_SHOW);
  const earliestEnd = addCalendarDays(latestEnd, -CRITIQUE_AUTO_SEND_WINDOW_DAYS);
  const candidates = await db.query.shows.findMany({
    where: and(
      ne(shows.status, 'cancelled'),
      isNull(shows.critiqueAutoInvitesAt),
      gte(shows.endDate, earliestEnd),
      lte(shows.endDate, latestEnd),
    ),
    columns: { id: true, slug: true, name: true, endDate: true, showRuleset: true, showType: true, secretaryEmail: true },
  });

  const summary = { shows: 0, invited: 0, notices: 0, errors: [] as string[] };
  for (const show of candidates) {
    if (!isCritiqueInviteDue(show.endDate, today) || !showHasCritiqueLink(show)) continue;
    const [claimed] = await db
      .update(shows)
      .set({ critiqueAutoInvitesAt: new Date() })
      .where(and(eq(shows.id, show.id), isNull(shows.critiqueAutoInvitesAt)))
      .returning({ id: shows.id });
    if (!claimed) continue;
    summary.shows++;

    const [breedJudges, docs] = await Promise.all([
      breedJudgesForShow(db, show.id),
      db.query.critiqueDocuments.findMany({ where: eq(critiqueDocuments.showId, show.id), columns: { judgeId: true } }),
    ]);
    const alreadyInvited = new Set(docs.map((d) => d.judgeId));
    const sentTo: string[] = [];
    const noEmail: string[] = [];
    for (const judge of breedJudges) {
      if (alreadyInvited.has(judge.id)) continue;
      const email = judge.contactEmail?.trim();
      if (!email) {
        noEmail.push(judge.name);
        continue;
      }
      try {
        const res = await inviteJudgeForCritiques(db, { showId: show.id, judgeId: judge.id, email });
        if (res.emailSent) {
          sentTo.push(judge.name);
          summary.invited++;
        } else {
          // The link exists on the Critiques page — the secretary can send it.
          noEmail.push(judge.name);
        }
      } catch (err) {
        summary.errors.push(`${show.name} / ${judge.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if ((sentTo.length || noEmail.length) && show.secretaryEmail) {
      try {
        await sendCritiqueAutoInviteNoticeEmail({
          secretaryEmail: show.secretaryEmail,
          showName: show.name,
          showIdOrSlug: show.slug ?? show.id,
          sentTo,
          noEmail,
        });
        summary.notices++;
      } catch (err) {
        summary.errors.push(`${show.name} / notice: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return summary;
}

/**
 * Four weeks after the link, if the judge hasn't sent their critiques: one
 * gentle reminder with the SAME link. Claimed (reminder_sent_at) before the
 * email goes; released again if the email fails, so the next run retries.
 */
export async function runCritiqueReminders(db: Database, today: string) {
  const pending = await db.query.critiqueDocuments.findMany({
    where: and(
      eq(critiqueDocuments.status, 'invited'),
      isNull(critiqueDocuments.reminderSentAt),
      isNotNull(critiqueDocuments.invitedAt),
      isNotNull(critiqueDocuments.invitedEmail),
    ),
    with: {
      judge: { columns: { name: true } },
      show: { columns: { id: true, name: true, startDate: true, status: true, showRuleset: true, showType: true } },
    },
  });

  const summary = { reminded: 0, errors: [] as string[] };
  for (const doc of pending) {
    if (!doc.show || doc.show.status === 'cancelled' || !showHasCritiqueLink(doc.show)) continue;
    if (!isCritiqueReminderDue(londonCalendarDateStr(doc.invitedAt!), today)) continue;
    const [claimed] = await db
      .update(critiqueDocuments)
      .set({ reminderSentAt: new Date() })
      .where(
        and(
          eq(critiqueDocuments.id, doc.id),
          isNull(critiqueDocuments.reminderSentAt),
          eq(critiqueDocuments.status, 'invited'),
        ),
      )
      .returning({ id: critiqueDocuments.id });
    if (!claimed) continue;
    try {
      await sendCritiqueReminderEmail({
        judgeName: doc.judge?.name ?? '',
        email: doc.invitedEmail!,
        showName: doc.show.name,
        showDate: doc.show.startDate,
        link: critiqueLink(doc.uploadToken),
      });
      summary.reminded++;
    } catch (err) {
      await db.update(critiqueDocuments).set({ reminderSentAt: null }).where(eq(critiqueDocuments.id, doc.id));
      summary.errors.push(`${doc.show.name} / ${doc.judge?.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}
