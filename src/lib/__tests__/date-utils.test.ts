import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDateRange,
  poundsToPence,
  penceToPounds,
  penceToPoundsString,
  isAgeEligibleOnShowDay,
  getAgeEligibilityDetail,
  getCompetitionAgeError,
} from '../date-utils';

describe('formatCurrency', () => {
  it('formats pence as GBP', () => {
    expect(formatCurrency(500)).toBe('£5.00');
    expect(formatCurrency(2500)).toBe('£25.00');
    expect(formatCurrency(0)).toBe('£0.00');
    expect(formatCurrency(1)).toBe('£0.01');
    expect(formatCurrency(99)).toBe('£0.99');
    expect(formatCurrency(100)).toBe('£1.00');
    expect(formatCurrency(150)).toBe('£1.50');
  });

  it('handles large values', () => {
    expect(formatCurrency(100000)).toBe('£1,000.00');
  });

  it('handles negative values (refunds)', () => {
    expect(formatCurrency(-500)).toBe('£-5.00');
  });
});

describe('poundsToPence', () => {
  it('converts whole pounds to pence', () => {
    expect(poundsToPence(1)).toBe(100);
    expect(poundsToPence(5)).toBe(500);
    expect(poundsToPence(25)).toBe(2500);
    expect(poundsToPence(0)).toBe(0);
  });

  it('converts fractional pounds to pence', () => {
    expect(poundsToPence(1.5)).toBe(150);
    expect(poundsToPence(1.99)).toBe(199);
    expect(poundsToPence(0.01)).toBe(1);
    expect(poundsToPence(0.5)).toBe(50);
    expect(poundsToPence(10.25)).toBe(1025);
  });

  it('rounds to avoid floating-point precision issues', () => {
    // 1.1 + 2.2 = 3.3000000000000003 in JS
    expect(poundsToPence(3.3)).toBe(330);
    // 0.1 + 0.2 = 0.30000000000000004
    expect(poundsToPence(0.3)).toBe(30);
    expect(poundsToPence(19.99)).toBe(1999);
  });

  it('handles the exact bug scenario: £1.00 should be 100 pence, not 1', () => {
    // This was Amanda's bug: she entered 1.00 and got 1 pence (£0.01)
    expect(poundsToPence(1.0)).toBe(100);
    expect(poundsToPence(Number('1.00'))).toBe(100);
    expect(poundsToPence(parseFloat('1.00'))).toBe(100);
  });

  it('handles string-to-number conversion edge cases', () => {
    // Simulating form input values
    expect(poundsToPence(Number('5.00'))).toBe(500);
    expect(poundsToPence(Number('0'))).toBe(0);
    expect(poundsToPence(Number('25'))).toBe(2500);
    expect(poundsToPence(Number('3.50'))).toBe(350);
  });
});

describe('penceToPounds', () => {
  it('converts pence to pounds', () => {
    expect(penceToPounds(100)).toBe(1);
    expect(penceToPounds(500)).toBe(5);
    expect(penceToPounds(2500)).toBe(25);
    expect(penceToPounds(0)).toBe(0);
    expect(penceToPounds(150)).toBe(1.5);
    expect(penceToPounds(1)).toBe(0.01);
    expect(penceToPounds(99)).toBe(0.99);
  });
});

describe('penceToPoundsString', () => {
  it('formats pence as a pounds string for form inputs', () => {
    expect(penceToPoundsString(500)).toBe('5.00');
    expect(penceToPoundsString(2500)).toBe('25.00');
    expect(penceToPoundsString(0)).toBe('0.00');
    expect(penceToPoundsString(1)).toBe('0.01');
    expect(penceToPoundsString(150)).toBe('1.50');
    expect(penceToPoundsString(99)).toBe('0.99');
  });
});

describe('poundsToPence and penceToPounds roundtrip', () => {
  it('converts back and forth without loss', () => {
    const amounts = [0, 1, 50, 99, 100, 150, 199, 500, 999, 1000, 2500, 9999];
    for (const pence of amounts) {
      expect(poundsToPence(penceToPounds(pence))).toBe(pence);
    }
  });
});

describe('formatDateRange', () => {
  it('formats a single day', () => {
    expect(formatDateRange('2025-05-15', '2025-05-15')).toBe('15 May 2025');
  });

  it('formats same month range', () => {
    expect(formatDateRange('2025-05-15', '2025-05-17')).toBe('15–17 May 2025');
  });

  it('formats cross-month range same year', () => {
    expect(formatDateRange('2025-04-30', '2025-05-02')).toBe(
      '30 Apr – 2 May 2025'
    );
  });

  it('formats cross-year range', () => {
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe(
      '30 Dec 2025 – 2 Jan 2026'
    );
  });
});

describe('isAgeEligibleOnShowDay', () => {
  // RKC Puppy = "of six and not exceeding twelve calendar months". The
  // tricky case Amanda flagged 2026-05-28: a dog whose 1st birthday IS
  // the show day should still count as a puppy.
  it('includes a dog whose 1st birthday lands on show day in Puppy (6–12)', () => {
    expect(isAgeEligibleOnShowDay('2025-07-04', '2026-07-04', 6, 12)).toBe(true);
  });

  it('excludes a dog who is one day past her 1st birthday from Puppy', () => {
    expect(isAgeEligibleOnShowDay('2025-07-04', '2026-07-05', 6, 12)).toBe(false);
  });

  it('includes a dog who hits 6 months exactly on show day in Puppy', () => {
    expect(isAgeEligibleOnShowDay('2026-01-04', '2026-07-04', 6, 12)).toBe(true);
  });

  it('excludes a dog who is one day under 6 months from Puppy', () => {
    expect(isAgeEligibleOnShowDay('2026-01-05', '2026-07-04', 6, 12)).toBe(false);
  });

  it('includes a 12-month-old in Junior (6–18) and Yearling (12–24)', () => {
    expect(isAgeEligibleOnShowDay('2025-07-04', '2026-07-04', 6, 18)).toBe(true);
    expect(isAgeEligibleOnShowDay('2025-07-04', '2026-07-04', 12, 24)).toBe(true);
  });

  it('treats null bounds as open-ended', () => {
    expect(isAgeEligibleOnShowDay('2018-01-01', '2026-07-04', null, null)).toBe(true);
    expect(isAgeEligibleOnShowDay('2018-01-01', '2026-07-04', 84, null)).toBe(true); // Veteran 7y+
    expect(isAgeEligibleOnShowDay('2022-01-01', '2026-07-04', 84, null)).toBe(false);
  });
});

describe('getAgeEligibilityDetail', () => {
  it('reports eligible with no failedBound when within both bounds', () => {
    expect(getAgeEligibilityDetail('2025-07-04', '2026-07-04', 6, 12)).toEqual({
      eligible: true,
      failedBound: null,
    });
  });

  it('reports failedBound "min" when under the minimum', () => {
    expect(getAgeEligibilityDetail('2026-01-05', '2026-07-04', 6, 12)).toEqual({
      eligible: false,
      failedBound: 'min',
    });
  });

  it('reports failedBound "max" when over the maximum', () => {
    expect(getAgeEligibilityDetail('2025-07-04', '2026-07-05', 6, 12)).toEqual({
      eligible: false,
      failedBound: 'max',
    });
  });

  it('includes a dog whose 1st birthday lands on show day (12-month anniversary edge)', () => {
    // Same edge case as isAgeEligibleOnShowDay above — a dog turning 12
    // months old ON the show day is still eligible for Puppy (6-12).
    expect(getAgeEligibilityDetail('2025-07-04', '2026-07-04', 6, 12)).toEqual({
      eligible: true,
      failedBound: null,
    });
  });

  it('treats null bounds as open-ended (eligible, no failedBound)', () => {
    expect(getAgeEligibilityDetail('2018-01-01', '2026-07-04', null, null)).toEqual({
      eligible: true,
      failedBound: null,
    });
  });

  it('a null min never fails "min" — a too-old dog against only a max bound reports "max"', () => {
    expect(getAgeEligibilityDetail('2022-01-01', '2026-07-04', null, 24)).toEqual({
      eligible: false,
      failedBound: 'max',
    });
  });
});

describe('getCompetitionAgeError', () => {
  const babyPuppy = { name: 'Baby Puppy', type: 'sv_age', minAgeMonths: 4, maxAgeMonths: 6 };
  const openClass = { name: 'Open', type: 'achievement', minAgeMonths: null, maxAgeMonths: null };

  // The bug: a Baby Puppy (4–6 months) legitimately entered into her own class
  // was blocked by the general "must be 6 months for competition" floor and
  // shooed to NFC. Amanda 2026-07-18 — Raubahaus Xaris, born 30 Apr 2026, at
  // the North East Regional on 5 Sept 2026 (4 months and 6 days old).
  it('allows a 4-month-old Baby Puppy into her own class (the Xaris case)', () => {
    expect(
      getCompetitionAgeError({
        dogName: 'Raubahaus Xaris',
        dob: '2026-04-30',
        showDate: '2026-09-05',
        classes: [babyPuppy],
      })
    ).toBeNull();
  });

  it('allows a dog who turns exactly 4 months on show day into Baby Puppy', () => {
    expect(
      getCompetitionAgeError({
        dogName: 'Pup',
        dob: '2026-04-30',
        showDate: '2026-08-30',
        classes: [babyPuppy],
      })
    ).toBeNull();
  });

  it('rejects a dog one day under 4 months for Baby Puppy, suggesting NFC', () => {
    const msg = getCompetitionAgeError({
      dogName: 'Pup',
      dob: '2026-04-30',
      showDate: '2026-08-29',
      classes: [babyPuppy],
    });
    expect(msg).toMatch(/too young for "Baby Puppy"/);
    expect(msg).toMatch(/Not For Competition \(NFC\) instead/);
  });

  it('rejects a dog who has aged out of Baby Puppy (6 months + a day) as too old', () => {
    const msg = getCompetitionAgeError({
      dogName: 'Pup',
      dob: '2026-04-30',
      showDate: '2026-10-31',
      classes: [babyPuppy],
    });
    expect(msg).toMatch(/too old for "Baby Puppy"/);
  });

  it('keeps the six-month floor for ordinary competition classes', () => {
    // 5 months old → below the general floor, not an age class.
    const msg = getCompetitionAgeError({
      dogName: 'Pup',
      dob: '2026-04-01',
      showDate: '2026-09-01',
      classes: [openClass],
    });
    expect(msg).toMatch(/at least 6 months old for competition classes/);
    expect(msg).toMatch(/Not For Competition \(NFC\) instead/);
  });

  it('fully rejects an under-4-month dog entering an ordinary class', () => {
    const msg = getCompetitionAgeError({
      dogName: 'Pup',
      dob: '2026-06-01',
      showDate: '2026-09-01',
      classes: [openClass],
    });
    expect(msg).toMatch(/at least 6 months old to enter competition classes/);
  });

  it('allows an adult into an ordinary competition class', () => {
    expect(
      getCompetitionAgeError({
        dogName: 'Champ',
        dob: '2022-01-01',
        showDate: '2026-09-01',
        classes: [openClass],
      })
    ).toBeNull();
  });

  it('treats an age-type class with no bounds as an ordinary class (6-month floor)', () => {
    // Mirrors the test factories, where a Baby Puppy row may carry no min/max.
    const boundless = { name: 'Baby Puppy', type: 'sv_age', minAgeMonths: null, maxAgeMonths: null };
    expect(
      getCompetitionAgeError({
        dogName: 'Adult',
        dob: '2022-01-01',
        showDate: '2026-09-01',
        classes: [boundless],
      })
    ).toBeNull();
  });

  it('blocks when a dog qualifies for one class but not another entered alongside it', () => {
    // Eligible for Baby Puppy at 4 months, but Open needs six months.
    const msg = getCompetitionAgeError({
      dogName: 'Pup',
      dob: '2026-04-30',
      showDate: '2026-09-05',
      classes: [babyPuppy, openClass],
    });
    expect(msg).toMatch(/at least 6 months old for competition classes/);
  });
});
