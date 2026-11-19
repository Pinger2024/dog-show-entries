/**
 * lib/schedule-defaults.ts — where a new show's schedule starts from — and the
 * guard that keeps it the one owner (CLAUDE.md, "One owner per rule").
 * Mandy, Telegram 8329 / 8334, 19 Nov 2026.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHOW_TYPE_SCHEDULE_FIELDS,
  pickScheduleSources,
  previousScheduleDefaults,
  sameScheduleKind,
  scheduleDefaultsNote,
} from '@/lib/schedule-defaults';

describe('which fields follow the show type', () => {
  it('is the awards wording and the list of awards, and not the prize money', () => {
    expect([...SHOW_TYPE_SCHEDULE_FIELDS]).toEqual(['awardsDescription', 'bestAwards']);
  });
});

describe('sameScheduleKind', () => {
  it('needs the show type and the ruleset to match', () => {
    expect(sameScheduleKind({ showType: 'open', showRuleset: 'rkc' }, { showType: 'open', showRuleset: 'rkc' })).toBe(true);
    expect(sameScheduleKind({ showType: 'open', showRuleset: 'rkc' }, { showType: 'premier_open', showRuleset: 'rkc' })).toBe(false);
    // a regional is stored as a championship show under the wusv ruleset
    expect(sameScheduleKind({ showType: 'championship', showRuleset: 'rkc' }, { showType: 'championship', showRuleset: 'wusv' })).toBe(false);
  });
});

describe('pickScheduleSources', () => {
  const champ = { id: 'champ', showType: 'championship', showRuleset: 'rkc' };
  const open = { id: 'open', showType: 'open', showRuleset: 'rkc' };

  it('takes the newest show as the latest and the newest of the same type', () => {
    expect(pickScheduleSources({ showType: 'championship', showRuleset: 'rkc' }, [open, champ])).toEqual({ latest: open, sameType: champ });
  });

  it('has no same-type source when the club has never run that type', () => {
    expect(pickScheduleSources({ showType: 'limited', showRuleset: 'rkc' }, [open, champ])).toEqual({ latest: open, sameType: null });
  });

  it('is null for a club with no earlier schedule', () => {
    expect(pickScheduleSources({ showType: 'open', showRuleset: 'rkc' }, [])).toBeNull();
  });
});

describe('previousScheduleDefaults', () => {
  const latest = { awardsDescription: 'Open wording', bestAwards: ['Best in Show'], prizeMoney: '£10', catering: 'Burger van' };

  it('takes the type fields from the same-type show and the rest from the latest', () => {
    expect(previousScheduleDefaults(latest, { awardsDescription: 'Champ wording', bestAwards: ['Dog Challenge Certificate'], prizeMoney: '£50', catering: 'Old caterer' })).toEqual({
      awardsDescription: 'Champ wording',
      bestAwards: ['Dog Challenge Certificate'],
      prizeMoney: '£10',
      catering: 'Burger van',
    });
  });

  it('copies the latest show unchanged when there is no same-type show', () => {
    expect(previousScheduleDefaults(latest, null)).toEqual(latest);
  });

  it('leaves a type field empty when the same-type show left it empty', () => {
    expect(previousScheduleDefaults(latest, { catering: 'Old caterer' })).toEqual({ prizeMoney: '£10', catering: 'Burger van' });
  });

  it('does not change the shows it was given', () => {
    const l = structuredClone(latest);
    previousScheduleDefaults(l, { awardsDescription: 'Champ wording' });
    expect(l).toEqual(latest);
  });
});

describe('scheduleDefaultsNote', () => {
  // Mandy chose this wording (Telegram 8344–8346): the first version named
  // two long show names and confused her.
  it('one source: copied from the last show', () => {
    expect(scheduleDefaultsNote({ awardsFromAnotherShow: false, showType: 'open', showRuleset: 'rkc' })).toBe(
      "We've copied this from your last show to save you typing. Please check each section.",
    );
  });

  it('the Awards from another show: says which kind of show, in plain words', () => {
    expect(scheduleDefaultsNote({ awardsFromAnotherShow: true, showType: 'championship', showRuleset: 'rkc' })).toBe(
      "We've copied this from your earlier shows to save you typing. The Awards section is from your last championship show. Everything else is from your most recent show. Please check each section.",
    );
  });

  it('names a regional as a regional, not a championship show', () => {
    expect(scheduleDefaultsNote({ awardsFromAnotherShow: true, showType: 'championship', showRuleset: 'wusv' })).toContain(
      'from your last regional show.',
    );
  });
});

describe('guard: one owner for where a new show\'s schedule starts from', () => {
  const SRC = join(process.cwd(), 'src');
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'node_modules') continue;
        sourceFiles(full, acc);
      } else if (/\.tsx?$/.test(name)) acc.push(full);
    }
    return acc;
  }
  const files = sourceFiles(SRC);
  const rel = (f: string) => f.slice(SRC.length + 1);
  const containing = (needle: string) => files.filter((f) => readFileSync(f, 'utf8').includes(needle)).map(rel).sort();

  it('the rule is declared in lib/schedule-defaults.ts only', () => {
    expect(containing('export const SHOW_TYPE_SCHEDULE_FIELDS')).toEqual(['lib/schedule-defaults.ts']);
    expect(containing('export function sameScheduleKind')).toEqual(['lib/schedule-defaults.ts']);
  });

  it('the one path that hands a new show its starting schedule goes through the owner', () => {
    const secretary = readFileSync(join(SRC, 'server/trpc/routers/secretary.ts'), 'utf8');
    const start = secretary.indexOf('getPreviousScheduleData: secretaryProcedure');
    const body = secretary.slice(start, secretary.indexOf('\n    }),', start));
    expect(body).toContain('pickScheduleSources(');
    expect(body).toContain('previousScheduleDefaults(');
    // no hand-rolled same-type filter beside the owner
    expect(body).not.toMatch(/eq\(shows\.showType/);
    // and it is the only server procedure that copies an earlier show's schedule
    expect(containing('getPreviousScheduleData')).toEqual([
      'app/(secretary)/secretary/shows/[id]/_components/schedule-settings-form.tsx',
      'server/trpc/routers/secretary.ts',
    ]);
  });
});
