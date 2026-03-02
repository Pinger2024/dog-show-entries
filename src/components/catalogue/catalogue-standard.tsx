import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';

export interface CatalogueEntry {
  catalogueNumber: string | null;
  dogName: string | null;
  breed: string | undefined;
  group: string | undefined;
  groupSortOrder: number | undefined;
  sex: string | undefined;
  dateOfBirth: string | null | undefined;
  kcRegNumber: string | null | undefined;
  colour: string | null | undefined;
  sire: string | null | undefined;
  dam: string | null | undefined;
  breeder: string | null | undefined;
  owners: { name: string; address: string | null }[];
  handler: string | undefined;
  exhibitor: string | undefined;
  classes: { name: string | undefined; sex: string | null | undefined; classNumber: number | null | undefined; sortOrder: number | undefined }[];
  status: string;
  entryType: string;
}

export interface CatalogueShowInfo {
  name: string;
  showType: string | undefined;
  date: string;
  venue: string | undefined;
  venueAddress: string | undefined;
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

/** Format class list with numbers: "1. Minor Puppy, 3. Novice" */
function formatClassList(classes: CatalogueEntry['classes']) {
  return classes
    .sort((a, b) => {
      if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
      if (a.classNumber != null) return -1;
      if (b.classNumber != null) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    })
    .map((c) => {
      if (c.classNumber != null && c.name) return `${c.classNumber}. ${c.name}`;
      return c.name;
    })
    .filter(Boolean)
    .join(', ');
}

// Group entries: group → breed → sex, preserving sort order
function groupEntries(entries: CatalogueEntry[]) {
  const groups: Map<
    string,
    { sortOrder: number; breeds: Map<string, Record<string, CatalogueEntry[]>> }
  > = new Map();

  for (const entry of entries) {
    const group = entry.group ?? 'Unclassified';
    const breed = entry.breed ?? 'Unknown Breed';
    const sex = entry.sex ?? 'unknown';

    if (!groups.has(group)) {
      groups.set(group, { sortOrder: entry.groupSortOrder ?? 999, breeds: new Map() });
    }
    const breedMap = groups.get(group)!.breeds;
    if (!breedMap.has(breed)) {
      breedMap.set(breed, {});
    }
    const sexGroups = breedMap.get(breed)!;
    sexGroups[sex] ??= [];
    sexGroups[sex].push(entry);
  }

  return groups;
}

export function CatalogueStandard({ show, entries }: Props) {
  const grouped = groupEntries(entries);

  // Sort groups by sortOrder, then alphabetically
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return 0;
  });

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <CatalogueHeader
          showName={show.name}
          showType={show.showType}
          organisationName={show.organisation}
          date={show.date}
          venue={show.venue}
          venueAddress={show.venueAddress}
          kcLicenceNo={show.kcLicenceNo ?? undefined}
          logoUrl={show.logoUrl}
          subtitle="Official Catalogue"
        />

        {sortedGroups.map(([groupName, { breeds }]) => (
          <View key={groupName}>
            <Text style={styles.groupHeading}>{groupName}</Text>

            {[...breeds.entries()]
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
                          <View
                            key={entry.catalogueNumber}
                            style={styles.entryRowWrap}
                            wrap={false}
                          >
                            {/* Catalogue number + dog name */}
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Text style={styles.catalogueNumber}>
                                {entry.catalogueNumber ?? '—'}
                              </Text>
                              <Text style={styles.dogName}>
                                {entry.dogName ?? 'Unnamed'}
                              </Text>
                            </View>

                            {/* KC reg + DOB + colour on one line */}
                            <Text style={styles.entryDetail}>
                              {[
                                entry.kcRegNumber,
                                entry.dateOfBirth ? `D.O.B: ${formatDob(entry.dateOfBirth)}` : null,
                                entry.colour,
                                entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
                              ].filter(Boolean).join('  —  ')}
                            </Text>

                            {entry.sire && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>Sire: </Text>
                                {entry.sire}
                              </Text>
                            )}

                            {entry.dam && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>Dam: </Text>
                                {entry.dam}
                              </Text>
                            )}

                            {entry.breeder && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>Breeder: </Text>
                                {entry.breeder}
                              </Text>
                            )}

                            {entry.owners.length > 0 && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>
                                  Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                                </Text>
                                {entry.owners.map((o) => o.name).join(' & ')}
                              </Text>
                            )}

                            {entry.handler && entry.handler !== entry.exhibitor && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>Handler: </Text>
                                {entry.handler}
                              </Text>
                            )}

                            {entry.classes.length > 0 && (
                              <Text style={styles.entryClasses}>
                                Entered in: {formatClassList(entry.classes)}
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
            `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
