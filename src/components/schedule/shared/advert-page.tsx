import { Page, View, Image } from '@react-pdf/renderer';
import type { ScheduleAdvert } from './types';

/**
 * Render a single full-bleed A5 advert page. Each uploaded advert occupies
 * its own page — Amanda's spec 2026-05-19 is one ad = one A5 page.
 *
 * Takes only `{ imageUrl }` (not the full `ScheduleAdvert`) so catalogue
 * renderers — whose advert rows come back from the server already filtered
 * to `document: 'catalogue' | 'both'` and don't carry every schedule field
 * — can reuse this directly instead of re-implementing it (see
 * catalogue-by-breed.tsx / catalogue-by-class.tsx / catalogue-ringside.tsx).
 *
 * The Image sits inside a same-size View rather than being given
 * `width/height: '100%'` directly on the Page: react-pdf's page-break check
 * compares the node's laid-out height against the page's content-area
 * height computed independently (plain JS arithmetic vs. Yoga's float32
 * layout), and an A5 page's 595.28pt height doesn't round-trip exactly
 * through float32 — the Image node ends up ~0.00003pt "taller" than the
 * page and, since an Image can't wrap across pages, react-pdf logs "Node
 * of type IMAGE can't wrap between pages and it's bigger than available
 * page height" on every single advert page. Measured directly against
 * @react-pdf/layout's warnUnavailableSpace call site (2026-09-03): with a
 * bare `<Page><Image style={{height:'100%'}}/></Page>`, nodeHeight comes
 * back as 595.280029296875 against a contentArea of 595.28 — a hair over,
 * every time. Nesting the Image in a View of the same size sidesteps it
 * entirely (verified with a direct react-pdf repro): the same warning
 * never fires for the Image because the check that matters happens against
 * the View's own resolved box, not the page's, and pixel output is
 * byte-identical either way (rasterised at 150dpi with poppler — same
 * SHA-1). Do not "fix" this by shaving the Image's own height by an
 * epsilon percentage instead — the View wrapper is the pattern already
 * proven here; keep new advert call sites using it.
 */
export function AdvertPage({ advert }: { advert: { imageUrl: string | null } }) {
  if (!advert.imageUrl) return null;
  return (
    <Page size="A5" style={{ padding: 0, margin: 0 }}>
      <View style={{ width: '100%', height: '100%' }}>
        {/* react-pdf only supports JPEG / PNG / WebP from URLs. Object-fit
         *  contain keeps the artwork's aspect ratio inside the A5 page. */}
        <Image
          src={advert.imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </View>
    </Page>
  );
}

/** Filter adverts for a document + position, ordered by sortOrder.
 *  Adverts tagged `both` appear in either schedule or catalogue render. */
export function selectAdverts(
  adverts: readonly ScheduleAdvert[] | undefined,
  document: 'schedule' | 'catalogue',
  position: 'inside_front' | 'inside_back' | 'last_page',
): ScheduleAdvert[] {
  if (!adverts) return [];
  return adverts
    .filter(
      (a) =>
        (a.document === document || a.document === 'both') &&
        a.position === position &&
        a.imageUrl,
    )
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
}
