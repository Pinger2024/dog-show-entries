import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { backlog } from '../src/server/db/schema/backlog';

const items = [
  {
    featureNumber: 2,
    title: 'Steward Breed/Ring Assignments',
    description: 'Currently stewards see all breeds. Secretaries need to assign stewards to specific breeds or rings so each steward only sees their assigned work.',
    questions: '• Should assignments be per-show or per-day (for multi-day shows)?\n• Should stewards see ONLY their assigned breeds, or all breeds with theirs highlighted?\n• Do you use ring numbers? Should stewards be assigned to rings rather than breeds?',
    priority: 'high' as const,
  },
  {
    featureNumber: 6,
    title: 'Results Entry Page — Ringside Phone UX',
    description: 'The steward results page needs to work well on a phone held at ringside. Needs a guided wizard UX optimised for quick one-handed entry.',
    questions: '• Is the current flow (tap class → enter placements) roughly right, or do you need a different workflow?\n• Do stewards typically enter results class-by-class in order, or jump between classes?\n• Would voice entry (dictating results) be useful, or is tapping faster?',
    priority: 'high' as const,
  },
  {
    featureNumber: 7,
    title: 'Secretary Show Dashboard — Mobile Overhaul',
    description: 'The secretary show dashboard needs better mobile experience. Currently ~7/10 mobile-friendly but needs targeted improvements.',
    questions: 'Can you send a screenshot or describe specifically what\'s hard to use on your phone? That\'ll help target the right bits.',
    priority: 'medium' as const,
  },
  {
    featureNumber: 11,
    title: 'Digitise Paper Results Workflow',
    description: 'Move from paper judge\'s book → secretary results catalogue to a fully digital workflow. Steward enters directly, judge can review/confirm.',
    questions: '• What does the current paper workflow look like? Judge fills in book → steward copies → secretary types up?\n• Should the digital version follow the same flow, or can we simplify (e.g., steward enters directly, judge confirms)?\n• What information goes into the results catalogue beyond placements? (Critiques? Attendance numbers? Absentees?)',
    priority: 'high' as const,
  },
  {
    featureNumber: 14,
    title: 'Dog Profiles & Management Overhaul',
    description: 'Make dog profiles shareable, SEO-friendly, and engaging. Profiles people want to share on social media to drive traffic to Remi. Career timeline, photo gallery, win record.',
    questions: '• What would make YOU share a dog\'s profile? Career timeline? Photo gallery? Win record with rosettes?\n• Should breeders be able to link litters/offspring to sire/dam profiles?\n• What information do exhibitors want to show off most? (Titles, CCs, BOBs, specific show wins?)',
    priority: 'high' as const,
  },
  {
    featureNumber: 15,
    title: 'Near Me Search — Proper Venue Geocoding',
    description: 'Currently limited. Needs proper venue geocoding (lat/lng) for accurate distance-based search.',
    questions: '• Do most shows happen at the same handful of venues? If so, we could build a venue database.\n• How far do exhibitors typically travel? 50 miles? 100 miles? Nationwide?\n• Is postcode-based distance more useful than a map view?',
    priority: 'medium' as const,
  },
  {
    featureNumber: 17,
    title: 'Show Page as Marketing Powerhouse',
    description: 'Each show page could be a mini-website that secretaries share instead of a basic PDF schedule. Social media cards, past show archives with results and stats.',
    questions: '• What info do you currently share on social media to promote a show?\n• Would you use a \'share show\' feature that generates a nice social card/image?\n• Should past show pages become an archive with results, photos, and stats?',
    priority: 'high' as const,
  },
  {
    featureNumber: 21,
    title: 'Junior Handler Form — Design Pass',
    description: 'The JH entry form needs a UX review to ensure it captures the right info and validates correctly.',
    questions: '• What age ranges are typical for JH? (Currently set to 6-24 years)\n• Do JH entries always go through a parent/guardian, or can older teens enter themselves?\n• Any JH-specific rules we should validate? (e.g., can a handler enter multiple shows on same day?)',
    priority: 'medium' as const,
  },
  {
    featureNumber: 28,
    title: 'My Entries Page — Visual Overhaul',
    description: 'The My Entries page needs a visual refresh. Currently a basic list. Could group by show date, add status tabs (upcoming/past/cancelled), show more useful info at a glance.',
    questions: 'What would make the entries page more useful? Grouping by show date? Status-based tabs (upcoming/past/cancelled)? Calendar view?',
    priority: 'medium' as const,
  },
  {
    featureNumber: 29,
    title: 'Exhibitor Dashboard — Vibrant Redesign',
    description: 'Make the dashboard vibrant and useful, not just a list of links. Show upcoming shows, recent results, next eligible shows for each dog.',
    questions: '• What do you want to see when you first log in? Upcoming shows? Recent results? Your dogs\' next eligible shows?\n• Would a \'show calendar\' view (monthly) be useful?\n• Any dashboard features from other platforms (horse shows, agility, etc.) that you like?',
    priority: 'high' as const,
  },
  {
    featureNumber: 35,
    title: 'Remi Pro Strategy — Killer Pro-Only Features',
    description: 'Define and build the premium features that make dog owners want to subscribe to Remi Pro. Revenue driver for the platform.',
    questions: 'What killer features would make dog owners pay for Remi Pro? Ideas:\n• Advanced win tracking & statistics (national ranking, win rate trends)\n• Auto-generated show reports for social media\n• Priority entry booking for popular shows\n• Breeder tools (litter management, puppy tracking)\n• Custom dog profile themes/branding\nWhat resonates? What would Amanda want? What would her exhibitors want?',
    priority: 'high' as const,
  },
  {
    featureNumber: 36,
    title: 'Report a Problem — Floating Feedback Widget',
    description: 'A floating help button for ALL users to submit feedback with auto-diagnostics (browser, page URL, user details). Routes to Michael & Amanda for triage. Once fixed, email the original requester. This is the support channel while getting off the ground.',
    questions: null, // Michael has answered — this is ready to build
    priority: 'high' as const,
    status: 'planned' as const,
  },
];

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  for (const item of items) {
    await db
      .insert(backlog)
      .values({
        featureNumber: item.featureNumber,
        title: item.title,
        description: item.description,
        questions: item.questions,
        priority: item.priority,
        status: item.status ?? 'awaiting_feedback',
      })
      .onConflictDoNothing();
    console.log(`Added #${item.featureNumber}: ${item.title}`);
  }

  await client.end();
  console.log('\nDone! All backlog items seeded.');
}

main();
