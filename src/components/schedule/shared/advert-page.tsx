import { Page, View, Image } from '@react-pdf/renderer';
import type { ScheduleAdvert } from './types';

/**
 * Render a single full-bleed A5 advert page. Each uploaded advert occupies
 * its own page — Amanda's spec 2026-05-19 is one ad = one A5 page.
 */
export function AdvertPage({ advert }: { advert: ScheduleAdvert }) {
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
