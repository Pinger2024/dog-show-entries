import { describe, it, expect } from 'vitest';
import { ownerNameProblem, ownerNameIssue, splitJointOwnerName } from '@/lib/owner-name';

// Mandy, 3 Nov 2026 (Telegram 8175/8178): two people typed into one owner's
// name box, and addresses typed into the name, are refused until sorted.
// The rule is narrow on purpose — a real name must never be refused.

describe('ownerNameProblem', () => {
  it.each([
    'Jane Smith',
    "Mary-Jane O'Brien",
    'Alexander Anderson', // "and" inside a word
    'Sandy Andrews',
    'Mrs J Close', // street words are real surnames
    'Dr Ruth Lane',
    'Ronnie Curran',
    'Mr & Mrs D Smith', // a joint title on one name prints as a unit
    'Mr and Mrs Smith',
  ])('accepts a real name: %s', (name) => {
    expect(ownerNameProblem(name)).toBeNull();
  });

  it.each([
    'John & Jane Smith',
    'John and Jane Smith',
    'JOHN AND JANE SMITH',
    'J&J Smith',
    'John + Jane Smith',
    'John/Jane Smith',
  ])('spots two people in one box: %s', (name) => {
    expect(ownerNameProblem(name)).toBe('two_people');
  });

  it.each([
    'Jane Smith 12 High Street',
    'Jane Smith, Lanark',
    'ML11 8ET',
    '35 Moncrieff Terrace',
    'John & Jane Smith, 12 High St', // the address comes out first
  ])('spots an address in the name: %s', (name) => {
    expect(ownerNameProblem(name)).toBe('address');
  });

  it('leaves an empty box to the "required" rule', () => {
    expect(ownerNameProblem('')).toBeNull();
    expect(ownerNameProblem('   ')).toBeNull();
  });
});

describe('ownerNameIssue — the words people read', () => {
  it('points a dog owner at the joint-owner button, and an account holder at their dog', () => {
    expect(ownerNameIssue('John & Jane Smith', 'owner')).toMatch(/Make it two owners/);
    expect(ownerNameIssue('John & Jane Smith', 'account')).toMatch(/add a joint owner when you add your dog/i);
    expect(ownerNameIssue('Jane Smith, Lanark')).toMatch(/address has its own box/i);
    expect(ownerNameIssue('Jane Smith')).toBeNull();
  });
});

describe('splitJointOwnerName — the one-tap "Make it two owners"', () => {
  it.each([
    ['John & Jane Smith', ['John Smith', 'Jane Smith']],
    ['John and Jane Smith', ['John Smith', 'Jane Smith']],
    ['John Smith and Jane Brown', ['John Smith', 'Jane Brown']],
    ['Andy & Ann Johnstone', ['Andy Johnstone', 'Ann Johnstone']],
  ] as const)('%s → %j', (name, expected) => {
    expect(splitJointOwnerName(name)).toEqual(expected);
  });

  it('only splits exactly two people', () => {
    expect(splitJointOwnerName('Jane Smith')).toBeNull();
    expect(splitJointOwnerName('Ann & Bob & Cat Smith')).toBeNull();
    expect(splitJointOwnerName('John & Jane Smith, 12 High St')).toBeNull();
  });
});
