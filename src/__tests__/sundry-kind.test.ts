import { describe, it, expect } from 'vitest';
import {
  inferSundryKindFromName,
  grantsOnlineCatalogueAccess,
  isCatalogueKind,
  isParkingKind,
  isDonationKind,
  announcesOnlineCatalogue,
  SUNDRY_KINDS,
  SUNDRY_KIND_LABELS,
  ONLINE_CATALOGUE_ACCESS_KINDS,
  CATALOGUE_KINDS,
  type SundryKind,
} from '@/lib/sundry-kind';

// Every sundry name that exists on prod (checked 15 Oct 2026) plus the traps.
const TABLE: Array<[string, SundryKind]> = [
  ['Printed Catalogue', 'printed_catalogue'],
  ['Printed Catalogue + pen', 'printed_catalogue'],
  ['Printed Catalogue - £5 on the day', 'printed_catalogue'],
  ['Online Catalogue', 'online_catalogue'],
  ['Pre Paid Car Parking - BRG Members ONLY', 'parking'],
  ['Pre-paid Parking Pass', 'parking'],
  ['Car Park Pass', 'parking'],
  ['Car Pass', 'parking'],
  ['Advert', 'advert'],
  ['A5 full colour advert', 'advert'],
  ['Colour Advert', 'advert'],
  ['Colour A5 Advert ', 'advert'],
  ['Class Sponsorship', 'sponsorship'],
  ['Class  Sponsorship ', 'sponsorship'],
  ['Special Award Sponsorship', 'sponsorship'],
  ['Sponsorship - Banners', 'sponsorship'],
  ['Customised banner', 'sponsorship'],
  ['Club Membership — Sole', 'membership'],
  ['Club Membership — Joint', 'membership'],
  ['Donation', 'donation'],
  ['Catalogue', 'printed_catalogue'],
  ['Catalogue Advert', 'advert'],
  ['Sparking Wine', 'other'],
  ['Baby Puppy Class', 'other'],
  ['PDF catalogue download', 'online_catalogue'],
  ['E-Catalogue', 'online_catalogue'],
  ['Digital Catalogue', 'online_catalogue'],
];

describe('inferSundryKindFromName', () => {
  it.each(TABLE)('%j -> %s', (name, kind) => {
    expect(inferSundryKindFromName(name)).toBe(kind);
  });
  it('is case-insensitive', () => {
    expect(inferSundryKindFromName('PRINTED CATALOGUE')).toBe('printed_catalogue');
  });
});

describe('kind predicates', () => {
  it('online access is granted by BOTH catalogue kinds (today\'s behaviour) and nothing else', () => {
    for (const k of SUNDRY_KINDS) {
      expect(grantsOnlineCatalogueAccess(k)).toBe(k === 'printed_catalogue' || k === 'online_catalogue');
    }
    expect([...ONLINE_CATALOGUE_ACCESS_KINDS].sort()).toEqual(['online_catalogue', 'printed_catalogue']);
  });
  it('isCatalogueKind / isParkingKind / isDonationKind', () => {
    expect(isCatalogueKind('printed_catalogue')).toBe(true);
    expect(isCatalogueKind('advert')).toBe(false);
    expect(isParkingKind('parking')).toBe(true);
    expect(isParkingKind('other')).toBe(false);
    expect(isDonationKind('donation')).toBe(true);
    expect([...CATALOGUE_KINDS].sort()).toEqual(['online_catalogue', 'printed_catalogue']);
  });
  it('only an online catalogue is announced at purchase time (Mandy 15 Oct)', () => {
    for (const k of SUNDRY_KINDS) expect(announcesOnlineCatalogue(k)).toBe(k === 'online_catalogue');
  });
  it('every kind has a label', () => {
    for (const k of SUNDRY_KINDS) expect(SUNDRY_KIND_LABELS[k]).toBeTruthy();
    expect(SUNDRY_KIND_LABELS.other).toBe('Something else');
  });
});
