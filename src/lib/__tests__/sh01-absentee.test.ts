import { describe, it, expect } from 'vitest';
import { computeSh01Stats, type Sh01EntryInput } from '../sh01-absentee';

const gsd = (sex: 'dog' | 'bitch') => ({ sex, breed: { name: 'German Shepherd Dog' } });
const dogEntry = (dogId: string, sex: 'dog' | 'bitch', absent: boolean, over: Partial<Sh01EntryInput> = {}): Sh01EntryInput =>
  ({ dogId, status: 'confirmed', entryType: 'standard', isNfc: false, absent, dog: gsd(sex), ...over });

const sexClasses = [
  { sex: 'dog', breed: { name: 'German Shepherd Dog' } },
  { sex: 'bitch', breed: { name: 'German Shepherd Dog' } },
];

describe('computeSh01Stats — RKC SH01 counting rules (Mandy 2026-07-07)', () => {
  it('reproduces BAGSD: 27 dogs (10 abs), 58 bitches (23 abs) = 85 / 33, excluding JH, NFC and duplicate entries', () => {
    const entries: Sh01EntryInput[] = [
      ...Array.from({ length: 27 }, (_, i) => dogEntry(`d${i}`, 'dog', i < 10)),
      ...Array.from({ length: 58 }, (_, i) => dogEntry(`b${i}`, 'bitch', i < 23)),
      // must be EXCLUDED:
      { dogId: null, status: 'confirmed', entryType: 'junior_handler', isNfc: false, absent: true, dog: null }, // JH
      dogEntry('nfc1', 'bitch', false, { isNfc: true }),          // NFC
      dogEntry('wd1', 'dog', true, { status: 'withdrawn' }),       // withdrawn
      dogEntry('d0', 'dog', true),                                 // same dog d0 in a 2nd class → counted once
    ];
    const { breeds, totalDogs, totalAbsentees } = computeSh01Stats(entries, sexClasses);
    expect(breeds).toHaveLength(1);
    const row = breeds[0];
    expect(row.breedName).toBe('German Shepherd Dog');
    expect(row.judgedSeparately).toBe(true);
    expect(row.dogs).toBe(27);
    expect(row.absentDogs).toBe(10);
    expect(row.bitches).toBe(58);
    expect(row.absentBitches).toBe(23);
    expect(totalDogs).toBe(85);
    expect(totalAbsentees).toBe(33);
  });

  it('uses the Mixed figure when the breed is judged together (no sex-specific classes)', () => {
    const entries = [dogEntry('d1', 'dog', false), dogEntry('b1', 'bitch', true)];
    const mixedClasses = [{ sex: null, breed: { name: 'German Shepherd Dog' } }];
    const { breeds } = computeSh01Stats(entries, mixedClasses);
    expect(breeds[0].judgedSeparately).toBe(false);
    expect(breeds[0].mixed).toBe(2);
    expect(breeds[0].absentMixed).toBe(1);
  });
});
