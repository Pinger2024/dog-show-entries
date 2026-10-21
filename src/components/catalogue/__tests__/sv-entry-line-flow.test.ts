import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Same primitive mock as sv-front-matter-sponsors.test.ts — the assertions
// here walk the element tree rather than rendered markup, but the module
// still imports react-pdf at load time.
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Page: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
  Image: () => null,
  Link: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('a', null, children),
  Svg: () => null,
  Path: () => null,
  StyleSheet: { create: <T,>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

import { Text } from '@react-pdf/renderer';
import { renderSvEntry } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry } from '@/components/catalogue/catalogue-types';

/** Every string in an element's subtree, concatenated. */
function subtreeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(subtreeText).join('');
  if (React.isValidElement(node)) {
    return subtreeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/** All elements of the given type anywhere in the tree. */
function elementsOfType(node: React.ReactNode, type: unknown): React.ReactElement[] {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => elementsOfType(n, type));
  if (!React.isValidElement(node)) return [];
  const self = node.type === type ? [node] : [];
  return [
    ...self,
    ...elementsOfType((node.props as { children?: React.ReactNode }).children, type),
  ];
}

// The real dog this bit: no. 30 at the North East Regional (2026-08-24) — a
// long name plus a WB qualification. As four sibling Texts in a flex row,
// react-pdf paints the overflowing name OVER the qualification letters
// instead of flowing; the row must be ONE wrapping paragraph after the
// fixed number column.
const entry = {
  catalogueNumber: 30,
  dogName: 'Xtra van de Biezenhoeve  vom Hundenkraft (Imp Bel)',
  microchipNumber: '967000010656719',
  svProfile: { wb: true, bh: true },
  owners: [],
  titles: [],
  entryType: 'standard',
} as unknown as CatalogueEntry;

describe('renderSvEntry name line', () => {
  it('flows name, qualifications and chip as ONE paragraph so they can never overlap', () => {
    const row = renderSvEntry(entry, 'k');
    const texts = elementsOfType(row, Text);
    const paragraph = texts.find((t) => {
      const s = subtreeText(t);
      return (
        s.includes('XTRA VAN DE BIEZENHOEVE') &&
        s.includes('WB, BH') &&
        s.includes('Chip 967000010656719')
      );
    });
    expect(paragraph, 'no single Text contains name + quals + chip').toBeTruthy();
  });

  it('keeps the catalogue number OUT of the flowing paragraph (hanging number column)', () => {
    const row = renderSvEntry(entry, 'k');
    const texts = elementsOfType(row, Text);
    const numberText = texts.find((t) => subtreeText(t) === '30');
    expect(numberText, 'catalogue number should be its own Text').toBeTruthy();
  });
});

// Mandy 2026-10-09: a BRG secretary stewarding the Midland regional kept
// reading the breeder when she meant to call in the owner. The line now leads
// with the owner, and the owner's NAMES are bold so they stand out on the page.
describe('renderSvEntry owner / breeder line', () => {
  const withOwner = {
    catalogueNumber: 12,
    dogName: 'Bella',
    breeder: 'Mrs B Reeder',
    breederCity: 'Leeds',
    breederPostcode: 'LS1 1AA',
    owners: [{ name: 'Smith', title: null, address: '1 High St, York, YO1 7HH' }],
    titles: [],
    entryType: 'standard',
  } as unknown as CatalogueEntry;

  function ownerBreederLine(e: CatalogueEntry) {
    const row = renderSvEntry(e, 'k');
    const line = elementsOfType(row, Text).find((t) => {
      const s = subtreeText(t);
      return s.includes('Owner') && s.includes('Breeder');
    });
    return line;
  }

  it('prints the owner BEFORE the breeder, on ONE line', () => {
    const line = ownerBreederLine(withOwner);
    expect(line, 'owner and breeder should share one Text').toBeTruthy();
    const s = subtreeText(line);
    expect(s.indexOf('Owner')).toBeLessThan(s.indexOf('Breeder'));
    expect(s.indexOf('SMITH')).toBeLessThan(s.indexOf('Reeder'));
  });

  it('prints the owner names bold, and the owner town/postcode in normal weight', () => {
    const line = ownerBreederLine(withOwner)!;
    const bold = elementsOfType(line, Text).filter(
      (t) => (t.props as { style?: { fontWeight?: string } }).style?.fontWeight === 'bold',
    );
    const boldTexts = bold.map((t) => subtreeText(t));
    expect(boldTexts.some((s) => s.includes('SMITH'))).toBe(true);
    // The town is not inside any bold node.
    expect(boldTexts.some((s) => s.includes('York') || s.includes('YO1'))).toBe(false);
  });

  it('has no stray separator when there is no breeder', () => {
    const noBreeder = { ...withOwner, breeder: null, breederCity: null, breederPostcode: null } as unknown as CatalogueEntry;
    const s1 = subtreeText(renderSvEntry(noBreeder, 'k'));
    expect(s1).not.toContain('Breeder');
    expect(s1).not.toMatch(/·\s*$/);
  });
});
