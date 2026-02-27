import { View, Text, Image } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';

interface CatalogueHeaderProps {
  showName: string;
  organisationName?: string;
  date?: string;
  venue?: string;
  kcLicenceNo?: string;
  logoUrl?: string;
  subtitle?: string;
}

export function CatalogueHeader({
  showName,
  organisationName,
  date,
  venue,
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

  return (
    <View style={styles.header}>
      {logoUrl && (
        <Image src={logoUrl} style={{ width: 60, height: 60, marginBottom: 8, alignSelf: 'center' }} />
      )}
      {organisationName && (
        <Text style={styles.headerSubtitle}>{organisationName}</Text>
      )}
      <Text style={styles.headerTitle}>{showName}</Text>
      {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      {formattedDate && (
        <Text style={styles.headerDetail}>{formattedDate}</Text>
      )}
      {venue && <Text style={styles.headerDetail}>{venue}</Text>}
      {kcLicenceNo && (
        <Text style={styles.headerDetail}>
          KC Licence No: {kcLicenceNo}
        </Text>
      )}
    </View>
  );
}
