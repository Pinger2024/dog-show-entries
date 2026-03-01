import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDateRange,
  poundsToPence,
  penceToPounds,
  penceToPoundsString,
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
    expect(formatCurrency(100000)).toBe('£1000.00');
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
