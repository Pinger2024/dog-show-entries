import { Resend } from 'resend';
import { db } from '@/server/db';
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import {
  shows,
  entries,
  entryClasses,
  showClasses,
  results,
  achievements,
  dogs,
  users,
  dogFollows,
  dogTimelinePosts,
  dogOwners,
} from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>';
const APP_URL = process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function btn(href: string, label: string, bg = '#2D5F3F') {
  return `<a href="${href}" style="display: inline-block; padding: 12px 28px; background: ${bg}; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">${label}</a>`;
}

const placementLabel: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: 'VHC',
  5: 'HC',
  6: 'Commended',
  7: 'Reserve',
};

const placementColor: Record<number, string> = {
  1: '#d97706',
  2: '#6b7280',
  3: '#92400e',
};

const achievementLabels: Record<string, string> = {
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show',
  best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_veteran_in_breed: 'Best Veteran in Breed',
  dog_cc: 'Dog CC',
  reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC',
  reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog',
  best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog',
  best_long_coat_bitch: 'Best Long Coat Bitch',
  best_long_coat_in_show: 'Best Long Coat in Show',
  cc: 'CC',
  reserve_cc: 'Reserve CC',
};

/**
 * Send personalised results emails to all exhibitors with confirmed entries.
 */
export async function sendExhibitorResultsEmails(showId: string) {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    with: { organisation: true },
  });
  if (!show) return;

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Get all confirmed entries with results
  const allEntries = await db.query.entries.findMany({
    where: and(
      eq(entries.showId, showId),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt)
    ),
    with: {
      exhibitor: { columns: { id: true, email: true, name: true } },
      dog: {
        columns: { id: true, registeredName: true },
        with: { breed: true },
      },
      entryClasses: {
        with: {
          showClass: { with: { classDefinition: true } },
          result: true,
        },
      },
    },
  });

  // Get achievements for this show
  const showAchievements = await db.query.achievements.findMany({
    where: eq(achievements.showId, showId),
    with: { dog: { columns: { id: true, registeredName: true } } },
  });

  // Group by exhibitor
  const byExhibitor = new Map<string, {
    email: string;
    name: string | null;
    entries: typeof allEntries;
  }>();

  for (const entry of allEntries) {
    if (!entry.exhibitor?.email) continue;
    const key = entry.exhibitor.id;
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        email: entry.exhibitor.email,
        name: entry.exhibitor.name,
        entries: [],
      });
    }
    byExhibitor.get(key)!.entries.push(entry);
  }

  const emailPayloads: { from: string; to: string; replyTo: string; subject: string; html: string }[] = [];

  for (const [, exhibitor] of byExhibitor) {
    const dogSections = exhibitor.entries.map((entry) => {
      const dogName = entry.dog?.registeredName ?? 'Unknown';
      const breedName = entry.dog?.breed?.name ?? '';

      const classRows = entry.entryClasses
        .filter((ec) => ec.result)
        .map((ec) => {
          const r = ec.result!;
          const className = ec.showClass?.classDefinition?.name ?? 'Class';
          const sex = ec.showClass?.sex;
          const sexLabel = sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
          const pLabel = r.placement ? placementLabel[r.placement] ?? `${r.placement}th` : 'Entered';
          const pColor = r.placement ? (placementColor[r.placement] ?? '#374151') : '#9ca3af';

          return `<tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${className}${sexLabel}</td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600; color: ${pColor};">${pLabel}</td>
            ${r.specialAward ? `<td style="padding: 6px 12px; border-bottom: 1px solid #f0f0f0; font-size: 12px; color: #b45309;">${r.specialAward}</td>` : '<td></td>'}
          </tr>`;
        })
        .join('');

      // Check for achievements on this dog
      const dogAchievements = showAchievements
        .filter((a) => a.dogId === entry.dogId)
        .map((a) => achievementLabels[a.type] ?? a.type);

      return `
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 4px; font-size: 16px; color: #1a1a1a;">${dogName}</h3>
          ${breedName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #666;">${breedName}</p>` : ''}
          ${dogAchievements.length > 0 ? `<div style="margin-bottom: 8px;">${dogAchievements.map((a) => `<span style="display: inline-block; padding: 2px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 4px;">${a}</span>`).join('')}</div>` : ''}
          ${classRows ? `<table style="width: 100%; border-collapse: collapse;">${classRows}</table>` : '<p style="font-size: 13px; color: #999;">No results recorded for this entry.</p>'}
        </div>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px 24px 20px; text-align: center;">
        <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); font-size: 20px; color: #fff; margin-bottom: 8px;">&#127942;</div>
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Your Results</h2>
        <p style="margin: 8px 0 0; color: #b8d4c4; font-size: 14px;">${show.name} &middot; ${showDate}</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #333; margin-bottom: 20px;">
          Hi ${exhibitor.name ?? 'there'}, the results from <strong>${show.name}</strong> have been published. Here are your results:
        </p>
        ${dogSections}
        <div style="text-align: center; margin: 24px 0;">
          ${btn(`${APP_URL}/shows/${show.slug ?? show.id}/results`, 'View Full Results')}
        </div>
      </div>
    </div>
    <p style="text-align: center; margin-top: 16px; font-size: 12px; color: #999;">
      Sent by <a href="${APP_URL}" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a> on behalf of ${show.organisation?.name ?? 'the show society'}.
    </p>
  </div>
</body>
</html>`;

    emailPayloads.push({
      from: FROM,
      to: exhibitor.email,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
      subject: `Your Results — ${show.name}`,
      html,
    });
  }

  // Send in batches (Resend batch API supports up to 100 per call)
  if (emailPayloads.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < emailPayloads.length; i += batchSize) {
    const batch = emailPayloads.slice(i, i + batchSize);
    try {
      if (batch.length === 1) {
        await resend.emails.send(batch[0]!);
      } else {
        await resend.batch.send(batch);
      }
      console.log(`[results-email] Sent ${batch.length} exhibitor result emails (batch ${Math.floor(i / batchSize) + 1})`);
    } catch (error) {
      console.error(`[results-email] Failed to send batch:`, error);
    }
  }

  console.log(`[results-email] Total: ${emailPayloads.length} exhibitor emails for show ${show.name}`);
}

/**
 * Send results notifications to followers of dogs that placed well.
 */
export async function sendFollowerResultsNotifications(showId: string) {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    with: { organisation: true },
  });
  if (!show) return;

  // Find dogs with notable results (1st-3rd placement or any achievement)
  const allEntries = await db.query.entries.findMany({
    where: and(
      eq(entries.showId, showId),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt)
    ),
    with: {
      exhibitor: { columns: { id: true } },
      dog: { columns: { id: true, registeredName: true }, with: { breed: true } },
      entryClasses: {
        with: { result: true },
      },
    },
  });

  const showAchievements = await db.query.achievements.findMany({
    where: eq(achievements.showId, showId),
  });

  // Build set of notable dogs (placed 1st-3rd or have achievements)
  const notableDogIds = new Set<string>();
  const dogResults = new Map<string, { dogName: string; breedName: string; placements: string[]; awards: string[] }>();

  for (const entry of allEntries) {
    if (!entry.dogId || !entry.dog) continue;
    for (const ec of entry.entryClasses) {
      if (ec.result?.placement && ec.result.placement <= 3) {
        notableDogIds.add(entry.dogId);
        if (!dogResults.has(entry.dogId)) {
          dogResults.set(entry.dogId, {
            dogName: entry.dog.registeredName,
            breedName: entry.dog.breed?.name ?? '',
            placements: [],
            awards: [],
          });
        }
        dogResults.get(entry.dogId)!.placements.push(
          `${placementLabel[ec.result.placement] ?? ec.result.placement}`
        );
      }
    }
  }

  for (const a of showAchievements) {
    notableDogIds.add(a.dogId);
    if (!dogResults.has(a.dogId)) {
      const entry = allEntries.find((e) => e.dogId === a.dogId);
      dogResults.set(a.dogId, {
        dogName: entry?.dog?.registeredName ?? 'Unknown',
        breedName: entry?.dog?.breed?.name ?? '',
        placements: [],
        awards: [],
      });
    }
    dogResults.get(a.dogId)!.awards.push(achievementLabels[a.type] ?? a.type);
  }

  if (notableDogIds.size === 0) return;

  // Get exhibitor user IDs (to skip them — they got a direct email)
  const exhibitorUserIds = new Set(allEntries.map((e) => e.exhibitor?.id).filter(Boolean));

  // Get followers for notable dogs
  const follows = await db.query.dogFollows.findMany({
    where: inArray(dogFollows.dogId, Array.from(notableDogIds)),
    with: {
      user: { columns: { id: true, email: true, name: true } },
    },
  });

  // Group by follower, skip exhibitors
  const followerMap = new Map<string, {
    email: string;
    name: string | null;
    dogs: { dogId: string; dogName: string; breedName: string; placements: string[]; awards: string[] }[];
  }>();

  for (const f of follows) {
    if (!f.user?.email || exhibitorUserIds.has(f.userId)) continue;

    if (!followerMap.has(f.userId)) {
      followerMap.set(f.userId, {
        email: f.user.email,
        name: f.user.name,
        dogs: [],
      });
    }

    const result = dogResults.get(f.dogId);
    if (result) {
      followerMap.get(f.userId)!.dogs.push({ dogId: f.dogId, ...result });
    }
  }

  if (followerMap.size === 0) return;

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const emailPayloads: { from: string; to: string; replyTo: string; subject: string; html: string }[] = [];

  for (const [, follower] of followerMap) {
    // Pick the best result for the subject line
    const bestDog = follower.dogs[0]!;
    const bestAward = bestDog.awards[0] ?? bestDog.placements[0] ?? 'placed';
    const subject = follower.dogs.length === 1
      ? `${bestDog.dogName} ${bestAward} at ${show.name}!`
      : `Dogs you follow placed at ${show.name}!`;

    const dogSections = follower.dogs.map((d) => {
      const highlights = [...d.awards, ...d.placements].join(', ');
      return `
        <div style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #1a1a1a;">${d.dogName}</p>
          ${d.breedName ? `<p style="margin: 0 0 4px; font-size: 13px; color: #666;">${d.breedName}</p>` : ''}
          <p style="margin: 0; font-size: 14px; color: #2D5F3F; font-weight: 600;">${highlights}</p>
        </div>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px; text-align: center;">
        <h2 style="margin: 0; color: #ffffff; font-size: 20px;">Dogs You Follow Placed!</h2>
        <p style="margin: 8px 0 0; color: #b8d4c4; font-size: 14px;">${show.name} &middot; ${showDate}</p>
      </div>
      <div style="padding: 16px 24px;">
        ${dogSections}
      </div>
      <div style="padding: 16px 24px; text-align: center; border-top: 1px solid #e5e5e5;">
        ${btn(`${APP_URL}/shows/${show.slug ?? show.id}/results`, 'View Full Results')}
      </div>
    </div>
    <p style="text-align: center; margin-top: 16px; font-size: 12px; color: #999;">
      Sent by <a href="${APP_URL}" style="color: #2D5F3F; text-decoration: none; font-weight: 600;">Remi</a>
    </p>
  </div>
</body>
</html>`;

    emailPayloads.push({
      from: FROM,
      to: follower.email,
      replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
      subject,
      html,
    });
  }

  if (emailPayloads.length > 0) {
    try {
      if (emailPayloads.length === 1) {
        await resend.emails.send(emailPayloads[0]!);
      } else {
        // Batch in groups of 100
        for (let i = 0; i < emailPayloads.length; i += 100) {
          await resend.batch.send(emailPayloads.slice(i, i + 100));
        }
      }
      console.log(`[results-email] Sent ${emailPayloads.length} follower notification emails`);
    } catch (error) {
      console.error('[results-email] Failed to send follower notifications:', error);
    }
  }
}

/**
 * Create timeline milestone posts for dogs with notable results.
 * Deduplicates via sourceShowId + dogId.
 */
export async function createResultsMilestonePosts(showId: string) {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { id: true, name: true, startDate: true },
  });
  if (!show) return;

  // Get achievements
  const showAchievements = await db.query.achievements.findMany({
    where: eq(achievements.showId, showId),
    with: { dog: { columns: { id: true, registeredName: true } } },
  });

  // Get 1st-3rd placements
  const allEntries = await db.query.entries.findMany({
    where: and(
      eq(entries.showId, showId),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt)
    ),
    with: {
      dog: { columns: { id: true, registeredName: true } },
      entryClasses: {
        with: {
          showClass: { with: { classDefinition: true } },
          result: true,
        },
      },
    },
  });

  // Build milestone data per dog
  const dogMilestones = new Map<string, { dogId: string; dogName: string; ownerId: string | null; caption: string }>();

  for (const a of showAchievements) {
    const label = achievementLabels[a.type] ?? a.type;
    const caption = `Won ${label} at ${show.name}`;
    if (!dogMilestones.has(a.dogId)) {
      dogMilestones.set(a.dogId, {
        dogId: a.dogId,
        dogName: a.dog?.registeredName ?? 'Unknown',
        ownerId: null,
        caption,
      });
    } else {
      // Append to existing caption
      dogMilestones.get(a.dogId)!.caption += ` · ${label}`;
    }
  }

  for (const entry of allEntries) {
    if (!entry.dogId || !entry.dog) continue;
    for (const ec of entry.entryClasses) {
      if (ec.result?.placement && ec.result.placement <= 3) {
        const className = ec.showClass?.classDefinition?.name ?? 'class';
        const sex = ec.showClass?.sex;
        const sexLabel = sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
        const pLabel = placementLabel[ec.result.placement] ?? `${ec.result.placement}th`;
        const caption = `Placed ${pLabel} in ${className}${sexLabel} at ${show.name}`;

        if (!dogMilestones.has(entry.dogId)) {
          dogMilestones.set(entry.dogId, {
            dogId: entry.dogId,
            dogName: entry.dog.registeredName,
            ownerId: null,
            caption,
          });
        }
        // Achievements already have priority — don't overwrite
      }
    }
  }

  if (dogMilestones.size === 0) return;

  // Get owner IDs for each dog
  const dogIds = Array.from(dogMilestones.keys());
  const owners = await db.query.dogOwners.findMany({
    where: and(
      inArray(dogOwners.dogId, dogIds),
      eq(dogOwners.isPrimary, true)
    ),
  });

  for (const owner of owners) {
    const milestone = dogMilestones.get(owner.dogId);
    if (milestone) milestone.ownerId = owner.userId;
  }

  // Check for existing milestones (dedup by sourceShowId + dogId)
  const existingPosts = await db.query.dogTimelinePosts.findMany({
    where: and(
      eq(dogTimelinePosts.sourceShowId, showId),
      inArray(dogTimelinePosts.dogId, dogIds)
    ),
    columns: { dogId: true },
  });
  const existingDogIds = new Set(existingPosts.map((p) => p.dogId));

  let created = 0;
  for (const [, milestone] of dogMilestones) {
    if (existingDogIds.has(milestone.dogId)) continue;
    if (!milestone.ownerId) continue;

    await db.insert(dogTimelinePosts).values({
      dogId: milestone.dogId,
      authorId: milestone.ownerId,
      type: 'milestone',
      caption: milestone.caption,
      sourceShowId: showId,
      createdAt: new Date(show.startDate), // Chronologically correct
    });
    created++;
  }

  console.log(`[results-milestones] Created ${created} milestone posts for show ${show.name}`);
}
