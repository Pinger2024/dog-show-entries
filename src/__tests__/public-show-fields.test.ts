import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { toPublicScheduleData } from '@/server/trpc/public-show-fields';

describe('toPublicScheduleData', () => {
  it('keeps everything except guarantor addresses', () => {
    const out = toPublicScheduleData({
      catering: 'Tea',
      guarantors: [{ name: 'Jane', address: '1 Home St' }],
    });
    expect(out).toEqual({ catering: 'Tea', guarantors: [{ name: 'Jane' }] });
    expect(toPublicScheduleData(null)).toBeNull();
  });
});

/**
 * Guard (bug hunt 2026-09-22): a show row embedded in a non-club router's
 * payload must be column-scoped (SHOW_COLUMNS_FOR_PUBLIC_INCLUDE), and the two
 * public show readers must sanitise scheduleData.
 */
describe('public show payloads — one owner guard', () => {
  const ROUTERS = join(__dirname, '../server/trpc/routers');
  // Club-scoped routers: every procedure verifies the caller administers the show.
  const CLUB_SCOPED = new Set(['secretary.ts', 'dev.ts']);
  const isClubScoped = (f: string) => CLUB_SCOPED.has(f) || f.startsWith('admin');

  it('no unscoped show include outside club-scoped routers', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ROUTERS).filter((x) => x.endsWith('.ts') && !isClubScoped(x))) {
      const src = readFileSync(join(ROUTERS, f), 'utf8');
      const re = /\bshow:\s*(true|\{\s*with:)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) offenders.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
    expect(offenders).toEqual([]);
  });

  it('shows.list and shows.getById sanitise scheduleData', () => {
    const src = readFileSync(join(ROUTERS, 'shows.ts'), 'utf8');
    expect(src).toMatch(/scheduleData: toPublicScheduleData\(item\.scheduleData\)/);
    expect(src).toMatch(/isPrivileged \? show\.scheduleData : toPublicScheduleData\(show\.scheduleData\)/);
  });
});

describe('secretary dog search — owner columns guard', () => {
  it('searchDogs scopes the owner include to dogSearchOwnerColumns', () => {
    const src = readFileSync(join(__dirname, '../server/trpc/routers/secretary.ts'), 'utf8');
    const block = src.slice(src.indexOf('searchDogs: secretaryProcedure'), src.indexOf('searchDogs: secretaryProcedure') + 900);
    expect(block).toMatch(/owners: \{ columns: dogSearchOwnerColumns/);
  });
});
