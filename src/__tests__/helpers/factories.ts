import { eq } from 'drizzle-orm';
import { testDb } from './db';
import {
  users,
  organisations,
  memberships,
  breeds,
  breedGroups,
  shows,
  showClasses,
  classDefinitions,
  dogs,
  entries,
  entryClasses,
  results,
  stewardAssignments,
  orders,
  payments,
  userRoleEnum,
  membershipStatusEnum,
  entryStatusEnum,
  orderStatusEnum,
  paymentStatusEnum,
} from '@/server/db/schema';
import { randomUUID } from 'crypto';

type UserRole = (typeof userRoleEnum.enumValues)[number];
type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number];
type EntryStatus = (typeof entryStatusEnum.enumValues)[number];
type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

let counter = 0;
const seq = () => ++counter;
const shortId = (len = 8) => randomUUID().slice(0, len);

export async function makeUser(opts: Partial<typeof users.$inferInsert> = {}) {
  const n = seq();
  const [row] = await testDb
    .insert(users)
    .values({
      email: opts.email ?? `user-${n}-${shortId()}@test.local`,
      name: opts.name ?? `Test User ${n}`,
      role: opts.role ?? 'exhibitor',
      ...opts,
    })
    .returning();
  return row;
}

export async function makeOrg(opts: Partial<typeof organisations.$inferInsert> = {}) {
  const n = seq();
  const [row] = await testDb
    .insert(organisations)
    .values({
      name: opts.name ?? `Test Club ${n}`,
      ...opts,
    })
    .returning();
  return row;
}

export async function makeMembership(opts: {
  userId: string;
  organisationId: string;
  status?: MembershipStatus;
}) {
  const [row] = await testDb
    .insert(memberships)
    .values({
      userId: opts.userId,
      organisationId: opts.organisationId,
      status: opts.status ?? 'active',
    })
    .returning();
  return row;
}

export async function makeBreedGroup(opts: Partial<typeof breedGroups.$inferInsert> = {}) {
  const n = seq();
  const [row] = await testDb
    .insert(breedGroups)
    .values({ name: opts.name ?? `Group ${n}-${shortId(4)}`, ...opts })
    .returning();
  return row;
}

export async function makeBreed(opts: Partial<typeof breeds.$inferInsert> = {}) {
  const n = seq();
  const groupId = opts.groupId ?? (await makeBreedGroup()).id;
  const [row] = await testDb
    .insert(breeds)
    .values({
      name: opts.name ?? `Test Breed ${n}-${shortId(4)}`,
      groupId,
      ...opts,
    })
    .returning();
  return row;
}

export async function makeClassDef(opts: Partial<typeof classDefinitions.$inferInsert> = {}) {
  const n = seq();
  const [row] = await testDb
    .insert(classDefinitions)
    .values({
      name: opts.name ?? `Class Def ${n}-${shortId(4)}`,
      type: opts.type ?? 'age',
      ...opts,
    })
    .returning();
  return row;
}

export async function makeShow(opts: Partial<typeof shows.$inferInsert> & {
  organisationId: string;
}) {
  const n = seq();
  const [row] = await testDb
    .insert(shows)
    .values({
      name: opts.name ?? `Test Show ${n}`,
      showType: opts.showType ?? 'open',
      showScope: opts.showScope ?? 'single_breed',
      startDate: opts.startDate ?? '2030-06-01',
      endDate: opts.endDate ?? '2030-06-01',
      status: opts.status ?? 'draft',
      ...opts,
    })
    .returning();
  return row;
}

export async function makeShowClass(opts: {
  showId: string;
  classDefinitionId?: string;
  entryFee?: number;
  breedId?: string;
}) {
  const classDefinitionId = opts.classDefinitionId ?? (await makeClassDef()).id;
  const [row] = await testDb
    .insert(showClasses)
    .values({
      showId: opts.showId,
      classDefinitionId,
      breedId: opts.breedId,
      entryFee: opts.entryFee ?? 500, // pence
    })
    .returning();
  return row;
}

export async function makeDog(opts: Partial<typeof dogs.$inferInsert> & { ownerId: string; breedId?: string }) {
  const n = seq();
  const breedId = opts.breedId ?? (await makeBreed()).id;
  const [row] = await testDb
    .insert(dogs)
    .values({
      registeredName: opts.registeredName ?? `Test Dog ${n}`,
      breedId,
      sex: opts.sex ?? 'dog',
      dateOfBirth: opts.dateOfBirth ?? '2022-01-01',
      ownerId: opts.ownerId,
      ...opts,
    })
    .returning();
  return row;
}

export async function makeEntry(opts: {
  showId: string;
  dogId: string;
  exhibitorId: string;
  status?: EntryStatus;
  totalFee?: number;
}) {
  const [row] = await testDb
    .insert(entries)
    .values({
      showId: opts.showId,
      dogId: opts.dogId,
      exhibitorId: opts.exhibitorId,
      status: opts.status ?? 'confirmed',
      totalFee: opts.totalFee ?? 500,
    })
    .returning();
  return row;
}

export async function makeEntryClass(opts: {
  entryId: string;
  showClassId: string;
  fee?: number;
}) {
  const [row] = await testDb
    .insert(entryClasses)
    .values({
      entryId: opts.entryId,
      showClassId: opts.showClassId,
      fee: opts.fee ?? 500,
    })
    .returning();
  return row;
}

export async function makeResult(opts: {
  entryClassId: string;
  placement?: number | null;
  placementStatus?: string | null;
  recordedBy?: string;
}) {
  const [row] = await testDb
    .insert(results)
    .values({
      entryClassId: opts.entryClassId,
      placement: opts.placement ?? null,
      placementStatus: opts.placementStatus ?? null,
      recordedBy: opts.recordedBy,
    })
    .returning();
  return row;
}

export async function makeStewardAssignment(opts: {
  userId: string;
  showId: string;
  ringId?: string;
}) {
  const [row] = await testDb
    .insert(stewardAssignments)
    .values({ userId: opts.userId, showId: opts.showId, ringId: opts.ringId })
    .returning();
  return row;
}

export async function makeOrder(opts: {
  showId: string;
  exhibitorId: string;
  status?: OrderStatus;
  totalAmount?: number;
  stripePaymentIntentId?: string;
}) {
  const [row] = await testDb
    .insert(orders)
    .values({
      showId: opts.showId,
      exhibitorId: opts.exhibitorId,
      status: opts.status ?? 'pending_payment',
      totalAmount: opts.totalAmount ?? 1000,
      stripePaymentIntentId: opts.stripePaymentIntentId,
    })
    .returning();
  return row;
}

export async function makePayment(opts: {
  entryId?: string;
  orderId?: string;
  stripePaymentId: string;
  amount?: number;
  status?: PaymentStatus;
}) {
  const [row] = await testDb
    .insert(payments)
    .values({
      entryId: opts.entryId,
      orderId: opts.orderId,
      stripePaymentId: opts.stripePaymentId,
      amount: opts.amount ?? 1000,
      status: opts.status ?? 'pending',
    })
    .returning();
  return row;
}

/** Simulate a published-and-locked show without going through publishResults. */
export async function lockShowResults(showId: string) {
  const now = new Date();
  await testDb
    .update(shows)
    .set({ resultsLockedAt: now, resultsPublishedAt: now })
    .where(eq(shows.id, showId));
}

/** Convenience: build a secretary user belonging to a fresh org. */
export async function makeSecretaryWithOrg() {
  const [user, org] = await Promise.all([
    makeUser({ role: 'secretary' }),
    makeOrg(),
  ]);
  await makeMembership({ userId: user.id, organisationId: org.id });
  return { user, org };
}

/** Same as makeSecretaryWithOrg + a fresh breed. Convenience for show-creation tests. */
export async function makeSecretaryWithOrgAndBreed() {
  const [{ user, org }, breed] = await Promise.all([
    makeSecretaryWithOrg(),
    makeBreed(),
  ]);
  return { user, org, breed };
}
