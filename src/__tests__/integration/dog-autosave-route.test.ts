import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getImpersonatedUserId } from '@/lib/impersonation';
import { POST as dogAutosavePOST } from '@/app/api/dog-autosave/[dogId]/route';
import { makeUser, makeDog } from '../helpers/factories';
import { testDb } from '../helpers/db';
import { dogs, dogOwners, dogSvProfile } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

/**
 * /api/dog-autosave/[dogId] — the beacon-friendly autosave behind the dog
 * form's self-saving sections (Mandy 2026-07-11: an exhibitor lost sire/dam
 * registration + health details to an unpressed second save button).
 * Mirrors the schedule-autosave guarantees: owner-only auth, merge
 * semantics, and a wipe guard against unhydrated-form-defaults payloads.
 */

const params = (dogId: string) => ({ params: Promise.resolve({ dogId }) });
const req = (dogId: string, body: unknown) =>
  new NextRequest(`http://localhost/api/dog-autosave/${dogId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(getImpersonatedUserId).mockResolvedValue(null);
});

describe('POST /api/dog-autosave/[dogId]', () => {
  it('401s unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await dogAutosavePOST(req('00000000-0000-0000-0000-000000000000', {}), params('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('403s a non-owner', async () => {
    const owner = await makeUser({});
    const stranger = await makeUser({});
    const dog = await makeDog({ ownerId: owner.id });
    authedAs(stranger);
    const res = await dogAutosavePOST(req(dog.id, { dog: { sireName: 'X' } }), params(dog.id));
    expect(res.status).toBe(403);
  });

  // Rafaye Kanto incident, 2026-08-12: a co-owner linked via dog_owners.user_id
  // (not dogs.owner_id) got 403'd on autosave — same rule as dogs.update now.
  it('200s a linked co-owner (dog_owners.user_id, not dogs.owner_id)', async () => {
    const owner = await makeUser({});
    const coOwner = await makeUser({});
    const dog = await makeDog({ ownerId: owner.id });
    await testDb.insert(dogOwners).values({
      dogId: dog.id,
      userId: coOwner.id,
      ownerName: 'Co Owner',
      ownerAddress: '2 Low St',
      ownerEmail: 'co-owner@test.local',
      isPrimary: false,
      sortOrder: 1,
    });
    authedAs(coOwner);
    const res = await dogAutosavePOST(req(dog.id, { dog: { sireName: 'X' } }), params(dog.id));
    expect(res.status).toBe(200);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('X');
  });

  it('404s an unknown dog', async () => {
    const user = await makeUser({});
    authedAs(user);
    const id = '00000000-0000-0000-0000-000000000000';
    const res = await dogAutosavePOST(req(id, {}), params(id));
    expect(res.status).toBe(404);
  });

  it('saves the dog-fields group and leaves omitted fields untouched (merge)', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id, sireName: 'Original Sire' });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, {
        dog: {
          breederCountry: 'United Kingdom',
          breederCity: 'Edinburgh',
          breederPostcode: 'EH21 5JQ',
          sireRegistrationBody: 'kc',
          sireRegistrationNumber: 'AQ01738101',
        },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.breederCountry).toBe('United Kingdom');
    expect(saved?.breederCity).toBe('Edinburgh');
    expect(saved?.breederPostcode).toBe('EH21 5JQ');
    expect(saved?.sireRegistrationBody).toBe('kc');
    expect(saved?.sireRegistrationNumber).toBe('AQ01738101');
    // Omitted key untouched — merge, not replace.
    expect(saved?.sireName).toBe('Original Sire');
  });

  it('upserts the SV profile and merges partial updates', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);

    // First save creates the profile row.
    let res = await dogAutosavePOST(
      req(dog.id, { svProfile: { hipGrade: 'bva', hipScore: '4:4', dna: 'recorded' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    // Second save with only one field must not null the others.
    res = await dogAutosavePOST(
      req(dog.id, { svProfile: { workingTitle: 'IGP1' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.hipGrade).toBe('bva');
    expect(profile?.hipScore).toBe('4:4');
    expect(profile?.dna).toBe('recorded');
    expect(profile?.workingTitle).toBe('IGP1');
  });

  it('refuses a blank dog-fields payload against a populated dog (wipe guard)', async () => {
    const user = await makeUser({});
    const dog = await makeDog({
      ownerId: user.id,
      sireName: 'Kept Sire',
      breederName: 'Kept Breeder',
    });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, {
        dog: {
          sireName: '',
          damName: '',
          breederName: '',
          breederCountry: '',
          breederCity: '',
          breederPostcode: '',
        },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toContain('dog');

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Kept Sire');
    expect(saved?.breederName).toBe('Kept Breeder');
  });

  it('refuses a default-shaped SV payload against a populated profile (wipe guard)', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);

    await dogAutosavePOST(
      req(dog.id, { svProfile: { hipGrade: 'normal', workingTitle: 'IGP3' } }),
      params(dog.id),
    );

    // The unhydrated health card's defaults: everything not_required/null.
    const res = await dogAutosavePOST(
      req(dog.id, {
        svProfile: {
          hipGrade: 'not_required',
          hipScore: null,
          elbowGrade: 'not_required',
          haemophiliaClear: 'not_required',
          dmTest: 'not_required',
          koerung: null,
          dna: null,
          workingTitle: null,
        },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toContain('svProfile');

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.hipGrade).toBe('normal');
    expect(profile?.workingTitle).toBe('IGP3');
  });

  // Was: 'accepts a genuine clearing edit when other content remains', which
  // asserted the sire ended up NULL. That encoded the opposite of the rule
  // dogs.update had carried since e2c852ec the same month, and it is the
  // behaviour Michael reproduced on 2026-09-11. A NON-pedigree field is still
  // freely clearable — only the four the catalogue prints are protected.
  it('accepts a genuine clearing edit of a non-pedigree field', async () => {
    const user = await makeUser({});
    const dog = await makeDog({
      ownerId: user.id,
      sireName: 'Old Sire',
      microchipNumber: '981000000000001',
    });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, { dog: { sireName: 'Old Sire', microchipNumber: '' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeUndefined();

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.microchipNumber).toBeNull();
    expect(saved?.sireName).toBe('Old Sire');
  });

  // Michael 2026-09-11: cleared the sire name on Edit Dog and it saved.
  // dogs.update has refused to clear sire/dam/breeder/colour since e2c852ec
  // ("require the pedigree the catalogue prints, at every way in"), but the
  // dog form autosaves those same columns through THIS route while you type,
  // so the blank lands in the DB before Save is ever pressed — and the
  // catalogue loses the pedigree. Autosave must honour the same rule.
  it('refuses to clear a pedigree field that was already set (sire)', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id, sireName: 'Old Sire', damName: 'Dam' });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, { dog: { sireName: '', damName: 'Dam' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pedigreeRefused).toEqual(['sireName']);
    expect(body.message).toMatch(/sire/i);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Old Sire');
    expect(saved?.damName).toBe('Dam');
  });

  // This is a keystroke-level autosave: refusing the sire must not cost the
  // exhibitor the breeder town they typed in the same breath.
  it('keeps the rest of the edit when it refuses a pedigree clear', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id, sireName: 'Old Sire', damName: 'Old Dam' });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, {
        dog: { sireName: '', damName: 'Old Dam', breederCity: 'Perth' },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Old Sire');
    expect(saved?.breederCity).toBe('Perth');
  });

  it('refuses every pedigree field cleared at once, naming each', async () => {
    const user = await makeUser({});
    const dog = await makeDog({
      ownerId: user.id,
      sireName: 'Old Sire',
      damName: 'Old Dam',
      breederName: 'Old Breeder',
    });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, { dog: { sireName: '', damName: '', breederName: '', breederCity: 'Perth' } }),
      params(dog.id),
    );
    const body = await res.json();
    expect(body.pedigreeRefused).toEqual(['sireName', 'damName', 'breederName']);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Old Sire');
    expect(saved?.damName).toBe('Old Dam');
    expect(saved?.breederName).toBe('Old Breeder');
  });

  // The rule blocks LOSING content, never adding it — Mandy repairs old
  // records that predate the requirement, and must not be locked out.
  it('still lets a blank pedigree field be filled in', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id, sireName: null, damName: 'Dam' });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, { dog: { sireName: 'Newly Known Sire', damName: 'Dam' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pedigreeRefused).toBeUndefined();

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Newly Known Sire');
  });

  it('400s an invalid payload shape', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);
    const res = await dogAutosavePOST(
      req(dog.id, { svProfile: { hipGrade: 'not-a-grade' } }),
      params(dog.id),
    );
    expect(res.status).toBe(400);
  });
});

/**
 * Other Qualifications and the wipe guard (2026-08-19).
 *
 * `svGroupHasContent` originally ignored booleans entirely, so a dog whose
 * ONLY SV data was its BH / AD / WB ticks looked empty on BOTH sides of the
 * guard — an unhydrated blank payload sailed straight through and erased them.
 */
describe('POST /api/dog-autosave/[dogId] — other qualifications', () => {
  it('saves the ticks and the free-text Other', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);

    const res = await dogAutosavePOST(
      req(dog.id, {
        svProfile: { bh: true, ad: true, wb: true, otherQualifications: 'BRG GM' },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.bh).toBe(true);
    expect(profile?.ad).toBe(true);
    expect(profile?.wb).toBe(true);
    expect(profile?.otherQualifications).toBe('BRG GM');
  });

  it('refuses a blank payload against a profile holding ONLY ticks', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);

    // This dog has no hips, no elbows, no working title — just the ticks.
    await dogAutosavePOST(
      req(dog.id, { svProfile: { bh: true, ad: true, wb: true } }),
      params(dog.id),
    );

    // The unhydrated card's defaults, now including the unticked boxes.
    const res = await dogAutosavePOST(
      req(dog.id, {
        svProfile: {
          hipGrade: 'not_required',
          elbowGrade: 'not_required',
          haemophiliaClear: 'not_required',
          dmTest: 'not_required',
          koerung: null,
          dna: null,
          workingTitle: null,
          bh: false,
          ad: false,
          wb: false,
          otherQualifications: null,
        },
      }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toContain('svProfile');

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.bh).toBe(true);
    expect(profile?.ad).toBe(true);
    expect(profile?.wb).toBe(true);
  });

  it('still lets the owner genuinely untick one while others remain', async () => {
    const user = await makeUser({});
    const dog = await makeDog({ ownerId: user.id });
    authedAs(user);

    await dogAutosavePOST(
      req(dog.id, { svProfile: { bh: true, ad: true, wb: true } }),
      params(dog.id),
    );

    const res = await dogAutosavePOST(
      req(dog.id, { svProfile: { bh: true, ad: true, wb: false } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).skipped ?? []).not.toContain('svProfile');

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.wb).toBe(false);
    expect(profile?.bh).toBe(true);
  });
});

/**
 * Admin "view as" (impersonation), 2026-08-23.
 *
 * Every tRPC call on the dog page runs through a context that swaps in the
 * impersonated user, so an admin viewing an exhibitor's dog loads it perfectly.
 * This route is a PLAIN route — it never saw that context and used the admin's
 * own id, so `dogAccessCondition` said "not your dog" and every autosave 403'd
 * behind "Couldn't save — check your connection". Mandy hit it adding a working
 * title to someone else's dog; it affected every self-saving section.
 */
describe('POST /api/dog-autosave/[dogId] — admin viewing as another user', () => {
  it('saves against the impersonated owner, not the admin', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const admin = await makeUser({ role: 'admin' });
    const dog = await makeDog({ ownerId: owner.id });
    authedAs(admin);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(owner.id);

    const res = await dogAutosavePOST(
      req(dog.id, { svProfile: { workingTitle: 'IGP2' } }),
      params(dog.id),
    );
    expect(res.status).toBe(200);

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.workingTitle).toBe('IGP2');
  });

  it('does NOT let a non-admin impersonate by sending the cookie', async () => {
    // getImpersonatedUserId only reads a cookie — it authorises nothing. The
    // admin check has to live here, or anyone sending that cookie by hand
    // could write to any dog they named.
    const owner = await makeUser({ role: 'exhibitor' });
    const attacker = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    authedAs(attacker);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(owner.id);

    const res = await dogAutosavePOST(
      req(dog.id, { svProfile: { workingTitle: 'IGP3' } }),
      params(dog.id),
    );
    expect(res.status).toBe(403);

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.workingTitle ?? null).toBeNull();
  });

  it('still works normally for an admin who is not viewing as anyone', async () => {
    const admin = await makeUser({ role: 'admin' });
    const ownDog = await makeDog({ ownerId: admin.id });
    authedAs(admin);
    vi.mocked(getImpersonatedUserId).mockResolvedValue(null);

    const res = await dogAutosavePOST(
      req(ownDog.id, { svProfile: { workingTitle: 'HGH' } }),
      params(ownDog.id),
    );
    expect(res.status).toBe(200);
  });
});
