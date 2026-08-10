import { describe, it, expect } from 'vitest';
import {
  registrationFlagSuffix,
  appendRegistrationFlags,
} from '@/lib/registration-flags';

describe('registrationFlagSuffix', () => {
  it('is empty when nothing is set', () => {
    expect(registrationFlagSuffix({})).toBe('');
    expect(registrationFlagSuffix({ naf: false, taf: false, cnaf: false })).toBe('');
  });

  it('is empty for null/undefined', () => {
    expect(registrationFlagSuffix(null)).toBe('');
    expect(registrationFlagSuffix(undefined)).toBe('');
  });

  it('renders each flag on its own with a leading space', () => {
    expect(registrationFlagSuffix({ naf: true })).toBe(' NAF');
    expect(registrationFlagSuffix({ taf: true })).toBe(' TAF');
    expect(registrationFlagSuffix({ cnaf: true })).toBe(' CNAF');
  });

  it('renders combinations in the fixed order NAF, TAF, CNAF', () => {
    expect(registrationFlagSuffix({ naf: true, taf: true })).toBe(' NAF TAF');
    expect(registrationFlagSuffix({ taf: true, cnaf: true })).toBe(' TAF CNAF');
    expect(registrationFlagSuffix({ naf: true, cnaf: true })).toBe(' NAF CNAF');
    expect(registrationFlagSuffix({ naf: true, taf: true, cnaf: true })).toBe(' NAF TAF CNAF');
  });

  it('ignores null flag values (the DB shape) rather than printing them', () => {
    expect(registrationFlagSuffix({ naf: true, taf: null, cnaf: null })).toBe(' NAF');
  });
});

describe('appendRegistrationFlags', () => {
  it('leaves an unflagged name byte-identical — no trailing space', () => {
    expect(appendRegistrationFlags('HAUSMULLER ELLIE', {})).toBe('HAUSMULLER ELLIE');
    expect(appendRegistrationFlags('HAUSMULLER ELLIE', null)).toBe('HAUSMULLER ELLIE');
  });

  it('appends the flags after the name', () => {
    expect(appendRegistrationFlags('HAUSMULLER ELLIE', { naf: true, taf: true })).toBe(
      'HAUSMULLER ELLIE NAF TAF'
    );
  });

  it('works with a title-prefixed name', () => {
    expect(appendRegistrationFlags('Ch. DONABERG DOYEN', { taf: true })).toBe(
      'Ch. DONABERG DOYEN TAF'
    );
  });

  it('passes a null name straight through (catalogue row with no dog)', () => {
    expect(appendRegistrationFlags(null, { naf: true })).toBeNull();
    expect(appendRegistrationFlags(undefined, { naf: true })).toBeNull();
  });

  it('does not turn an empty name into a bare flag', () => {
    expect(appendRegistrationFlags('', { naf: true })).toBe('');
  });
});

// ── ATC (Authority to Compete) — overseas dogs, Mandy 2026-08-10 ────────
// Granted rather than pending, so it carries a NUMBER rather than being a
// tick; the number itself already starts with "ATC".
describe('ATC number', () => {
  it('prints the number after any flags', () => {
    expect(registrationFlagSuffix({ atcNumber: 'ATC01234SWE' })).toBe(' ATC01234SWE');
    expect(registrationFlagSuffix({ taf: true, atcNumber: 'ATC01234SWE' })).toBe(
      ' TAF ATC01234SWE'
    );
  });

  it('adds the ATC prefix when the exhibitor typed only the digits', () => {
    expect(registrationFlagSuffix({ atcNumber: '01234SWE' })).toBe(' ATC01234SWE');
  });

  it('normalises case and stray spaces', () => {
    expect(registrationFlagSuffix({ atcNumber: ' atc01234swe ' })).toBe(' ATC01234SWE');
  });

  it('ignores an empty or whitespace-only number', () => {
    expect(registrationFlagSuffix({ atcNumber: '' })).toBe('');
    expect(registrationFlagSuffix({ atcNumber: '   ' })).toBe('');
    expect(registrationFlagSuffix({ atcNumber: null })).toBe('');
  });

  it('appends to a dog name alongside the other flags', () => {
    expect(
      appendRegistrationFlags('SOME OVERSEAS DOG', { naf: true, atcNumber: 'ATC9999NOR' })
    ).toBe('SOME OVERSEAS DOG NAF ATC9999NOR');
  });
});
