import { describe, expect, it } from 'vitest';
import { validateRkcSchedule } from '@/lib/rkc-schedule-compliance';

const singleClasses = Array.from({ length: 12 }, (_, index) => ({
  className: index === 11 ? 'Open' : `Class ${index + 1}`,
  classType: 'age',
  breedId: null,
  sex: null,
}));

describe('validateRkcSchedule', () => {
  it('blocks a single-breed schedule below 12 classes', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'single_breed', showRuleset: 'rkc' },
      classes: singleClasses.slice(0, 11),
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'minimum_classes', severity: 'required' }),
    ]));
  });

  it('requires an Open class at a single-breed show', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'single_breed', showRuleset: 'rkc' },
      classes: singleClasses.map((item) => ({ ...item, className: 'Puppy' })),
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'single_breed_open_class' }),
    ]));
  });

  it('does not count Junior Handling or Special Award classes towards the licensed minimum', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'single_breed', showRuleset: 'rkc' },
      classes: [
        ...singleClasses.slice(0, 10),
        { className: 'Junior Handler 6–11', classType: 'junior_handler', breedId: null, sex: null },
        { className: 'Special Award Class - Open', classType: 'special', breedId: null, sex: null },
      ],
    });
    expect(issues.find((issue) => issue.code === 'minimum_classes')?.message).toContain('10');
  });

  it('blocks Baby Puppy classes at multi-breed shows', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'general', showRuleset: 'rkc' },
      classes: [{ className: 'Baby Puppy', classType: 'age', breedId: 'beagle', breedName: 'Beagle', sex: null }],
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'baby_puppy_not_permitted' }),
    ]));
  });

  it('requires Open for every separately classified breed', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'general', showRuleset: 'rkc' },
      classes: [
        { className: 'Open', classType: 'achievement', breedId: 'beagle', breedName: 'Beagle', sex: null },
        { className: 'Puppy', classType: 'age', breedId: 'whippet', breedName: 'Whippet', sex: null },
      ],
    });
    expect(issues.find((issue) => issue.code === 'breed_open_class')?.message).toContain('Whippet');
  });

  it('requires group-labelled AVNSC and AVIBR routes at a group-system show', () => {
    const classes = Array.from({ length: 16 }, (_, index) => ({
      className: index === 15 ? 'Open' : `Class ${index + 1}`,
      classType: 'age',
      breedId: 'beagle',
      breedName: 'Beagle',
      breedGroupName: 'Hound',
      sex: null,
    }));
    const issues = validateRkcSchedule({
      show: { showType: 'open', showScope: 'general', showRuleset: 'rkc', judgedOnGroupSystem: true },
      classes,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'group_avnsc', message: expect.stringContaining('Hound') }),
      expect.objectContaining({ code: 'group_avibr', message: expect.stringContaining('Hound') }),
    ]));
  });

  it('enforces eight classes and Open/Limit for both sexes for CC breeds', () => {
    const issues = validateRkcSchedule({
      show: { showType: 'championship', showScope: 'general', showRuleset: 'rkc' },
      classes: [
        { className: 'Open', classType: 'achievement', breedId: 'beagle', breedName: 'Beagle', sex: 'dog' },
        { className: 'Limit', classType: 'achievement', breedId: 'beagle', breedName: 'Beagle', sex: 'dog' },
      ],
      showBreeds: [{ breedId: 'beagle', breedName: 'Beagle', ccOffered: true }],
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'cc_breed_minimum_classes' }),
      expect.objectContaining({ code: 'cc_breed_open_limit' }),
    ]));
  });

  it('requires every advertised closing date to be at least seven calendar days before the show', () => {
    const issues = validateRkcSchedule({
      show: {
        showType: 'open',
        showScope: 'single_breed',
        showRuleset: 'rkc',
        startDate: '2026-06-01',
        entryCloseDate: '2026-05-26T23:59:00.000Z',
        postalCloseDate: '2026-05-25T23:59:00.000Z',
      },
      classes: singleClasses,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'entry_closing_date',
        message: expect.stringContaining('Online entries close'),
      }),
    ]));
    expect(issues.filter((issue) => issue.code === 'entry_closing_date')).toHaveLength(1);
  });

  it('accepts closing dates on the seventh calendar day before the show', () => {
    const issues = validateRkcSchedule({
      show: {
        showType: 'open',
        showScope: 'single_breed',
        showRuleset: 'rkc',
        startDate: '2026-06-01',
        entryCloseDate: '2026-05-25T23:59:00.000Z',
      },
      classes: singleClasses,
    });
    expect(issues.some((issue) => issue.code === 'entry_closing_date')).toBe(false);
  });

  it('does not apply RKC checks to WUSV shows', () => {
    expect(validateRkcSchedule({
      show: { showType: 'championship', showScope: 'single_breed', showRuleset: 'wusv' },
      classes: [],
    })).toEqual([]);
  });
});
