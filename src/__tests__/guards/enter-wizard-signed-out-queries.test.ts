import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The entry wizard is reachable signed out (extras without a dog, slice 2).
 * Every query that needs a session (dogs.*, entries.*, users.*) must carry a
 * `signedIn` / 'authenticated' condition in `enabled`, or a signed-out visitor
 * fires UNAUTHORIZED calls. A new protected query added without the gate fails here.
 */
describe('enter wizard: protected queries are gated on a signed-in session', () => {
  const file = path.join(__dirname, '../../app/(shows)/shows/[id]/enter/page.tsx');
  const src = fs.readFileSync(file, 'utf8');
  const re = /trpc\.(dogs|entries|users)\.(\w+)\.useQuery\(/g;
  const found: { name: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const end = src.indexOf(');', m.index);
    found.push({ name: `${m[1]}.${m[2]}`, body: src.slice(m.index, end) });
  }

  it('finds the protected queries it is meant to police', () => {
    const names = found.map((f) => f.name);
    for (const n of ['dogs.list', 'dogs.getSvProfile', 'dogs.getWinSummary', 'dogs.checkLimitedShowEligibility',
      'entries.validateExhibitorForEntry', 'entries.regionalPriorDogCount', 'entries.packagePriorStanding']) {
      expect(names).toContain(n);
    }
  });

  for (const q of found) {
    it(`${q.name} is enabled only when signed in`, () => {
      expect(q.body).toMatch(/enabled:[^}]*(signedIn|'authenticated')/);
    });
  }
});
