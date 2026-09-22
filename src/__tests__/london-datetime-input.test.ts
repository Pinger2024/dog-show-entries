import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import {
  toLondonDateTimeInput,
  fromLondonDateTimeInput,
  parseLondonDateTimeInput,
  closeInputForPickedDate,
  closeInputDate,
  closeInputTime,
} from '@/lib/date-utils';
import { isCloseDateWithinFloor, checkCloseInput, entryCloseFloorMessage } from '@/lib/entry-close-rules';
import { createShowSchema, newShowDatesPayload } from '@/app/(secretary)/secretary/shows/new/page';

/**
 * Entry close / postal close are stored as instants (timestamptz). The
 * secretary edits them as a UK wall-clock date + time ("23:59 on 16 August").
 *
 * Bug (found 2026-09-22): the Edit-show-details dialog and the setup wizard
 * filled their date/time boxes with `toISOString().slice(0, 16)` — the UTC
 * wall clock — and on Save parsed that text back with `new Date(text)`, which
 * reads it in the BROWSER's zone. In British Summer Time a 23:59 close showed
 * as 22:59 and every Save (even one that only fixed the vet's phone number)
 * moved the close an hour earlier; a 00:00 close became 23:00 the day before,
 * so the schedule printed the close date a day early and checkout turned
 * exhibitors away in the last hour.
 *
 * One owner now: `toLondonDateTimeInput` (instant → form value) and
 * `fromLondonDateTimeInput` (form value → instant) in src/lib/date-utils.ts,
 * both pinned to Europe/London whatever zone the browser is in. These tests
 * switch `process.env.TZ` to simulate the browser (Node honours a runtime
 * change) and restore it afterwards — vitest runs every file in one fork, so
 * a leaked TZ would change other files' results.
 */

/** Stored instant → what the form shows → what Save sends back. */
function roundTrip(iso: string): string {
  return fromLondonDateTimeInput(toLondonDateTimeInput(iso));
}

// Europe/London is where the bug bit (a UK secretary in BST). UTC is the
// server/CI zone. Europe/Berlin: Mandy works from Germany in Sieger week.
// America/New_York and Pacific/Auckland: far enough out that any leftover
// browser-zone reading changes the calendar DATE, not just the hour.
// (Value = getTimezoneOffset() on 18 July 2026, to prove the switch took.)
const BROWSER_ZONES: Record<string, number> = {
  'Europe/London': -60,
  UTC: 0,
  'Europe/Berlin': -120,
  'America/New_York': 240,
  'Pacific/Auckland': -720,
};

/**
 * Runs `check` once per simulated browser zone, restoring the original TZ
 * afterwards even on failure. One `it` per behaviour (not per zone) because
 * the global setup cleans the DB before every test — each extra `it` costs
 * about a second on every run of the suite.
 */
function inEachBrowserZone(check: (tz: string) => void) {
  const original = process.env.TZ;
  try {
    for (const [tz, julyOffset] of Object.entries(BROWSER_ZONES)) {
      process.env.TZ = tz;
      expect(new Date('2026-07-18T12:00:00Z').getTimezoneOffset(), `sanity: ${tz} really in effect`).toBe(julyOffset);
      check(tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

function inZone(tz: string, check: () => void) {
  const original = process.env.TZ;
  try {
    process.env.TZ = tz;
    check();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('show close date/time: stored instant ↔ form value, in every browser zone', () => {
  it('23:59 BST (summer) shows as 23:59 in the form, not the UTC 22:59', () => {
    inEachBrowserZone((tz) => {
      expect(toLondonDateTimeInput('2026-07-18T22:59:00.000Z'), tz).toBe('2026-07-18T23:59');
      // superjson hydrates timestamp columns as Date objects
      expect(toLondonDateTimeInput(new Date('2026-07-18T22:59:00.000Z')), tz).toBe('2026-07-18T23:59');
    });
  });

  it('23:59 BST survives Save unchanged (it used to lose an hour per Save)', () => {
    inEachBrowserZone((tz) => {
      expect(roundTrip('2026-07-18T22:59:00.000Z'), tz).toBe('2026-07-18T22:59:00.000Z');
    });
  });

  it('five Saves in a row leave the close exactly where it was', () => {
    inEachBrowserZone((tz) => {
      let stored = '2026-09-20T22:59:00.000Z'; // 20 Sept 23:59 BST
      for (let i = 0; i < 5; i++) stored = roundTrip(stored);
      expect(stored, tz).toBe('2026-09-20T22:59:00.000Z');
    });
  });

  it('00:00 BST on the close day stays on that day — not 23:00 the day before', () => {
    inEachBrowserZone((tz) => {
      // 18 July 00:00 BST is what the new-show wizard stores for "close 18 July".
      expect(toLondonDateTimeInput('2026-07-17T23:00:00.000Z'), tz).toBe('2026-07-18T00:00');
      expect(roundTrip('2026-07-17T23:00:00.000Z'), tz).toBe('2026-07-17T23:00:00.000Z');
    });
  });

  it('23:59 and 00:00 GMT (winter) also round-trip unchanged', () => {
    inEachBrowserZone((tz) => {
      expect(toLondonDateTimeInput('2026-12-05T23:59:00.000Z'), tz).toBe('2026-12-05T23:59');
      expect(roundTrip('2026-12-05T23:59:00.000Z'), tz).toBe('2026-12-05T23:59:00.000Z');
      expect(toLondonDateTimeInput('2026-12-05T00:00:00.000Z'), tz).toBe('2026-12-05T00:00');
      expect(roundTrip('2026-12-05T00:00:00.000Z'), tz).toBe('2026-12-05T00:00:00.000Z');
    });
  });

  it('a time the secretary types is read as UK time', () => {
    inEachBrowserZone((tz) => {
      expect(fromLondonDateTimeInput('2026-08-16T23:59'), tz).toBe('2026-08-16T22:59:00.000Z'); // BST
      expect(fromLondonDateTimeInput('2026-11-14T17:00'), tz).toBe('2026-11-14T17:00:00.000Z'); // GMT
      expect(fromLondonDateTimeInput('2026-08-16T23:59:30'), tz).toBe('2026-08-16T22:59:30.000Z'); // a time box with seconds
    });
  });

  it('a date on its own means 00:00 UK time on that date (new-show wizard)', () => {
    inEachBrowserZone((tz) => {
      expect(fromLondonDateTimeInput('2026-07-18'), tz).toBe('2026-07-17T23:00:00.000Z');
      expect(fromLondonDateTimeInput('2026-12-05'), tz).toBe('2026-12-05T00:00:00.000Z');
    });
  });

  it('the 13-day floor judges the UK date the secretary picked, whatever the browser zone', () => {
    inEachBrowserZone((tz) => {
      // Show on Sat 29 Aug 2026 → latest close is Sun 16 Aug. 23:59 on the
      // 16th is allowed; 00:00 on the 17th is not.
      expect(isCloseDateWithinFloor(fromLondonDateTimeInput('2026-08-16T23:59'), '2026-08-29'), tz).toBe(true);
      expect(isCloseDateWithinFloor(fromLondonDateTimeInput('2026-08-17T00:00'), '2026-08-29'), tz).toBe(false);
    });
  });
});

describe('UK clock-change edges (Europe/London rules, independent of the browser)', () => {
  it('spring forward (29 Mar 2026, 01:00→02:00): the missing 01:30 moves forward to 02:30 BST', () => {
    inZone('America/New_York', () => {
      expect(fromLondonDateTimeInput('2026-03-29T00:59')).toBe('2026-03-29T00:59:00.000Z');
      expect(fromLondonDateTimeInput('2026-03-29T01:30')).toBe('2026-03-29T01:30:00.000Z');
      expect(toLondonDateTimeInput('2026-03-29T01:30:00.000Z')).toBe('2026-03-29T02:30');
      expect(fromLondonDateTimeInput('2026-03-29T02:00')).toBe('2026-03-29T01:00:00.000Z');
    });
  });

  it('fall back (25 Oct 2026, 02:00→01:00): the doubled 01:30 takes the first (BST) one', () => {
    inZone('America/New_York', () => {
      expect(fromLondonDateTimeInput('2026-10-25T00:59')).toBe('2026-10-24T23:59:00.000Z');
      expect(fromLondonDateTimeInput('2026-10-25T01:30')).toBe('2026-10-25T00:30:00.000Z');
      expect(fromLondonDateTimeInput('2026-10-25T02:00')).toBe('2026-10-25T02:00:00.000Z');
      expect(roundTrip('2026-10-24T22:59:00.000Z')).toBe('2026-10-24T22:59:00.000Z'); // 23:59 BST the night before
      expect(roundTrip('2026-10-25T23:59:00.000Z')).toBe('2026-10-25T23:59:00.000Z'); // 23:59 GMT that night
    });
  });

  it('refuses a value that is not a date or date+time, rather than saving a wrong instant', () => {
    expect(() => fromLondonDateTimeInput('')).toThrow();
    expect(() => fromLondonDateTimeInput('16/08/2026 23:59')).toThrow();
    expect(() => fromLondonDateTimeInput('2026-02-30T12:00')).toThrow();
    expect(() => fromLondonDateTimeInput('2026-08-16T24:30')).toThrow();
    expect(() => toLondonDateTimeInput('not a date')).toThrow();
  });
});

// ── A picked close date means 23:59 UK time on that date ─────────────────────
//
// Founder rule (commit 44ffeaad, 2026-07-23): "whatever date they choose, it's
// 11:59pm unless they specifically change it". The edit forms wrote that rule
// by hand seven times; the new-show wizard didn't follow it at all and stored
// 00:00 — entries closed at the START of the last day the schedule advertised.

describe('a picked close date means 23:59 UK time (one owner)', () => {
  it('the form value for a picked date is 23:59 on that date, unless a time is given', () => {
    expect(closeInputForPickedDate('2026-08-16')).toBe('2026-08-16T23:59');
    expect(closeInputForPickedDate('2026-08-16', '17:00')).toBe('2026-08-16T17:00');
    expect(closeInputForPickedDate('2026-08-16', '')).toBe('2026-08-16T23:59'); // time box cleared
    expect(closeInputDate('2026-08-16T17:00')).toBe('2026-08-16');
    expect(closeInputTime('2026-08-16T17:00')).toBe('17:00');
    expect(closeInputTime('')).toBe('23:59'); // what the empty (disabled) time box pre-shows
  });

  it('new show: a picked close date is sent as 23:59 UK — 22:59Z in summer, 23:59Z in winter', () => {
    inEachBrowserZone((tz) => {
      expect(
        newShowDatesPayload({ entriesOpenDate: '2026-07-01', entryCloseDate: '2026-08-16', postalCloseDate: '2026-08-09' }),
        tz,
      ).toEqual({
        entriesOpenDate: '2026-06-30T23:00:00.000Z', // entries OPEN at the start of the day — 00:00 BST
        entryCloseDate: '2026-08-16T22:59:00.000Z', // 23:59 BST
        postalCloseDate: '2026-08-09T22:59:00.000Z', // 23:59 BST
      });
      expect(newShowDatesPayload({ entriesOpenDate: '', entryCloseDate: '2026-12-05', postalCloseDate: '' }), tz).toEqual({
        entriesOpenDate: undefined,
        entryCloseDate: '2026-12-05T23:59:00.000Z', // 23:59 GMT
        postalCloseDate: undefined,
      });
    });
  });

  it('new show: the close the wizard sends is exactly what the edit dialog then shows (23:59 on the picked date)', () => {
    inEachBrowserZone((tz) => {
      const { entryCloseDate } = newShowDatesPayload({ entriesOpenDate: '', entryCloseDate: '2026-08-16', postalCloseDate: '' });
      expect(toLondonDateTimeInput(entryCloseDate!), tz).toBe('2026-08-16T23:59');
    });
  });
});

// ── Half-typed or odd values never throw in a check reachable while typing ──
//
// A desktop date box can hold a 5- or 6-digit year while the secretary is
// typing (Chrome allows up to 275760), and passes through 0002, 0020, 0202 on
// the way to 2026. Save may refuse such a value; a check that runs on every
// keystroke or in the form's validation must never throw.

const SHOW_29_AUG = '2026-08-29'; // latest close: Sun 16 Aug

const NEW_SHOW_BASE = {
  name: 'Test Championship Show',
  showType: 'championship',
  showScope: 'single_breed',
  organisationId: '00000000-0000-4000-8000-000000000001',
  startDate: SHOW_29_AUG,
  endDate: SHOW_29_AUG,
};

describe('close-date checks while typing: "not valid yet", never a throw', () => {
  it('parseLondonDateTimeInput returns null for a value that is not a complete real date', () => {
    expect(parseLondonDateTimeInput('20266-08-16T23:59')).toBeNull(); // 5-digit year
    expect(parseLondonDateTimeInput('202660-08-16')).toBeNull(); // 6-digit year
    expect(parseLondonDateTimeInput('2026-02-30T23:59')).toBeNull();
    expect(parseLondonDateTimeInput('')).toBeNull();
    expect(parseLondonDateTimeInput('2026-08-16T23:59')).toBe('2026-08-16T22:59:00.000Z');
  });

  it('a year typed digit by digit (0002, 0020, 0202) is a real, if silly, date — not a crash', () => {
    for (const v of ['0002-08-16T23:59', '0020-08-16T23:59', '0202-08-16T23:59']) {
      expect(() => parseLondonDateTimeInput(v), v).not.toThrow();
      const iso = parseLondonDateTimeInput(v);
      expect(iso, v).not.toBeNull();
      expect(toLondonDateTimeInput(iso!), v).toBe(v); // and it round-trips
    }
  });

  it('checkCloseInput: a half-typed value is "incomplete" (no throw); a good one passes with its instant; a late one names the floor', () => {
    expect(checkCloseInput('20266-08-16T23:59', SHOW_29_AUG, 'entry close date')).toMatchObject({
      ok: false,
      reason: 'incomplete',
    });
    expect(checkCloseInput('20266-08-16T23:59', '', 'entry close date')).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(checkCloseInput('', SHOW_29_AUG, 'entry close date')).toEqual({ ok: true, instant: null });
    expect(checkCloseInput('2026-08-16T23:59', SHOW_29_AUG, 'entry close date')).toEqual({
      ok: true,
      instant: '2026-08-16T22:59:00.000Z',
    });
    expect(checkCloseInput('2026-08-17T23:59', SHOW_29_AUG, 'postal close date')).toEqual({
      ok: false,
      reason: 'too-late',
      message: entryCloseFloorMessage(SHOW_29_AUG, 'postal close date'),
    });
  });

  it('new show validation: a 5-digit-year close date is a validation error on that field, not a crash', () => {
    for (const field of ['entryCloseDate', 'postalCloseDate'] as const) {
      let result: ReturnType<typeof createShowSchema.safeParse> | undefined;
      expect(() => {
        result = createShowSchema.safeParse({ ...NEW_SHOW_BASE, [field]: '20266-08-16' });
      }, field).not.toThrow();
      expect(result?.success, field).toBe(false);
      expect(result?.error?.issues.map((i) => i.path.join('.')), field).toContain(field);
    }
  });

  it('new show validation: 16 Aug passes, 17 Aug is past the 13-day floor', () => {
    expect(createShowSchema.safeParse({ ...NEW_SHOW_BASE, entryCloseDate: '2026-08-16' }).success).toBe(true);
    const late = createShowSchema.safeParse({ ...NEW_SHOW_BASE, entryCloseDate: '2026-08-17' });
    expect(late.success).toBe(false);
    expect(late.error?.issues.find((i) => i.path.join('.') === 'entryCloseDate')?.message).toBe(
      entryCloseFloorMessage(SHOW_29_AUG, 'entry close date'),
    );
  });
});

// ── Guard: one owner for "instant ↔ UK wall-clock form value" ───────────────

const SRC = join(__dirname, '..');
const OWNER = 'lib/date-utils.ts';

/** The forms a secretary uses to set a show's close / open dates. */
const SHOW_DATE_FORMS = [
  'app/(secretary)/secretary/shows/[id]/page.tsx', // Edit show details dialog
  'app/(secretary)/secretary/shows/[id]/_components/setup-wizard.tsx', // setup wizard Details step
  'app/(secretary)/secretary/shows/new/page.tsx', // new-show wizard (create)
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (abs: string) => relative(SRC, abs).split(sep).join('/');

describe('guard: show date/time forms go through the London owner', () => {
  it('no code outside date-utils slices an ISO string to a 16-char "form" wall clock (that is UTC, not UK time)', () => {
    const utcSlice = /to(?:ISOString|JSON)\(\)\s*\.\s*(?:slice|substring|substr)\(\s*0\s*,\s*16\s*\)/;
    const offenders = walk(SRC)
      .filter((f) => rel(f) !== OWNER)
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${rel(f)}:${i + 1}` }))
          .filter(({ line }) => utcSlice.test(line))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      );
    expect(offenders, 'use toLondonDateTimeInput() from @/lib/date-utils').toEqual([]);
  });

  it('no raw T23:59 outside date-utils — "a picked close date means 23:59" has one owner', () => {
    // Seed data holds fixed demo instants ('2026-04-18T23:59:00Z'), not the rule.
    const allowed = new Set([OWNER, 'server/db/seed.ts']);
    const offenders = walk(SRC)
      .filter((f) => !allowed.has(rel(f)))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${rel(f)}:${i + 1}` }))
          .filter(({ line }) => /T23:59/.test(line))
          .map(({ at, line }) => `${at}  ${line.trim()}`),
      );
    expect(offenders, 'use closeInputForPickedDate() from @/lib/date-utils').toEqual([]);
  });

  it.each(SHOW_DATE_FORMS)('%s converts show dates only through the owners', (file) => {
    const src = readFileSync(join(SRC, file), 'utf8');
    const lines = src.split('\n').map((line, i) => ({ line, at: `${file}:${i + 1}  ${line.trim()}` }));
    const hits = (re: RegExp) => lines.filter(({ line }) => re.test(line)).map(({ at }) => at);

    // Never builds a show-date instant itself — `new Date(formText)` reads the
    // BROWSER's zone. The owners do it.
    expect(hits(/\.toISOString\(/), 'use fromLondonDateTimeInput / checkCloseInput().instant').toEqual([]);

    // The 23:59 default is the owner's, not a literal in the form.
    expect(hits(/['"`]23:59['"`]/), 'use closeInputForPickedDate / closeInputTime').toEqual([]);

    // The 13-day floor (and "is this a real date yet?") goes through
    // checkCloseInput — never isCloseDateWithinFloor on raw form text.
    expect(hits(/isCloseDateWithinFloor\(/), 'use checkCloseInput()').toEqual([]);
    expect(src).toMatch(/\bcheckCloseInput\(/);

    if (file.endsWith('shows/new/page.tsx')) {
      // Both picked close dates become 23:59 UK before they are sent.
      expect(src).toMatch(/fromLondonDateTimeInput\(\s*closeInputForPickedDate\(\s*values\.entryCloseDate\s*\)\s*\)/);
      expect(src).toMatch(/fromLondonDateTimeInput\(\s*closeInputForPickedDate\(\s*values\.postalCloseDate\s*\)\s*\)/);
    } else {
      // The edit forms fill their close date/time boxes from the owner.
      expect(src).toMatch(/toLondonDateTimeInput\(\s*show\.entryCloseDate\s*\)/);
      expect(src).toMatch(/toLondonDateTimeInput\(\s*show\.postalCloseDate\s*\)/);
    }
  });
});
