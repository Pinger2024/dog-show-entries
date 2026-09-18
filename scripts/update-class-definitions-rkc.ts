/**
 * Rewrite class_definitions.description to the full official RKC F(1)
 * wording — the long form with "Challenge Certificate/CACIB/CAC/Green
 * Star" references that matches what RKC publishes in its schedules.
 *
 * Amanda's feedback 2026-04-17: the shortened wording ("CC or 5 or
 * more first prizes") didn't match the official wording printed in
 * RKC-compliant schedules. This script aligns our definitions so
 * every catalogue and schedule Remi produces matches RKC F(1)
 * verbatim.
 *
 * Safe to run repeatedly — uses name-based upsert. Run with:
 *   npx tsx scripts/update-class-definitions-rkc.ts
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';
import { eq } from 'drizzle-orm';

// Official RKC F(1) regulation wording. The Challenge Certificate/
// CACIB/CAC/Green Star compound is repeated across every eligibility
// class because those are the four "top award" equivalents: UK CC,
// international CACIB, national CAC, Irish Green Star.
const DEFINITIONS: { name: string; description: string }[] = [
  {
    name: 'Minor Puppy',
    description:
      'For dogs of six and not exceeding nine calendar months of age on the first day of the Show.',
  },
  {
    name: 'Puppy',
    description:
      'For dogs of six and not exceeding twelve calendar months of age on the first day of the Show.',
  },
  {
    name: 'Junior',
    description:
      'For dogs of six and not exceeding eighteen calendar months of age on the first day of the Show.',
  },
  {
    name: 'Yearling',
    description:
      'For dogs of twelve and not exceeding twenty-four calendar months of age on the first day of the Show.',
  },
  {
    name: 'Maiden',
    description:
      'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or a First Prize at an Open or Championship Show (Puppy, Special Puppy, Minor Puppy, Special Minor Puppy and Special Junior classes excepted, whether restricted or not).',
  },
  {
    name: 'Novice',
    description:
      'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or three or more First Prizes at Open and Championship Shows (Puppy, Special Puppy, Minor Puppy and Special Minor Puppy classes excepted, whether restricted or not).',
  },
  {
    name: 'Undergraduate',
    description:
      'For dogs which have not won three or more First Prizes at Championship Shows in Undergraduate, Graduate, Post Graduate, Minor Limit, Mid Limit, Limit and Open classes, whether restricted or not, where Challenge Certificates were offered for the breed.',
  },
  {
    name: 'Graduate',
    description:
      'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or four or more First Prizes at Championship Shows in Graduate, Post Graduate, Minor Limit, Mid Limit, Limit and Open classes, whether restricted or not, where Challenge Certificates were offered for the breed.',
  },
  {
    name: 'Post Graduate',
    description:
      'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Championship Shows in Post Graduate, Minor Limit, Mid Limit, Limit and Open classes, whether restricted or not, where Challenge Certificates were offered for the breed.',
  },
  {
    name: 'Mid Limit',
    description:
      'For dogs which have not won three Challenge Certificates/CACIBs/CACs/Green Stars or seven or more First Prizes in all, at Championship Shows in Mid Limit, Limit and Open classes confined to the breed, whether restricted or not, at Shows where Challenge Certificates were offered for the breed.',
  },
  {
    name: 'Limit',
    description:
      'For dogs which have not become Show Champions under the Royal Kennel Club Regulations or under the rules of any governing body recognised by the Royal Kennel Club, or won seven or more First Prizes in all, at Championship Shows in Limit or Open classes confined to the breed, whether restricted or not, at Shows where Challenge Certificates were offered for the breed.',
  },
  {
    name: 'Open',
    description:
      'For all dogs of the breeds for which the class is provided and eligible for entry at the Show.',
  },
  {
    name: 'Veteran',
    description:
      'For dogs of not less than seven years of age on the first day of the Show.',
  },
  {
    name: 'Special Beginners',
    description:
      'For owner, handler or exhibit not having won a First Prize at any Championship Show (Exhibitor or Exhibit need only be eligible).',
  },
  // Special Long Coat variants are breed-specific additions (GSD clubs
  // use them to split long-coat dogs out) — align wording with the
  // equivalent main classes.
  {
    name: 'Special Long Coat Puppy',
    description:
      'For Long Coat dogs of six and not exceeding twelve calendar months of age on the first day of the Show.',
  },
  {
    name: 'Special Long Coat Junior',
    description:
      'For Long Coat dogs of six and not exceeding eighteen calendar months of age on the first day of the Show.',
  },
  {
    name: 'Special Long Coat Yearling',
    description:
      'For Long Coat dogs of twelve and not exceeding twenty-four calendar months of age on the first day of the Show.',
  },
  {
    name: 'Special Long Coat Open',
    description:
      'For all Long Coat dogs of the breed eligible for entry at the Show.',
  },
  // Junior Handler — judged on handling skill, not the dog.
  {
    name: 'Junior Handler (6-11)',
    description:
      'For handlers of six and not exceeding eleven years of age on the day of the Show. Judged on handling skill, not the dog.',
  },
  {
    name: 'Junior Handler (12-16)',
    description:
      'For handlers of twelve and not exceeding sixteen years of age on the day of the Show. Judged on handling skill, not the dog.',
  },
  {
    name: 'Junior Handler (17-24)',
    description:
      'For handlers of seventeen and not exceeding twenty-four years of age on the day of the Show. Judged on handling skill, not the dog.',
  },
  // JHA (Junior Handling Association) variants
  {
    name: 'JHA Handling (6-11)',
    description:
      'Junior Handling Association class for handlers of six and not exceeding eleven years. JHA membership required.',
  },
  {
    name: 'JHA Handling (12-16)',
    description:
      'Junior Handling Association class for handlers of twelve and not exceeding sixteen years. JHA membership required.',
  },
  {
    name: 'YKC Handling (12-17)',
    description:
      'Young Kennel Club handling class for handlers of twelve and not exceeding seventeen years. YKC membership required. Crufts qualifier.',
  },
  {
    name: 'Good Citizen Dog Scheme',
    description:
      'For dogs that have passed any level of the Royal Kennel Club Good Citizen Dog Scheme.',
  },
  // New class — societies often include NFC so exhibitors from breeds
  // without classification can parade their dogs. Not a competition class.
  {
    name: 'Not For Competition',
    description:
      'Societies may accept such entries from breeds of dogs which are not separately classified at the Show to parade on the day. No prize money, certificates or awards shall be made in respect of such exhibits, who shall not compete for any award.',
  },
  // A.V. (Any Variety) classes — reference-only
  {
    name: 'A.V Imported Breed Register (Gundog)',
    description:
      'Any Variety class for Imported Breed Register Gundog breeds. Open to all IBR breeds classified under Gundog Group.',
  },
  {
    name: 'A.V Not Separately Classified',
    description:
      'Any Variety class for breeds not separately classified at this Show. Open to all breeds without dedicated classes.',
  },
];

async function main() {
  if (!db) throw new Error('no db');

  let updated = 0;
  let inserted = 0;
  for (const def of DEFINITIONS) {
    const existing = await db.query.classDefinitions.findFirst({
      where: eq(s.classDefinitions.name, def.name),
    });
    if (existing) {
      if (existing.description !== def.description) {
        await db.update(s.classDefinitions)
          .set({ description: def.description })
          .where(eq(s.classDefinitions.id, existing.id));
        updated++;
        console.log(`  updated: ${def.name}`);
      }
    } else {
      // Heuristic: age classes have a month-based threshold, junior-
      // handler classes say "handler", everything else is 'special'.
      const n = def.name.toLowerCase();
      const type: 'age' | 'achievement' | 'special' | 'junior_handler' =
        /puppy|junior\b|yearling|veteran|long coat puppy|long coat junior|long coat yearling/.test(n)
          ? 'age'
          : n.includes('handler') || n.includes('handling')
          ? 'junior_handler'
          : 'special';
      await db.insert(s.classDefinitions).values({
        name: def.name,
        type,
        description: def.description,
      });
      inserted++;
      console.log(`  inserted: ${def.name} (type=${type})`);
    }
  }
  console.log(`\nDone. ${updated} updated, ${inserted} inserted.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
