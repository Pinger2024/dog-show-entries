import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { View, Image } from '@react-pdf/renderer';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';

// Mandy 2026-07-15: a class-sponsor banner rendered at only ~half the page
// width and sat centred, because the old strip was a fixed 50pt-tall box with
// objectFit:contain — the drawn width was capped at (50 × image-aspect). The
// fix makes the banner a FULL-WIDTH, fixed-height 4:1 strip so sponsor artwork
// spans the catalogue. This guards against the strip regressing to the small
// centred box. CatalogueByClass is a pure (hook-free) component, so we can call
// it directly and walk the returned react-pdf element tree.

const BANNER_URL = 'https://example.test/hundark-banner.jpg';

// A5 (419.5pt) minus 22pt left + 22pt right page padding = 375.5pt content
// width; a 4:1 strip is therefore 93.875pt tall.
const CONTENT_WIDTH = 375.5;
const EXPECTED_STRIP_HEIGHT = CONTENT_WIDTH / 4;

function makeShow(): CatalogueShowInfo {
  return {
    name: 'North East Regional',
    showType: 'championship',
    showRuleset: 'wusv', // banner only renders for SV/WUSV shows
    date: '2026-08-01',
    venue: 'Test Ground',
    venueAddress: 'Somewhere',
    organisation: 'Test GSD Club',
    kcLicenceNo: '1234',
    classSponsorships: [
      {
        className: 'SV Puppy',
        classNumber: 11,
        classLabel: '11',
        trophyName: null,
        trophyDonor: null,
        sponsorName: 'Mandy McAteer',
        sponsorAffix: 'Hundark GSD',
        prizeDescription: null,
        bannerImageUrl: BANNER_URL,
      },
    ],
  } as CatalogueShowInfo;
}

function makeEntry(): CatalogueEntry {
  return {
    catalogueNumber: '1',
    dogName: 'Test Dog',
    breed: 'German Shepherd Dog',
    group: undefined,
    groupSortOrder: undefined,
    sex: 'dog',
    dateOfBirth: '2026-01-01',
    kcRegNumber: 'AB123',
    colour: null,
    sire: null,
    dam: null,
    breeder: null,
    owners: [{ title: null, name: 'Owner', address: null, userId: null }],
    exhibitorId: undefined,
    handler: null,
    exhibitor: null,
    jhHandlerName: null,
    classes: [
      {
        name: 'SV Puppy',
        sex: 'dog',
        classNumber: 11,
        classLabel: '11',
        sortOrder: 11,
        svCoatType: 'stock',
      },
    ],
    status: 'confirmed',
    entryType: 'standard',
  } as CatalogueEntry;
}

/** Walk the react-pdf element tree and return the style of the View that
 *  directly wraps the banner Image (src === BANNER_URL), plus the Image's
 *  own style. */
function findBanner(node: unknown): { boxStyle: any; imageStyle: any } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findBanner(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<any>;

  if (el.type === View) {
    const children = el.props.children;
    const kids = Array.isArray(children) ? children : [children];
    for (const kid of kids) {
      if (isValidElement(kid) && (kid as ReactElement<any>).type === Image
        && (kid as ReactElement<any>).props.src === BANNER_URL) {
        return { boxStyle: el.props.style, imageStyle: (kid as ReactElement<any>).props.style };
      }
    }
  }

  return findBanner(el.props.children);
}

describe('CatalogueByClass — class-sponsor banner', () => {
  it('renders the banner as a full-width, fixed-height strip (not a shrunk centred box)', () => {
    const tree = CatalogueByClass({ show: makeShow(), entries: [makeEntry()] });

    const banner = findBanner(tree);
    expect(banner, 'banner element should be present for a sponsored SV class').not.toBeNull();

    const { boxStyle, imageStyle } = banner!;

    // Box spans the full content width.
    expect(boxStyle.width).toBe('100%');

    // Box height is FIXED (a number, so the footprint is predictable and the
    // sponsor spec is exact) and sized for a 4:1 strip — decisively taller than
    // the old 50pt strip that caused the shrink.
    expect(typeof boxStyle.height).toBe('number');
    expect(boxStyle.height).toBeCloseTo(EXPECTED_STRIP_HEIGHT, 1);
    expect(boxStyle.height).toBeGreaterThan(50);

    // Image fills the strip edge-to-edge via cover (not the old contain, which
    // letterboxed and shrank the drawn width).
    expect(imageStyle.width).toBe('100%');
    expect(imageStyle.height).toBe('100%');
    expect(imageStyle.objectFit).toBe('cover');
  });
});
