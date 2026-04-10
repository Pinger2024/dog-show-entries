/**
 * One-shot script to capture the 16 catalogue refinement items
 * Michael and Amanda discussed offline on 2026-04-10.
 * Run with: npx tsx scripts/add-catalogue-backlog.ts
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { backlog } from '../src/server/db/schema/backlog';
import { desc } from 'drizzle-orm';

type Priority = 'high' | 'medium' | 'low';

const items: Array<{
  title: string;
  description: string;
  priority: Priority;
  questions?: string;
}> = [
  {
    title: 'Catalogue — Remove Reassign Catalogue Numbers Button',
    description:
      'The "reassign catalogue numbers" button on the show dashboard catalogue section is unnecessary — numbers should be assigned automatically and never need manual intervention. Remove the button and any associated flow. Auto-assignment already happens on first visit (commit 9aad79a).',
    priority: 'high',
  },
  {
    title: 'Catalogue — Review Catalogue Preview Value',
    description:
      'There is a catalogue preview feature on the show dashboard. Question: what benefit is it actually serving? Investigate usage patterns and either justify keeping it, improve it, or remove it. The full-document preview may be redundant now that per-format download buttons exist.',
    priority: 'medium',
    questions:
      'What does the current preview show that the per-format downloads don\'t? Is anyone clicking it?',
  },
  {
    title: 'Catalogue Formats — Remove "Standard", Rename "Ringside" to "Standard"',
    description:
      'The "standard" catalogue format is a duplicate of "by class" — remove it. Then rename the "ringside" format to "standard" so it becomes the default/primary format users reach for.',
    priority: 'high',
  },
  {
    title: 'Catalogue Settings — Redesign for Clarity',
    description:
      'Open-ended design review: how can the catalogue settings page be made better? Currently a long form of options. Consider: grouping by purpose (cover / front matter / body / back matter), live preview of each setting, smart defaults, progressive disclosure.',
    priority: 'medium',
    questions:
      'What specifically feels wrong about the current settings page — too many options, confusing labels, poor ordering, or something else?',
  },
  {
    title: 'Catalogue — Settings Not Filtering Through Correctly',
    description:
      'Bug: some settings on the catalogue settings page are not being applied when the catalogue is rendered. Needs a full audit of each setting: is it being read by the render pipeline? Is it reaching every format that should respect it?',
    priority: 'high',
  },
  {
    title: 'Catalogue Formats — Remove "Alphabetical"',
    description:
      'Amanda confirmed the alphabetical catalogue format is not used and not needed. Remove the format option from the UI, the render pipeline, and any related code.',
    priority: 'medium',
  },
  {
    title: 'Catalogue Formats — Rename "Judging" to "Steward"',
    description:
      'The "judging" catalogue format is really for stewards to use ringside. Rename it to "Steward" throughout the UI and labels. (The file can stay as catalogue-judging.tsx or be renamed — either is fine.)',
    priority: 'medium',
  },
  {
    title: 'Entry Form — Exclude From Catalogue Checkbox',
    description:
      'Add a checkbox on the entry form that lets exhibitors opt to exclude their personal details (owner name, address, phone) from the published catalogue. The dog still appears — just the exhibitor\'s personal info is redacted. Related to RKC F(1).11.b.(6)/(8) withhold infrastructure (commit 4599c44) but from the exhibitor side rather than secretary side.',
    priority: 'high',
  },
  {
    title: 'Catalogue — Disable "Marked for RKC" Until Results Finalised',
    description:
      'The "Marked for RKC" catalogue format button should be disabled until results are finalised. Currently it\'s clickable at all times but produces an empty/useless document when no results exist. Gate the button with a disabled state + tooltip explaining "available after results are finalised".',
    priority: 'high',
  },
  {
    title: 'Catalogue Front Matter — Cover vs Page 2 Regulations Layout',
    description:
      'On the cover page, only "outside attractions" and "no wet weather return of fees" regulations should appear. All other regulations (general RKC regs, society regulations) should move to page 2. Apply this layout consistently across every catalogue format that shows regulations.',
    priority: 'medium',
  },
  {
    title: 'Catalogue — Welcome Note & Judges Bio on Page 2/3',
    description:
      'Page 2 and/or 3 of the catalogue should include a welcome note and the judges\' bios, pulled from the catalogue settings. Wire the settings fields through to the render pipeline.',
    priority: 'medium',
  },
  {
    title: 'Sponsors/Judges — Editable from Multiple Places (Catalogue Settings + People + Sponsors)',
    description:
      'Class sponsors, judges bios, and judges images should all be editable from multiple places in the app. Rationale: class sponsors often aren\'t confirmed until the catalogue-prep stage, so forcing users into the Sponsors section breaks the flow. Show the same editable fields in (a) Catalogue Settings, (b) People section, and (c) Sponsors section. All three views write to the same underlying records — no duplication.',
    priority: 'medium',
  },
  {
    title: 'Catalogue — Move Exhibitor Index to the End',
    description:
      'Currently the alphabetical exhibitor index appears at the front of the catalogue. Amanda says "no one reads this" — move it to the back of the catalogue where reference-lookup sections belong.',
    priority: 'high',
  },
  {
    title: 'Catalogue — Dedicated "BEST AWARDS" Section with Sponsor Table',
    description:
      'Add a dedicated BEST AWARDS section in the catalogue that lists every "Best" award available at the show (BOB, Best Puppy in Breed, Best Veteran in Breed, Best Opposite Sex, etc.) with a table showing who sponsors each award.',
    priority: 'high',
  },
  {
    title: 'Catalogue — Write-In Space for Best-in-Class Winners',
    description:
      'The catalogue already has write-in space for class placements. Add equivalent write-in space for the "Best in Class" (or equivalent top awards) of each class, so the secretary/steward can fill them in ringside during judging.',
    priority: 'medium',
  },
  {
    title: 'Catalogue Advertising — Paid Ad Placements for Clubs',
    description:
      'Allow clubs to include paid advertisements in their catalogue — e.g. local dog food suppliers, photographers, groomers. Needs: ad upload UI, placement rules (full page / half page / quarter), pricing, revenue split with Remi? Backlog for future work — not urgent.',
    priority: 'low',
  },
];

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  // Find the highest feature number currently in use
  const last = await db
    .select({ featureNumber: backlog.featureNumber })
    .from(backlog)
    .orderBy(desc(backlog.featureNumber))
    .limit(1);
  const startNum = (last[0]?.featureNumber ?? 0) + 1;

  console.log(`Inserting ${items.length} items starting at #${startNum}...\n`);

  const rows = items.map((item, i) => ({
    featureNumber: startNum + i,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: 'planned' as const,
    questions: item.questions ?? null,
  }));

  const inserted = await db.insert(backlog).values(rows).returning({
    featureNumber: backlog.featureNumber,
    title: backlog.title,
    priority: backlog.priority,
  });

  for (const r of inserted) {
    console.log(`  #${r.featureNumber} [${r.priority}] ${r.title}`);
  }
  console.log(`\n✓ Inserted ${inserted.length} items`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
