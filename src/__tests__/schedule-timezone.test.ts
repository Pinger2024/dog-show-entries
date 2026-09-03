/**
 * Document dates must be Europe/London, never the process's own timezone.
 *
 * Production runs in UTC (Render). shows.entries_open_date /
 * entry_close_date are `timestamptz` columns that store a UK wall-clock
 * instant (e.g. 2026-04-26T23:00:00Z = 27 April 00:00 BST). Formatting
 * those with `toLocaleDateString`/`new Intl.DateTimeFormat` and no
 * explicit `timeZone` picks up whatever zone the *process* happens to be
 * running in — on the live UTC server that silently prints the day
 * BEFORE the real UK date. Confirmed live 2026-09-03: BAGSD's real
 * schedule printed "26 April 2026 / 18 June 2026" instead of the correct
 * "27 April 2026 / 19 June 2026".
 *
 * `process.env.TZ = 'UTC'` here (before any Date use) reproduces the
 * production server's timezone inside this test regardless of the
 * machine running it — see also `TZ=UTC` passed on the command line for
 * the same effect at the process level.
 */
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { db } from '@/server/db';
import { cleanDb } from './helpers/db';
import { loadShowFixture } from './helpers/show-fixture';
import { renderAllDocuments } from './golden/lib/render-documents';
import type { ShowFixture } from '../../scripts/lib/export-show-fixture-core';

function pdfToText(buffer: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'schedule-tz-'));
  const pdfPath = path.join(dir, 'doc.pdf');
  writeFileSync(pdfPath, buffer);
  return execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8');
}

describe('schedule dates are Europe/London, not process-local (TZ=UTC repro)', () => {
  beforeAll(async () => {
    expect(new Date().getTimezoneOffset()).toBe(0); // sanity: really running as UTC
    await cleanDb();
  });

  it('BAGSD: entries open/close print the correct UK dates (27 April / 19 June 2026), not the UTC-shifted ones', async () => {
    const fixturePath = path.join(__dirname, 'golden', 'fixtures', 'bagsd-champ-2026.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ShowFixture;
    const { showId } = await loadShowFixture(db, fixture);

    const rendered = await renderAllDocuments(showId, fixture);
    const schedule = rendered.find((d) => d.name === 'schedule');
    if (!schedule) throw new Error('schedule document was not rendered');

    const text = pdfToText(schedule.buffer);

    // entriesOpenDate = 2026-04-26T23:00:00Z = 27 April 00:00 BST
    expect(text).toContain('27 April 2026');
    expect(text).not.toContain('26 April 2026');

    // entryCloseDate = 2026-06-18T23:00:00Z = 19 June 00:00 BST
    expect(text).toContain('19 June 2026');
    expect(text).not.toContain('18 June 2026');
  });
});
