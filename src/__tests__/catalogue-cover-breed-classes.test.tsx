import { describe, it, expect } from 'vitest';
import { CoverPage } from '@/components/catalogue/catalogue-front-matter';
import type { CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { isValidElement, type ReactElement } from 'react';

/**
 * Mandy 2026-09-08: on a single-breed show, the RKC cover's class-count line
 * must read "N Breed Classes"; an all-breed show keeps the existing
 * "N Classes" wording pending a separate decision from Mandy. `totalClasses`
 * comes from buildCatalogueSnapshot's showInfoBase (catalogue-snapshot.ts),
 * counting every show class EXCEPT Junior Handling.
 */

/** Every string anywhere in the element tree, concatenated — mirrors
 *  catalogue-judge-copy-results.test.tsx's `allText` walker. */
function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('\n');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

function makeShow(overrides: Partial<CatalogueShowInfo> = {}): CatalogueShowInfo {
  return {
    name: 'Test Championship Show',
    showType: 'championship',
    date: '2026-06-01',
    venue: 'Test Ground',
    organisation: 'Test Club',
    kcLicenceNo: '1234',
    ...overrides,
  } as CatalogueShowInfo;
}

describe('CoverPage — class count wording', () => {
  it('single-breed show: prints "N Breed Classes"', () => {
    // allText joins each JSX expression child with '\n' — `{n} Breed
    // Class{es}` becomes three array children ("20", " Breed Class", "es"),
    // hence the \s* between "Class" and "es" below rather than a literal
    // "Classes".
    const text = allText(CoverPage({ show: makeShow({ showScope: 'single_breed', totalClasses: 20 }) }));
    expect(text).toMatch(/20\s*Breed Class\s*es/);
  });

  it('all-breed show: prints "N Classes" — wording unchanged pending Mandy', () => {
    const text = allText(CoverPage({ show: makeShow({ showScope: 'general', totalClasses: 20 }) }));
    expect(text).toMatch(/20\s*Class\s*es/);
    expect(text).not.toContain('Breed');
  });

  it('totalClasses undefined: renders no class-count line at all, on either scope', () => {
    const singleBreedText = allText(CoverPage({ show: makeShow({ showScope: 'single_breed', totalClasses: undefined }) }));
    const allBreedText = allText(CoverPage({ show: makeShow({ showScope: 'general', totalClasses: undefined }) }));
    expect(singleBreedText).not.toMatch(/\d+\s*(Breed\s*)?Class/);
    expect(allBreedText).not.toMatch(/\d+\s*(Breed\s*)?Class/);
  });
});
