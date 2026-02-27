import { describe, it, expect } from 'vitest';
import { formatDateRange, formatCurrency } from '@/lib/date-utils';

describe('formatDateRange', () => {
  it('formats single-day show', () => {
    expect(formatDateRange('2025-05-15', '2025-05-15')).toBe('15 May 2025');
  });

  it('formats same-month range', () => {
    expect(formatDateRange('2025-05-15', '2025-05-17')).toBe(
      '15–17 May 2025'
    );
  });

  it('formats cross-month same-year range', () => {
    expect(formatDateRange('2025-04-30', '2025-05-02')).toBe(
      '30 Apr – 2 May 2025'
    );
  });

  it('formats cross-year range', () => {
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe(
      '30 Dec 2025 – 2 Jan 2026'
    );
  });

  it('formats start of year dates', () => {
    expect(formatDateRange('2025-01-01', '2025-01-01')).toBe('1 Jan 2025');
  });
});

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });

  it('formats pence to pounds', () => {
    expect(formatCurrency(500)).toBe('£5.00');
    expect(formatCurrency(1250)).toBe('£12.50');
    expect(formatCurrency(99)).toBe('£0.99');
  });

  it('formats larger amounts', () => {
    expect(formatCurrency(10000)).toBe('£100.00');
    expect(formatCurrency(150075)).toBe('£1500.75');
  });

  it('handles odd pence', () => {
    expect(formatCurrency(1)).toBe('£0.01');
    expect(formatCurrency(10)).toBe('£0.10');
  });
});
