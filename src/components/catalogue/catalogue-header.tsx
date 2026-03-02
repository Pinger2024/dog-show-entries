import { View, Text, Image } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';

const SHOW_TYPE_LABELS: Record<string, string> = {
  championship: 'Championship Show',
  premier_open: 'Premier Open Show',
  open: 'Open Show',
  limited: 'Limited Show',
  primary: 'Primary Show',
  companion: 'Companion Show',
};

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
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const showTypeLabel = showType ? SHOW_TYPE_LABELS[showType] : undefined;

  return (
    <View style={styles.header} fixed>
      {logoUrl && (
        <Image
          src={logoUrl}
          style={{ width: 56, height: 56, marginBottom: 6, alignSelf: 'center' }}
        />
      )}
      {organisationName && (
        <Text style={styles.headerOrganisation}>{organisationName}</Text>
      )}
      <Text style={styles.headerTitle}>{showName}</Text>
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
          KC Licence No: {kcLicenceNo}
        </Text>
      )}
    </View>
  );
}
