/**
 * Venue text is tidied once, where it is written.
 *
 * WHY THIS EXISTS. The GSD Breed Council site started reading `/api/shows` on
 * 1 Nov 2026 and immediately reported that Remi's venue text was untidy. It
 * was right, and the dirt was on production, on half the live shows:
 *
 *   'Langley Burrell Village Hall '                           trailing space
 *   'Outpaw Pursuits, '                                       trailing comma
 *   'St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham,'   trailing comma
 *   'Welfare Ground, Murton, Seaham, County Durham '           trailing space
 *
 * None of that was typed on purpose — it is what a line looks like when
 * someone stops halfway and saves. It matters because venue name and address
 * are not an internal field: they print on the club's RKC schedule, they are
 * on the public show page, and they now go out through the feed. A comma with
 * nothing after it on a club's schedule is the kind of thing Mandy spots.
 *
 * The fix had to be at the write, not the render. Venue text is printed in
 * six or more places; tidying it at each one is the same rule written down six
 * times, which is the failure this codebase keeps paying for. So
 * `tidyTypedText` owns the rule and `createVenue` — the only path that ever
 * writes venue text — applies it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { venues } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg } from '../helpers/factories';
import { tidyTypedText } from '@/lib/typed-text';
import { PROJECT_ROOT, scanFiles } from '../helpers/static-scan';

describe('tidyTypedText', () => {
  it('cleans every shape of dirt actually found on production', () => {
    expect(tidyTypedText('Langley Burrell Village Hall ')).toBe('Langley Burrell Village Hall');
    expect(tidyTypedText('Outpaw Pursuits, ')).toBe('Outpaw Pursuits');
    expect(tidyTypedText('St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham,')).toBe(
      'St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham',
    );
    expect(tidyTypedText('Welfare Ground, Murton, Seaham, County Durham ')).toBe(
      'Welfare Ground, Murton, Seaham, County Durham',
    );
  });

  it('keeps the punctuation that separates one thing from another', () => {
    // Only a TRAILING comma is residue. Every internal one is doing a job.
    expect(tidyTypedText('Welfare Ground, Murton, Seaham')).toBe('Welfare Ground, Murton, Seaham');
  });

  it('collapses a pasted line break, which is how the double spaces get in', () => {
    expect(tidyTypedText('Monteith Park,\n  50 Carstairs Road')).toBe(
      'Monteith Park, 50 Carstairs Road',
    );
    expect(tidyTypedText('South Western GSD   55th')).toBe('South Western GSD 55th');
  });

  it('leaves text that is already clean exactly alone', () => {
    expect(tidyTypedText('Tuppenhurst Farm')).toBe('Tuppenhurst Farm');
    expect(tidyTypedText('WS15 4HJ')).toBe('WS15 4HJ');
  });
});

describe('secretary.createVenue — the one place venue text is written', () => {
  it('stores the tidied text, not what was typed', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);

    const created = await caller.secretary.createVenue({
      organisationId: org.id,
      name: 'Outpaw Pursuits, ',
      address: 'St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham,',
      postcode: 'TS29  6BT ',
    });

    // Tidied before it ever reaches the row, so every renderer is clean
    // without knowing this rule exists.
    const stored = await testDb.query.venues.findFirst({ where: eq(venues.id, created.id) });
    expect(stored?.name).toBe('Outpaw Pursuits');
    expect(stored?.address).toBe('St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham');
    expect(stored?.postcode).toBe('TS29 6BT');
  });

  it('refuses a name that is nothing but whitespace', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    // `min(1)` used to pass this, because it saw the spaces. Tidying first is
    // what turns it into the empty string it really is.
    await expect(
      createTestCaller(user).secretary.createVenue({ organisationId: org.id, name: '   ' }),
    ).rejects.toThrow();
  });
});

describe('venue text — one owner', () => {
  it('nothing writes venue text without going through the tidier', () => {
    // If a second write path appears, it will almost certainly store raw text
    // and the dirt comes straight back. This is the test that notices.
    const writers = scanFiles(['src'], ['.ts', '.tsx'], /\.insert\(venues\)/).filter(
      (m) => !m.file.startsWith('src/__tests__'),
    );
    expect(writers.map((m) => m.file)).toEqual(['src/server/trpc/routers/secretary.ts']);

    const router = fs.readFileSync(
      path.resolve(PROJECT_ROOT, 'src/server/trpc/routers/secretary.ts'),
      'utf-8',
    );
    expect(router).toMatch(/tidyTypedText/);
  });
});
