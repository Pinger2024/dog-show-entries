import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';

// Mandy 2026-08-24, same rule as owners on the grading cards: names print
// properly cased however the exhibitor typed them. The NE Regional's Junior
// Handling page printed "lia stevenson" and "Alexxa cowan" verbatim.

function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('\n');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

const show = {
  name: 'North East Regional',
  showType: 'championship',
  showRuleset: 'wusv',
  date: '2026-09-05',
  venue: 'Outpaw Pursuits',
  venueAddress: 'Durham',
  organisation: 'North East GSD Regional Group',
  kcLicenceNo: null,
} as CatalogueShowInfo;

const jhEntry = {
  catalogueNumber: '73',
  dogName: 'Some Dog',
  breed: 'German Shepherd Dog',
  sex: 'dog',
  dateOfBirth: '2020-01-01',
  kcRegNumber: null,
  colour: null,
  sire: null,
  dam: null,
  breeder: null,
  owners: [],
  handler: null,
  exhibitor: 'someone',
  jhHandlerName: 'alexxa cowan',
  classes: [
    { name: 'JHA Handling (12-16)', sex: null, classNumber: null, classLabel: 'JHB', sortOrder: 90 },
  ],
  status: 'confirmed',
  entryType: 'junior_handler',
} as unknown as CatalogueEntry;

describe('CatalogueByClass — junior handler names', () => {
  it('prints the handler name in Title Case however it was typed', () => {
    const text = allText(CatalogueByClass({ show, entries: [jhEntry] }));
    expect(text).toContain('Alexxa Cowan');
    expect(text).not.toContain('alexxa cowan');
  });
});
