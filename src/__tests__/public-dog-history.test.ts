import { describe, it, expect } from 'vitest';
import {
  publicDogHistory,
  publicHistoryCounts,
  hasPublicHistory,
  isShowOver,
} from '@/lib/public-dog-history';

/**
 * What anyone but the dog's owner may see of its show history (Mandy,
 * 1 Oct 2026): "we should never show a dog and what its upcoming shows are,
 * only shows that are in the past, have been judged".
 *
 * The fixture is Rosebud Edie of Hundark's shape on 1 Oct 2026 — judged at
 * South Western (a published 1st with a critique), entered at Midlands
 * (4 Oct) and North Eastern (11 Oct). Her link preview said "6 shows
 * entered" with four past.
 */
const TODAY = '2026-10-01';
const published = new Date('2026-08-10T12:00:00Z');

const show = (startDate: string, endDate = startDate) => ({ startDate, endDate });
const result = (placement: number | null, publishedAt: Date | null, specialAward: string | null = null) => ({
  placement,
  specialAward,
  publishedAt,
});

const southWestern = { show: show('2026-08-09'), entryClasses: [{ result: result(1, published, 'Best Bitch') }] };
const midlands = { show: show('2026-10-04'), entryClasses: [{ result: null }] };
const northEastern = { show: show('2026-10-11'), entryClasses: [{ result: null }, { result: null }] };

const pub = { viewerIsOwner: false, today: TODAY };
const owner = { viewerIsOwner: true, today: TODAY };

describe('public dog history — upcoming entries', () => {
  it("never shows an upcoming show to anyone but the owner (Rosebud Edie's shape)", () => {
    const visible = publicDogHistory([southWestern, midlands, northEastern], pub);
    expect(visible.map((e) => e.show.startDate)).toEqual(['2026-08-09']);
  });

  it('the owner still sees their own upcoming entries', () => {
    expect(publicDogHistory([southWestern, midlands, northEastern], owner)).toHaveLength(3);
  });

  it('a not-for-competition entry (no classes) shows to the owner, never to the public', () => {
    const nfcUpcoming = { show: show('2026-10-04'), entryClasses: [] as Array<{ result: null }> };
    const nfcPast = { show: show('2026-08-09'), entryClasses: [] as Array<{ result: null }> };
    expect(publicDogHistory([nfcUpcoming, nfcPast], owner)).toHaveLength(2);
    expect(publicDogHistory([nfcUpcoming, nfcPast], pub)).toHaveLength(0);
  });

  it('counts for the link preview and share image leave upcoming entries out', () => {
    expect(publicHistoryCounts([southWestern, midlands, northEastern], TODAY)).toEqual({
      shows: 1,
      firsts: 1,
      specialAwards: 1,
      critiques: 0,
    });
  });

  it('a dog whose only entries are upcoming has nothing public (kept out of the sitemap)', () => {
    expect(hasPublicHistory([midlands, northEastern], TODAY)).toBe(false);
    expect(hasPublicHistory([southWestern, midlands], TODAY)).toBe(true);
  });
});

describe('public dog history — show day and publication', () => {
  it('on the day of the show, an entry stays hidden until its result is published', () => {
    const onTheDay = { show: show(TODAY), entryClasses: [{ result: null }] };
    expect(publicDogHistory([onTheDay], pub)).toHaveLength(0);

    const judgedNotPublished = { show: show(TODAY), entryClasses: [{ result: result(2, null) }] };
    expect(publicDogHistory([judgedNotPublished], pub)).toHaveLength(0);

    const judgedAndPublished = { show: show(TODAY), entryClasses: [{ result: result(2, published) }] };
    expect(publicDogHistory([judgedAndPublished], pub)[0]!.entryClasses[0]!.result?.placement).toBe(2);
  });

  it('after the show, a placing that is not yet published stays hidden — never "entered, unplaced"', () => {
    const wonButUnpublished = { show: show('2026-09-20'), entryClasses: [{ result: result(1, null) }] };
    expect(publicDogHistory([wonButUnpublished], pub)).toHaveLength(0);
    expect(publicHistoryCounts([wonButUnpublished], TODAY).firsts).toBe(0);
  });

  it('after the show, a class the dog was not placed in shows as unplaced', () => {
    const unplaced = { show: show('2026-09-20'), entryClasses: [{ result: null }] };
    const visible = publicDogHistory([unplaced], pub);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.entryClasses[0]!.result).toBeNull();
  });

  it('a show with one class published and one not shows only the published class', () => {
    const mixed = {
      show: show(TODAY),
      entryClasses: [{ result: result(1, published) }, { result: result(3, null) }],
    };
    const visible = publicDogHistory([mixed], pub);
    expect(visible[0]!.entryClasses).toHaveLength(1);
    expect(visible[0]!.entryClasses[0]!.result?.placement).toBe(1);
  });

  it('the owner sees an unpublished placing straight away', () => {
    const judgedNotPublished = { show: show(TODAY), entryClasses: [{ result: result(2, null) }] };
    expect(publicDogHistory([judgedNotPublished], owner)[0]!.entryClasses[0]!.result?.placement).toBe(2);
  });

  it('a multi-day show is over only after its last day', () => {
    expect(isShowOver(show('2026-09-30', TODAY), TODAY)).toBe(false);
    expect(isShowOver(show('2026-09-29', '2026-09-30'), TODAY)).toBe(true);
  });
});
