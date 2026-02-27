/**
 * Seed the pricing plans based on Amanda's specifications.
 * Run with: npx tsx scripts/seed-plans.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Seeding pricing plans...\n');

  const result = await db
    .insert(schema.plans)
    .values([
      {
        name: 'Single Breed Club — DIY',
        clubType: 'single_breed',
        serviceTier: 'diy',
        annualFeePence: 9900, // £99/year
        perShowFeePence: 1500, // £15/show
        perEntryFeePence: 150, // £1.50/entry
        description:
          'Self-service plan for single breed clubs. Create shows, manage entries, and generate catalogues yourself.',
        features: [
          'Unlimited show creation',
          'Online entry management',
          'Automatic catalogue generation',
          'Stripe payment processing',
          'Entry reports & analytics',
          'Email notifications to exhibitors',
        ],
        sortOrder: 0,
      },
      {
        name: 'Single Breed Club — Managed',
        clubType: 'single_breed',
        serviceTier: 'managed',
        annualFeePence: 19900, // £199/year
        perShowFeePence: 4000, // £40/show
        perEntryFeePence: 150, // £1.50/entry
        description:
          'Full-service plan for single breed clubs. We handle show setup, schedules, catalogues, and exhibitor queries.',
        features: [
          'Everything in DIY',
          'We set up your show & classes',
          'Schedule & catalogue layout',
          'Exhibitor query handling',
          'Priority support',
          'Pre-publication review',
        ],
        sortOrder: 1,
      },
      {
        name: 'Multi Breed Club — DIY',
        clubType: 'multi_breed',
        serviceTier: 'diy',
        annualFeePence: 14900, // £149/year
        perShowFeePence: 1500, // £15/show
        perEntryFeePence: 150, // £1.50/entry
        description:
          'Self-service plan for multi breed clubs and canine societies. Full platform access for all-breed shows.',
        features: [
          'Unlimited show creation',
          'Multi-breed class management',
          'Online entry management',
          'Automatic catalogue generation',
          'Stripe payment processing',
          'Entry reports & analytics',
          'Email notifications to exhibitors',
        ],
        sortOrder: 2,
      },
      {
        name: 'Multi Breed Club — Managed',
        clubType: 'multi_breed',
        serviceTier: 'managed',
        annualFeePence: 29900, // £299/year
        perShowFeePence: 7500, // £75/show
        perEntryFeePence: 150, // £1.50/entry
        description:
          'Full-service plan for multi breed clubs. Complete concierge service for your show calendar.',
        features: [
          'Everything in DIY',
          'We set up your shows & classes',
          'Schedule & catalogue layout',
          'Exhibitor query handling',
          'Priority support',
          'Pre-publication review',
          'Dedicated account manager',
        ],
        sortOrder: 3,
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (result.length > 0) {
    console.log(`✓ Created ${result.length} plans:`);
    for (const plan of result) {
      const annual = (plan.annualFeePence / 100).toFixed(2);
      const show = (plan.perShowFeePence / 100).toFixed(2);
      const entry = (plan.perEntryFeePence / 100).toFixed(2);
      console.log(
        `  - ${plan.name}: £${annual}/yr + £${show}/show + £${entry}/entry`
      );
    }
  } else {
    console.log('⏭ Plans already exist, nothing to do.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
