import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { View, Image } from '@react-pdf/renderer';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';

// Mandy 2026-07-15: the class-sponsor banner must render FULL-WIDTH at the
// image's OWN aspect ratio — no fixed-height box (which forced one ratio and
// meant non-4:1 artwork got stretched or cropped) and no objectFit:cover/fill.
// The banner box has width 100% and NO fixed height; the image is width 100%,
// objectFit:contain (never distorts/crops), with a maxHeight cap so a
// near-square upload can't dominate the page. This guards against regressing to
// a fixed-height / cover strip. CatalogueByClass is a pure (hook-free)
// component, so we can call it directly and walk the react-pdf element tree.

const BANNER_URL = 'https://example.test/hundark-banner.jpg';

// Height cap on the banner image (≈50mm) — see BANNER_MAX_HEIGHT in the component.
const EXPECTED_MAX_HEIGHT = 142;

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

/** Every string anywhere in the element tree, concatenated. */
function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('\n');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

describe('CatalogueByClass — class-sponsor banner', () => {
  it('still prints the trophy / prize line under a banner (JH "£10 per handler", Mandy 2026-08-24)', () => {
    // The banner replaces the "Sponsored by X" line — it must NOT also swallow
    // the prize: the NE Regional's JH classes had "£10 sponsorship for each
    // handler" saved against a banner sponsorship and it never printed.
    const show = makeShow();
    show.classSponsorships![0] = {
      ...show.classSponsorships![0],
      trophyName: '£10 sponsorship for each handler',
    };
    const text = allText(CatalogueByClass({ show, entries: [makeEntry()] }));
    expect(text).toContain('£10 sponsorship for each handler');
    expect(text).not.toContain('Sponsored by Mandy McAteer'); // the banner says who
  });

  it('renders the banner full-width at its own aspect ratio (no fixed-height box, no distortion)', () => {
    const tree = CatalogueByClass({ show: makeShow(), entries: [makeEntry()] });

    const banner = findBanner(tree);
    expect(banner, 'banner element should be present for a sponsored SV class').not.toBeNull();

    const { boxStyle, imageStyle } = banner!;

    // Box spans the full content width and does NOT impose a fixed height —
    // the height follows the image so its aspect ratio is preserved.
    expect(boxStyle.width).toBe('100%');
    expect(boxStyle.height).toBeUndefined();

    // Image fills the width, is height-capped, and uses contain so it is never
    // stretched (the old fixed 4:1 box forced sponsors to distort non-4:1 art)
    // or cropped (the interim objectFit:cover chopped edges off).
    expect(imageStyle.width).toBe('100%');
    expect(imageStyle.maxHeight).toBe(EXPECTED_MAX_HEIGHT);
    expect(imageStyle.objectFit).toBe('contain');
  });
});
