/**
 * One-shot: add Alexxa Cowan to South Western GSD's Junior Handling 12-16 class.
 *
 * Mandy asked for this on 2026-07-27. It needs a script rather than the UI
 * because `secretary.createManualEntry` requires a dogId, and a Junior Handler
 * entry has NO dog — so the secretary screens structurally cannot create one.
 * That gap is going on the backlog; this mirrors what createManualEntry does
 * (order → entry → class → payment → audit log), minus the dog, plus the
 * junior_handler_details row.
 *
 * The date of birth is NOT invented. Alexxa is already on file under Maxine's
 * account from four other shows: three say 2011-11-12 and one (GSD Club of
 * Scotland) says 2011-07-21. Mandy confirmed she is 14, which matches the
 * November date and rules the July one out as a slip.
 *
 * Catalogue number is deliberately left NULL — Mandy asked that the South
 * Western renumber wait until after her noon cut-off so it isn't done twice.
 * That re-sort will slot this entry into its class.
 *
 *   npx tsx scripts/add-jh-entry-alexxa-cowan.ts           # dry run
 *   npx tsx scripts/add-jh-entry-alexxa-cowan.ts --commit  # write
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull, ilike } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const COMMIT = process.argv.includes('--commit');

const SHOW_NAME_LIKE = '%South Western%';
const EXHIBITOR_EMAIL = 'craziantix@sky.com';
const CLASS_NAME = 'JHA Handling (12-16)';
const HANDLER_NAME = 'Alexxa Cowan';
const HANDLER_DOB = '2011-11-12';
const FEE_PENCE = 300;
/** Mandy McAteer — she requested the entry, so the audit trail names her. */
const REQUESTED_BY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client, { schema });

  console.log(`DB: ${process.env.DATABASE_URL!.replace(/:\/\/[^:]+:[^@]+@/, '://***@')}`);
  console.log(COMMIT ? '*** COMMIT MODE — this will write ***\n' : 'DRY RUN (pass --commit to write)\n');

  const show = await db.query.shows.findFirst({
    where: ilike(schema.shows.name, SHOW_NAME_LIKE),
    columns: { id: true, name: true, status: true, catalogueNumbersLockedAt: true },
  });
  if (!show) throw new Error('show not found');

  const exhibitor = await db.query.users.findFirst({
    where: eq(schema.users.email, EXHIBITOR_EMAIL),
    columns: { id: true, name: true, email: true },
  });
  if (!exhibitor) throw new Error(`no user with email ${EXHIBITOR_EMAIL}`);

  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, show.id),
    with: { classDefinition: true },
  });
  const jhClass = showClasses.find((sc) => sc.classDefinition?.name === CLASS_NAME);
  if (!jhClass) throw new Error(`class "${CLASS_NAME}" not found on this show`);

  console.log(`show      : ${show.name} (${show.status})`);
  console.log(`numbers   : ${show.catalogueNumbersLockedAt ? 'LOCKED' : 'provisional (unlocked)'}`);
  console.log(`exhibitor : ${exhibitor.name} <${exhibitor.email}>`);
  console.log(`class     : ${CLASS_NAME} (#${jhClass.classNumber}) — £${(FEE_PENCE / 100).toFixed(2)}`);
  console.log(`handler   : ${HANDLER_NAME}, dob ${HANDLER_DOB}\n`);

  // Idempotency — never create a second entry for the same handler on this show.
  const existing = await db
    .select({ id: schema.entries.id, handler: schema.juniorHandlerDetails.handlerName })
    .from(schema.entries)
    .innerJoin(schema.juniorHandlerDetails, eq(schema.juniorHandlerDetails.entryId, schema.entries.id))
    .where(and(eq(schema.entries.showId, show.id), isNull(schema.entries.deletedAt)));

  console.log(`Junior Handlers already on this show (${existing.length}):`);
  for (const e of existing) console.log(`  - ${e.handler}`);
  console.log();

  const clash = existing.find(
    (e) => e.handler.trim().toLowerCase() === HANDLER_NAME.trim().toLowerCase(),
  );
  if (clash) {
    console.log(`ALREADY PRESENT — entry ${clash.id} is "${clash.handler}". Nothing to do.`);
    await client.end();
    return;
  }

  if (!COMMIT) {
    console.log('Would insert, in one transaction:');
    console.log('  orders                 paid, £3.00, no Stripe PI → "paid direct to the club"');
    console.log('  entries                junior_handler, dog_id NULL, confirmed, £3.00');
    console.log('  entry_classes          → JHA Handling (12-16)');
    console.log('  junior_handler_details Alexxa Cowan, 2011-11-12');
    console.log('  payments               succeeded, initial, £3.00');
    console.log('  entry_audit_log        attributed to Mandy McAteer');
    console.log('\nCatalogue number left NULL for the post-noon re-sort.');
    await client.end();
    return;
  }

  const entryId = await db.transaction(async (tx) => {
    // No stripePaymentIntentId — the club collects this £3 itself, so it shows
    // under "paid direct to the club" and never lands in a Remi payout figure.
    const [order] = await tx
      .insert(schema.orders)
      .values({
        showId: show.id,
        exhibitorId: exhibitor.id,
        status: 'paid',
        totalAmount: FEE_PENCE,
      })
      .returning();

    const [entry] = await tx
      .insert(schema.entries)
      .values({
        showId: show.id,
        dogId: null, // a Junior Handler entry has no dog
        exhibitorId: exhibitor.id,
        orderId: order!.id,
        entryType: 'junior_handler',
        status: 'confirmed',
        totalFee: FEE_PENCE,
        isNfc: false,
      })
      .returning();

    await tx.insert(schema.entryClasses).values({
      entryId: entry!.id,
      showClassId: jhClass.id,
      fee: FEE_PENCE,
    });

    await tx.insert(schema.juniorHandlerDetails).values({
      entryId: entry!.id,
      handlerName: HANDLER_NAME,
      dateOfBirth: HANDLER_DOB,
      kcNumber: null,
    });

    await tx.insert(schema.payments).values({
      entryId: entry!.id,
      orderId: order!.id,
      amount: FEE_PENCE,
      status: 'succeeded',
      type: 'initial',
    });

    await tx.insert(schema.entryAuditLog).values({
      entryId: entry!.id,
      action: 'created',
      userId: REQUESTED_BY_USER_ID,
      changes: {
        source: 'secretary',
        paymentMethod: 'bank_transfer',
        exhibitorEmail: EXHIBITOR_EMAIL,
        handlerName: HANDLER_NAME,
        handlerDob: HANDLER_DOB,
      },
      reason:
        "Junior Handler entry added on Mandy's request (2026-07-27). Created by script " +
        'because createManualEntry requires a dogId and a JH entry has no dog.',
    });

    return entry!.id;
  });

  console.log(`CREATED entry ${entryId}`);

  const check = await db
    .select({
      id: schema.entries.id,
      status: schema.entries.status,
      entryType: schema.entries.entryType,
      dogId: schema.entries.dogId,
      fee: schema.entries.totalFee,
      catalogueNumber: schema.entries.catalogueNumber,
      handler: schema.juniorHandlerDetails.handlerName,
      dob: schema.juniorHandlerDetails.dateOfBirth,
    })
    .from(schema.entries)
    .innerJoin(schema.juniorHandlerDetails, eq(schema.juniorHandlerDetails.entryId, schema.entries.id))
    .where(eq(schema.entries.id, entryId));
  console.log('verified:', check[0]);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
