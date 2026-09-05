import { View, Text, Image } from '@react-pdf/renderer';
import { FitText } from '@/components/pdf-kit/fit-text';
import { styles, C } from './catalogue-styles';
import { formatLondonLongDate } from '@/lib/date-utils';

const SHOW_TYPE_LABELS: Record<string, string> = {
  championship: 'Championship Show',
  premier_open: 'Premier Open Show',
  open: 'Open Show',
  limited: 'Limited Show',
  primary: 'Primary Show',
  companion: 'Companion Show',
};

// styles.page's usable content width — A5 (419.53pt) minus its own
// padding (22pt each side). This header has no padding of its own beyond
// the page's, so this is the true width the title text wraps against.
const HEADER_TITLE_MAX_WIDTH = 375;
// styles.headerTitle's original fixed size — the ceiling FitText starts
// from.
const HEADER_TITLE_MAX_SIZE = 13;

interface CatalogueHeaderProps {
  showName: string;
  showType?: string;
  organisationName?: string;
  date?: string;
  venue?: string;
  venueAddress?: string;
  kcLicenceNo?: string;
  logoUrl?: string;
  subtitle?: string;
}

export function CatalogueHeader({
  showName,
  showType,
  organisationName,
  date,
  venue,
  venueAddress,
  kcLicenceNo,
  subtitle,
  logoUrl,
}: CatalogueHeaderProps) {
  // Always Europe/London, never the process's own timezone (Michael 2026-09-03).
  const formattedDate = date ? formatLondonLongDate(date) : '';

  const showTypeLabel = showType ? SHOW_TYPE_LABELS[showType] : undefined;

  return (
    <View style={styles.header} fixed>
      {logoUrl && (
        <Image
          src={logoUrl}
          style={{ maxWidth: 98, maxHeight: 56, objectFit: 'contain', marginBottom: 6, alignSelf: 'center' }}
        />
      )}
      {organisationName && (
        <Text style={styles.headerOrganisation}>{organisationName}</Text>
      )}
      {/* FitText with reserveHeight rather than a bare Text: a genuine
          react-pdf bug found live (coordinator's review, 2026-09-02) let
          a long show name's title box come out shorter than its actual
          rendered glyphs, so the very next sibling (the show-type
          subtitle) started drawing before the title had finished —
          visible overlap, and non-deterministic poppler line-grouping as
          a side effect (this is what was making synthetic-stress-rkc-
          champ's catalogue-absentees intermittently fail for a reason
          that had nothing to do with the text-layer-drift bug fixed
          alongside this). styles.headerTitle now sets lineHeight
          explicitly too (the direct fix), but a long/unusual show name
          could still legitimately need to shrink to stay on a sane
          number of lines, hence FitText rather than reverting to a bare
          Text. */}
      <FitText
        maxWidth={HEADER_TITLE_MAX_WIDTH}
        family="HankenGrotesk"
        weight={800}
        maxLines={2}
        min={9}
        max={HEADER_TITLE_MAX_SIZE}
        lineHeight={1.3}
        reserveHeight
        style={{
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 2,
          lineHeight: 1.3,
          color: C.textDark,
        }}
      >
        {showName}
      </FitText>
      {showTypeLabel && (
        <Text style={styles.headerShowType}>{showTypeLabel}</Text>
      )}
      {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      {formattedDate && (
        <Text style={styles.headerDetail}>{formattedDate}</Text>
      )}
      {venue && (
        <Text style={styles.headerDetail}>
          {venue}{venueAddress ? `, ${venueAddress}` : ''}
        </Text>
      )}
      {kcLicenceNo && (
        <Text style={styles.headerDetail}>
          RKC Licence No: {kcLicenceNo}
        </Text>
      )}
    </View>
  );
}
