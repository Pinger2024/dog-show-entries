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
import { showNameWithClub } from '@/lib/show-types';

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
