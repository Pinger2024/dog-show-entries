/**
 * Mandy, 30 Sept 2026 (bug-hunt question 11): grading cards print the show's
 * name, and Midland's is just "Regional Show" — print the club name too, "but
 * not duplicate the name so if midlands Gsd group added midlands to the show
 * name I wouldn't want it showing as midlands Gsd group and midlands regional
 * show". She approved these exact outputs (Telegram, 30 Sept 11:46).
 */
import { describe, it, expect } from 'vitest';
import { makeOrg, makeShow } from '../helpers/factories';
import { testDb } from '../helpers/db';
import { loadGradingCardsData } from '@/server/services/grading-cards-data';
import { displayShowTitle, showNameWithClub } from '@/lib/show-types';

describe('grading cards — club name with the show name, never repeated', () => {
  it.each([
    ['Midlands Region GSD Group', 'Regional Show', 'Midlands Region GSD Group Regional Show'],
    ['North East GSD Regional Group', 'North East GSD Regional Group', 'North East GSD Regional Group'],
    ['Midlands GSD Group', 'Midlands Regional Show', 'Midlands GSD Group Regional Show'],
    ['GSD League of Great Britain British Regional Groups', 'Winter Spectacular 2026', 'GSD League of Great Britain British Regional Groups Winter Spectacular 2026'],
  ])('%s + %s → %s', (club, show, expected) => {
    expect(showNameWithClub(show, club)).toBe(expected);
  });

  it('a show name that already holds the whole club name prints as it is', () => {
    expect(showNameWithClub('2026 North East GSD Regional Group Open Show', 'North East GSD Regional Group')).toBe(
      '2026 North East GSD Regional Group Open Show',
    );
  });

  it('only LEADING repeats are dropped — "of" in the middle of a show name stays', () => {
    expect(showNameWithClub('Festival of Champions', 'GSD Club of Scotland')).toBe('GSD Club of Scotland Festival of Champions');
  });

  it('the grading cards print it', async () => {
    const org = await makeOrg({ name: 'Midlands Region GSD Group' });
    const show = await makeShow({ organisationId: org.id, name: 'Regional Show', showRuleset: 'wusv' });
    const load = await loadGradingCardsData(testDb, show.id);
    expect(load!.info.showName).toBe('Midlands Region GSD Group Regional Show');
  });
});

/**
 * Mandy, 30 Sept 2026 pm, looking at the printed card: club + show on the
 * judge's half is "a bit wordy … where they have only stated regional show as
 * the show name, the club name is added to the front of that". The heading on
 * the details half keeps the club's name (above); the judge's Show line is the
 * show's own name, with the club in front only for a bare "Regional Show" —
 * the same rule the secretary's show list already uses for "Open Show" etc.
 */
describe("grading cards — the judge's Show line: the show's own name, club only for a bare type name", () => {
  it.each([
    ['Midlands Region GSD Group', 'Regional Show', 'Midlands Region GSD Group Regional Show'],
    ['Midlands Region GSD Group', 'regional  show 2026', 'Midlands Region GSD Group regional  show 2026'],
    ['North East GSD Regional Group', 'North East GSD Regional Group', 'North East GSD Regional Group'],
    ['GSD League of Great Britain British Regional Groups', 'Winter Spectacular 2026', 'Winter Spectacular 2026'],
    ['Midland Regional GSD Group', 'Mock SV Catalogue Show', 'Mock SV Catalogue Show'],
    ['GSD Club of Scotland', 'Open Show', 'GSD Club of Scotland Open Show'],
  ])('%s + %s → %s', (club, show, expected) => {
    expect(displayShowTitle(show, club)).toBe(expected);
  });

  it('the grading cards print the heading with the club, the Show line without', async () => {
    const org = await makeOrg({ name: 'Midland Regional GSD Group' });
    const show = await makeShow({ organisationId: org.id, name: 'Mock SV Catalogue Show', showRuleset: 'wusv' });
    const load = await loadGradingCardsData(testDb, show.id);
    expect(load!.info.showName).toBe('Midland Regional GSD Group Mock SV Catalogue Show');
    expect(load!.info.showLine).toBe('Mock SV Catalogue Show');
  });
});
