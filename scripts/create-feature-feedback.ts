import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema/index.js';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client, { schema });

async function main() {
  const features = [
    {
      subject: 'Feature: Live Show Results',
      textBody: 'Public live results page for each show. As steward records placements, they appear instantly online. Exhibitors at other rings, family at home, or people who couldn\'t attend can follow along in real time. Amanda: "defo up for it". Infrastructure already exists via steward.getLiveResults router.',
    },
    {
      subject: 'Feature: Smart Class Recommendations',
      textBody: 'When entering a show, suggest which classes the dog should enter based on age, breed, and past results. Amanda notes: age-based eligibility already works, but achievement classes need win tracking. Suggestion: let exhibitors log win count when registering a dog, then auto-filter as they win out of classes.',
    },
    {
      subject: 'Feature: Dog Career Profiles',
      textBody: 'Public dog profile page showing full show career — wins, placements, progression through classes over time. Like a sporting stats page. Amanda: "defo up for it". Data already exists in entries/results tables, needs a public-facing page.',
    },
    {
      subject: 'Feature: Show Circuit Planning',
      textBody: 'Calendar of upcoming shows filtered by breed and region. "Here are the 4 GSD shows within 100 miles in the next 3 months" with one-tap entry. Amanda: "defo up for it". Needs venue geolocation and breed filtering on shows list.',
    },
    {
      subject: 'Feature: Judge Critiques',
      textBody: 'Judges or stewards can type/dictate critiques on show day, published immediately alongside results. Amanda notes: KC already mandates critiques for championship shows (judges fined otherwise). Could be optional for open shows. Needs new critiques table and UI for entry.',
    },
    {
      subject: 'Feature: KC Title Tracking',
      textBody: 'Track progress toward KC titles (Junior Warrant points, Stud Book entries) and notify exhibitors of progress and eligible upcoming shows. Amanda: "brilliant idea" but notes it only works fully if all clubs use Remi. Build with caveats — show progress from Remi clubs with partial data disclaimer.',
    },
  ];

  for (const f of features) {
    const [item] = await db
      .insert(schema.feedback)
      .values({
        resendEmailId: `internal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromEmail: 'michael@prometheus-it.com',
        fromName: 'Michael (internal)',
        subject: f.subject,
        textBody: f.textBody,
        status: 'in_progress',
        notes: 'Innovation feature — approved by Amanda',
      })
      .returning();
    console.log(`Created: ${item!.id} — ${f.subject}`);
  }

  await client.end();
}

main();
