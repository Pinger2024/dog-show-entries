import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// Render React-PDF primitives as plain divs/spans so renderToStaticMarkup +
// regex can assert on the rendered structure — same approach as
// catalogue-rkc-compliance.test.ts, the closest existing pattern for
// asserting rendered PDF content. Image is mocked to expose whether it was
// given a Buffer (the SSRF-safe fetchClubImage() path) or a bare
// string/path, rather than swallowing it silently — the tests below need to
// tell "logo rendered from a fetched buffer" apart from "no logo, text-only
// fallback".
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Page: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children, render }: { children?: React.ReactNode; render?: unknown }) => {
    if (render) return React.createElement('span');
    return React.createElement('span', null, children);
  },
  Image: ({ src }: { src?: unknown }) =>
    React.createElement('span', {
      'data-pdf-image': Buffer.isBuffer(src) ? 'buffer' : typeof src === 'string' ? 'string' : 'none',
    }),
  Link: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('a', null, children),
  Svg: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('svg', null, children),
  Path: () => null,
  StyleSheet: { create: <T,>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

import { SvAcknowledgementsPage } from '@/components/catalogue/sv-front-matter';
import type { CatalogueShowInfo, ShowSponsorInfo } from '@/components/catalogue/catalogue-types';

function baseShow(overrides: Partial<CatalogueShowInfo> = {}): CatalogueShowInfo {
  return {
    name: 'North East GSD Regional Group',
    showType: 'regional',
    showRuleset: 'wusv',
    date: '2026-09-05',
    venue: 'Test Showground',
    venueAddress: 'Test Road, Test Town',
    organisation: 'North East GSD Regional Group',
    kcLicenceNo: null,
    ...overrides,
  } as CatalogueShowInfo;
}

function renderAcknowledgements(show: CatalogueShowInfo): string {
  return renderToStaticMarkup(SvAcknowledgementsPage({ show }) as React.ReactElement);
}

// Mirrors the real North East GSD Regional Group data (show 069e8ef0):
// a show_sponsors row with tier='show', custom_title='Official sponsor',
// joined to a sponsors row named "The Tripe Factory Sunderland" with a
// non-null logo_url.
const SHOW_SPONSOR: ShowSponsorInfo = {
  name: 'The Tripe Factory Sunderland',
  tier: 'show',
  logoUrl: 'https://example.test/tripe-factory-logo.png',
  website: null,
  customTitle: 'Official sponsor',
};

const SUPPORTER_SPONSOR: ShowSponsorInfo = {
  name: 'Bounce and Bark Treats',
  tier: 'supporter',
  logoUrl: null,
  website: null,
  customTitle: null,
};

describe('SV catalogue acknowledgements — show-tier sponsor billing (Mandy 2026-08-24)', () => {
  it('gives a show-tier sponsor a prominent billing block with its custom title, not just its name in the joined line', () => {
    const html = renderAcknowledgements(
      baseShow({ showSponsors: [SHOW_SPONSOR, SUPPORTER_SPONSOR] }),
    );
    // The custom title only ever renders inside the billing block — the old
    // joined line used only `s.name`, never `s.customTitle`.
    expect(html).toMatch(/Official sponsor/i);
    expect(html).toMatch(/The Tripe Factory Sunderland/);
  });

  it('renders the show-tier sponsor logo from a fetched Buffer, never a bare URL string (SSRF guard)', () => {
    const html = renderAcknowledgements(
      baseShow({
        showSponsors: [
          { ...SHOW_SPONSOR, logoBuffer: Buffer.from('fake-png-bytes') },
          SUPPORTER_SPONSOR,
        ],
      }),
    );
    expect(html).toContain('data-pdf-image="buffer"');
  });

  it('keeps non-show sponsors in the joined names line, with the show-tier sponsor no longer mixed into it', () => {
    const html = renderAcknowledgements(
      baseShow({ showSponsors: [SHOW_SPONSOR, SUPPORTER_SPONSOR] }),
    );
    expect(html).toMatch(/Bounce and Bark Treats/);
    // Previously every named sponsor (show-tier included) was joined with
    // "  ·  " into one line — the show sponsor must no longer sit inside
    // that joined run now that it has its own billing block.
    expect(html).not.toMatch(/The Tripe Factory Sunderland\s*·\s*Bounce and Bark Treats/);
  });

  it('degrades to a text-only billing block when the logo fetch failed or was blocked', () => {
    const html = renderAcknowledgements(
      baseShow({ showSponsors: [{ ...SHOW_SPONSOR, logoBuffer: null }] }),
    );
    expect(html).toMatch(/Official sponsor/i);
    expect(html).toMatch(/The Tripe Factory Sunderland/);
    expect(html).not.toContain('data-pdf-image="buffer"');
  });

  it('falls back to "Official show sponsor" when no custom title is set', () => {
    const html = renderAcknowledgements(
      baseShow({ showSponsors: [{ ...SHOW_SPONSOR, customTitle: null }] }),
    );
    expect(html).toMatch(/Official show sponsor/i);
  });

  it('does not crash and renders no billing block when the show has no sponsors', () => {
    expect(() => renderAcknowledgements(baseShow({ showSponsors: undefined }))).not.toThrow();
  });
});
