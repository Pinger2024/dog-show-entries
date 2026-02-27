import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';

export interface CatalogueEntry {
  catalogueNumber: string | null;
  dogName: string | null;
  breed: string | undefined;
  group: string | undefined;
  sex: string | undefined;
  dateOfBirth: string | null | undefined;
  sire: string | null | undefined;
  dam: string | null | undefined;
  breeder: string | null | undefined;
  owners: { name: string; address: string | null }[];
  exhibitor: string | undefined;
  classes: { name: string | undefined; sex: string | null | undefined }[];
  status: string;
  entryType: string;
}

export interface CatalogueShowInfo {
  name: string;
  date: string;
  venue: string | undefined;
  organisation: string | undefined;
  kcLicenceNo: string | null | undefined;
  logoUrl?: string;
}

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

function formatDob(dob: string | null | undefined) {
  if (!dob) return '';
  return new Date(dob).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Group entries: group → breed → sex
function groupEntries(entries: CatalogueEntry[]) {
  const groups: Record<
    string,
    Record<string, Record<string, CatalogueEntry[]>>
  > = {};

  for (const entry of entries) {
    const group = entry.group ?? 'Unclassified';
    const breed = entry.breed ?? 'Unknown Breed';
    const sex = entry.sex ?? 'unknown';

    groups[group] ??= {};
    groups[group][breed] ??= {};
    groups[group][breed][sex] ??= [];
    groups[group][breed][sex].push(entry);
  }

  return groups;
}

export function CatalogueStandard({ show, entries }: Props) {
  const grouped = groupEntries(entries);
  const groupNames = Object.keys(grouped).sort();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <CatalogueHeader
          showName={show.name}
          organisationName={show.organisation}
          date={show.date}
          venue={show.venue}
          kcLicenceNo={show.kcLicenceNo ?? undefined}
          logoUrl={show.logoUrl}
          subtitle="Official Catalogue"
        />

        {groupNames.map((groupName) => (
          <View key={groupName}>
            <Text style={styles.groupHeading}>{groupName}</Text>

            {Object.entries(grouped[groupName])
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([breedName, sexGroups]) => (
                <View key={breedName}>
                  <Text style={styles.breedHeading}>{breedName}</Text>

                  {['dog', 'bitch', 'unknown']
                    .filter((sex) => sexGroups[sex]?.length)
                    .map((sex) => (
                      <View key={sex}>
                        {sex !== 'unknown' && (
                          <Text style={styles.sexHeading}>
                            {sex === 'dog' ? 'Dogs' : 'Bitches'}
                          </Text>
                        )}

                        {sexGroups[sex].map((entry) => (
                          <View key={entry.catalogueNumber} style={styles.entryRow}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Text style={styles.catalogueNumber}>
                                {entry.catalogueNumber ?? '—'}
                              </Text>
                              <Text style={styles.dogName}>
                                {entry.dogName ?? 'Unnamed'}
                              </Text>
                            </View>

                            {entry.dateOfBirth && (
                              <Text style={styles.entryDetail}>
                                D.O.B: {formatDob(entry.dateOfBirth)}
                                {entry.sex && ` — ${entry.sex === 'dog' ? 'Dog' : 'Bitch'}`}
                              </Text>
                            )}

                            {entry.sire && (
                              <Text style={styles.entryDetail}>
                                Sire: {entry.sire}
                              </Text>
                            )}

                            {entry.dam && (
                              <Text style={styles.entryDetail}>
                                Dam: {entry.dam}
                              </Text>
                            )}

                            {entry.breeder && (
                              <Text style={styles.entryDetail}>
                                Breeder: {entry.breeder}
                              </Text>
                            )}

                            {entry.owners.length > 0 && (
                              <Text style={styles.entryDetail}>
                                Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                                {entry.owners.map((o) => o.name).join(' & ')}
                              </Text>
                            )}

                            {entry.classes.length > 0 && (
                              <Text style={styles.entryClasses}>
                                Entered in:{' '}
                                {entry.classes
                                  .map((c) => c.name)
                                  .filter(Boolean)
                                  .join(', ')}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                </View>
              ))}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
