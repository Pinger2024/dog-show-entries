import { describe, it, expect } from 'vitest';
import { redactWithheldOwnerAddresses } from '@/lib/catalogue-privacy';
import type { CatalogueEntry } from '@/components/catalogue/catalogue-types';

// Threat guard for bug-hunt #6: the catalogue JSON export (?output=json),
// reachable with exhibitor access on show day, must not leak withheld owners'
// home addresses.
describe('redactWithheldOwnerAddresses', () => {
  it('nulls owner addresses on withheld entries but keeps the name', () => {
    const entries = [
      {
        withholdFromPublication: true,
        owners: [{ title: null, name: 'Jane Smith', address: '1 Secret Lane, AB1 2CD', userId: 'u1' }],
      },
      {
        withholdFromPublication: false,
        owners: [{ title: null, name: 'Bob Jones', address: '2 Public Rd, EF3 4GH', userId: 'u2' }],
      },
    ] as unknown as CatalogueEntry[];

    const out = redactWithheldOwnerAddresses(entries);

    // Withheld entry: address gone, name preserved (matches formatOwnerKC).
    expect(out[0]!.owners[0]!.address).toBeNull();
    expect(out[0]!.owners[0]!.name).toBe('Jane Smith');
    // Non-withheld entry: untouched.
    expect(out[1]!.owners[0]!.address).toBe('2 Public Rd, EF3 4GH');
  });

  it('does not mutate the input array', () => {
    const entries = [
      { withholdFromPublication: true, owners: [{ title: null, name: 'X', address: 'home', userId: null }] },
    ] as unknown as CatalogueEntry[];

    redactWithheldOwnerAddresses(entries);

    expect(entries[0]!.owners[0]!.address).toBe('home');
  });
});
