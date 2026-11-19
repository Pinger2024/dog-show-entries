import { describe, it, expect } from 'vitest';
import { buildExhibitorIndexRows } from '@/components/catalogue/catalogue-front-matter';

// Sarah Hill, South Western 2026-08-12: her entries had "withhold from
// publication" ticked and the exhibitor index dropped her ENTIRELY, so the
// RKC-bound catalogue was missing an exhibitor. Mandy's ruling: withholding
// protects the ADDRESS — the name and catalogue numbers must still appear
// (same rule the ringside index and redactWithheldOwnerAddresses already
// followed).
const owner = (name: string, address: string) => [{ title: null, name, address, userId: null }];

function entry(over: Record<string, unknown>) {
  return {
    exhibitor: 'Fallback Exhibitor',
    exhibitorId: 'u1',
    catalogueNumber: '1',
    owners: [],
    classes: [{ classLabel: '1', classNumber: 1, name: 'Puppy' }],
    withholdFromPublication: false,
    breed: null,
    ...over,
  } as never;
}

describe('buildExhibitorIndexRows — withheld exhibitors', () => {
  it('keeps a withheld exhibitor in the index: name + numbers, no address', () => {
    const rows = buildExhibitorIndexRows([
      entry({
        catalogueNumber: '17',
        owners: owner('Sarh Hill', '30 Spring Close'),
        withholdFromPublication: true,
      }),
      entry({
        catalogueNumber: '84',
        exhibitor: 'Sarah Hill',
        owners: [],
        withholdFromPublication: true,
      }),
      entry({
        catalogueNumber: '55',
        owners: owner('Sandra Hall', '75 Denton Road'),
      }),
    ]);

    const hill = rows.find((r) => r.name.startsWith('HILL'));
    expect(hill).toBeDefined();
    expect(hill!.catNos).toContain('17');
    expect(hill!.address).toBeUndefined();

    const hall = rows.find((r) => r.name.startsWith('HALL'));
    expect(hall!.address).toBe('75 Denton Road');
  });

  it('one withheld entry hides the address even if a sibling entry is not flagged', () => {
    const rows = buildExhibitorIndexRows([
      entry({ catalogueNumber: '2', owners: owner('Jane Smith', '1 Secret Lane') }),
      entry({ catalogueNumber: '3', owners: owner('Jane Smith', '1 Secret Lane'), withholdFromPublication: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.catNos).toEqual(['2', '3']);
    expect(rows[0]!.address).toBeUndefined();
  });

  // Mandy 2026-08-17: particle surnames ("De Zutter") are one unit — the
  // catalogue printed "ZUTTER, H" and filed it under Z instead of D.
  it('particle surname "De Zutter" prints as one unit and files under D', () => {
    const rows = buildExhibitorIndexRows([
      entry({ catalogueNumber: '9', owners: owner('Hugh De Zutter', '1 Kennel Lane') }),
      entry({ catalogueNumber: '10', owners: owner('Sandra Hall', '75 Denton Road') }),
    ]);
    const deZutter = rows.find((r) => r.name.startsWith('DE ZUTTER'));
    expect(deZutter).toBeDefined();
    expect(deZutter!.name).toBe('DE ZUTTER, H');
    expect(deZutter!.sortKey).toBe('de zutter');
    // Sorted rows: "de zutter" < "hall" alphabetically, so De Zutter leads.
    expect(rows[0]!.name).toBe('DE ZUTTER, H');
  });
});
