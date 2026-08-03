import { describe, it, expect } from 'vitest';
import { checkOwnerRecord } from '@/lib/catalogue-data-checks';

describe('checkOwnerRecord', () => {
  it('flags a single-word name', () => {
    expect(checkOwnerRecord({ ownerName: 'Karen', ownerAddress: '1 The Lane' })).toContain(
      'single_word_name'
    );
  });

  it('passes a two-token name', () => {
    expect(checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: '1 The Lane' })).not.toContain(
      'single_word_name'
    );
  });

  it('flags an honorific-only name as single word (no cleverness about initials)', () => {
    expect(checkOwnerRecord({ ownerName: 'Mrs', ownerAddress: '1 The Lane' })).toContain(
      'single_word_name'
    );
  });

  it('passes an initial + surname as two tokens', () => {
    expect(checkOwnerRecord({ ownerName: 'J Smith', ownerAddress: '1 The Lane' })).not.toContain(
      'single_word_name'
    );
  });

  it('flags a missing name', () => {
    const issues = checkOwnerRecord({ ownerName: '', ownerAddress: '1 The Lane' });
    expect(issues).toContain('missing_name');
    expect(issues).not.toContain('single_word_name');
  });

  it('treats a whitespace-only name as missing', () => {
    const issues = checkOwnerRecord({ ownerName: '   ', ownerAddress: '1 The Lane' });
    expect(issues).toContain('missing_name');
  });

  it('treats a null name as missing', () => {
    const issues = checkOwnerRecord({ ownerName: null, ownerAddress: '1 The Lane' });
    expect(issues).toContain('missing_name');
  });

  it('flags a missing address', () => {
    expect(checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: '' })).toContain(
      'missing_address'
    );
  });

  it('treats a null address as missing', () => {
    expect(checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: null })).toContain(
      'missing_address'
    );
  });

  it('flags an address whose first segment reads like a surname', () => {
    expect(
      checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: 'Smith, 4 The Lane, Trowbridge' })
    ).toContain('name_like_address_start');
  });

  it('leaves a two-word house name alone', () => {
    expect(
      checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: 'Rose Cottage, 4 The Lane' })
    ).not.toContain('name_like_address_start');
  });

  it('leaves a house-number-first address alone (digits, no comma)', () => {
    expect(
      checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: '4 The Lane, Trowbridge' })
    ).not.toContain('name_like_address_start');
  });

  it('is case-insensitive and allows apostrophes/hyphens in the surname-like segment', () => {
    expect(
      checkOwnerRecord({ ownerName: 'Mrs Smith', ownerAddress: "o'brien-jones, 4 The Lane" })
    ).toContain('name_like_address_start');
  });

  it('skips missing_address and name_like_address_start when the address is withheld', () => {
    const issues = checkOwnerRecord({
      ownerName: 'Mrs Smith',
      ownerAddress: '',
      addressWithheld: true,
    });
    expect(issues).not.toContain('missing_address');
    expect(issues).not.toContain('name_like_address_start');

    const issues2 = checkOwnerRecord({
      ownerName: 'Mrs Smith',
      ownerAddress: 'Smith, 4 The Lane',
      addressWithheld: true,
    });
    expect(issues2).not.toContain('name_like_address_start');
  });

  it('still flags name issues when the address is withheld — only the address never prints', () => {
    const issues = checkOwnerRecord({
      ownerName: 'Karen',
      ownerAddress: 'Smith, 4 The Lane',
      addressWithheld: true,
    });
    expect(issues).toContain('single_word_name');
    expect(issues).not.toContain('missing_name');
  });

  it('passes a clean record with no issues', () => {
    expect(
      checkOwnerRecord({ ownerName: 'Mrs Karen Smith', ownerAddress: 'Rose Cottage, 4 The Lane' })
    ).toEqual([]);
  });

  // The real-world incident this feature exists for: a first-name-only owner
  // whose surname was typed into the address field instead.
  it('catches the real incident shape: name "Karen", address "Smith, 4 The Lane, Trowbridge"', () => {
    const issues = checkOwnerRecord({
      ownerName: 'Karen',
      ownerAddress: 'Smith, 4 The Lane, Trowbridge',
    });
    expect(issues).toContain('single_word_name');
    expect(issues).toContain('name_like_address_start');
    expect(issues).toHaveLength(2);
  });
});
