/**
 * The schedule cover is ONE A5 page, and everything on it stays on it.
 *
 * Mandy, 3 Nov 2026 (Telegram 8170), the GSD Club of Scotland 2027 open show:
 * once the venue was set, the cover — venue, two judges each "(subject to
 * RKC approval)", secretary, vet, first aider, show manager, the docking
 * statement and two notices — no longer fitted. React-PDF quietly carried
 * the last notice onto a near-blank second page, so the schedule grew a page
 * (16 → 17, which also breaks an A5 booklet's page count).
 *
 * The fix: renderScheduleWithFit renders the cover on its own first and, if
 * it runs past one page, renders the schedule with the compact cover. The
 * docking statement is required ON THE FRONT COVER (F(1)7.c(2)), so moving
 * things off the cover is not the answer.
 *
 * These render for real — the bug is layout, not data assembly.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { db } from '@/server/db';
import { shows, venues, judgeAssignments, organisations } from '@/server/db/schema';
import { cleanDb } from '../helpers/db';
import { loadShowFixture } from '../helpers/show-fixture';
import { renderScheduleDocument } from '../golden/lib/render-documents';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

function pageText(buffer: Buffer, page: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'schedule-cover-'));
  const pdfPath = path.join(dir, 'doc.pdf');
  writeFileSync(pdfPath, buffer);
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-']).toString('utf8');
}

// A 400×300 PNG: the cover sizes a club logo into a 140×80pt box, so this
// takes the same 80pt of height the Scotland club's real logo does.
const CLUB_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1XKVAAAC+ElEQVR42u3UQQ0AAAjEsFOCEkTgXw06IE2qYI+lpgFOiASAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBRiWCoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFGJYKgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhAYYlAWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBhqUCYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBny3S41m6u/0WPAAAAABJRU5ErkJggg==';

const NOTICES = [
  'Only undocked dogs and legally docked dogs may be entered',
  'OUTSIDE ATTRACTION',
  'NO WET WEATHER ACCOMMODATION IS PROVIDED',
];

async function loadScotland(): Promise<string> {
  const fixturePath = path.join(__dirname, '..', 'golden', 'fixtures', 'gsd-scotland-champ-2026.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ShowFixture;
  const { showId } = await loadShowFixture(db, fixture);
  return showId;
}

describe('schedule cover — everything on the cover stays on page 1', () => {
  beforeAll(async () => {
    await cleanDb();
  });

  it('a cover as full as the live Scotland 2027 open show still fits on one page', async () => {
    const showId = await loadScotland();
    const show = (await db.query.shows.findFirst({ where: eq(shows.id, showId) }))!;

    // What the live show carries on its cover (Mandy's screenshot, 3 Nov).
    await db.update(venues)
      .set({ name: 'Sidewood Canine Services', address: 'Blackhill Road, Forth, Lanark', postcode: 'ML11 8ET' })
      .where(eq(venues.id, show.venueId!));
    await db.update(shows).set({
      name: 'GSD CLUB OF SCOTLAND Single Breed Open Show',
      showType: 'open',
      status: 'published',
      onCallVet: 'Clyde Vet Group, Accord Road, Lanark, ML11 9GA',
      secretaryName: 'Maxine Cowan',
      secretaryAddress: '35 Moncrieff Terrace, Lanark, ML11 3HL',
      secretaryPhone: '0374858563737',
      secretaryEmail: 'secretary@example.com',
      scheduleData: {
        ...(show.scheduleData ?? {}),
        outsideAttraction: true,
        wetWeatherAccommodation: false,
        firstAiders: ['Alexxa Cowan'],
        showManager: 'Ronnie Curran',
      },
    }).where(eq(shows.id, showId));
    await db.update(judgeAssignments).set({ subjectToRkcApproval: true }).where(eq(judgeAssignments.showId, showId));
    await db.update(organisations).set({ logoUrl: CLUB_LOGO }).where(eq(organisations.id, show.organisationId));

    const { buffer } = await renderScheduleDocument(showId);
    const cover = pageText(buffer, 1);
    const next = pageText(buffer, 2);

    for (const notice of NOTICES) {
      expect(cover, `"${notice}" should be on the cover`).toContain(notice);
      expect(next, `"${notice}" spilled onto page 2`).not.toContain(notice);
    }
    // Page 2 is the schedule proper, not a spill page.
    expect(next.trim().length).toBeGreaterThan(200);
  });
});
