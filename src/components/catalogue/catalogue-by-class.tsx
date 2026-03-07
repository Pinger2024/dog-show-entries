import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';
import { formatDobKC, formatPedigreeKC, uppercaseName } from './catalogue-utils';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// Group entries by class, preserving sort metadata.
// Uses classNumber as the unique key (not class name) so that
// dog and bitch classes with the same definition name stay separate.
function groupByClass(entries: CatalogueEntry[]) {
  const classes: Record<string, {
    className: string;
    sex: string | null | undefined;
    classNumber: number | null | undefined;
    sortOrder: number | undefined;
    entries: CatalogueEntry[];
  }> = {};

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const className = cls.name ?? 'Unknown Class';
      const classKey = cls.classNumber != null
        ? String(cls.classNumber)
        : `${className}-${cls.sex ?? 'any'}`;
      classes[classKey] ??= {
        className,
        sex: cls.sex,
        classNumber: cls.classNumber,
        sortOrder: cls.sortOrder,
        entries: [],
      };
      classes[classKey].entries.push(entry);
    }
  }

  return classes;
}

export function CatalogueByClass({ show, entries }: Props) {
  const grouped = groupByClass(entries);
  // Sort by classNumber if assigned, otherwise by sortOrder, then alphabetically
  const classKeys = Object.keys(grouped).sort((a, b) => {
    const aNum = grouped[a].classNumber;
    const bNum = grouped[b].classNumber;
    if (aNum != null && bNum != null) return aNum - bNum;
    if (aNum != null) return -1;
    if (bNum != null) return 1;
    const aSort = grouped[a].sortOrder ?? 0;
    const bSort = grouped[b].sortOrder ?? 0;
    if (aSort !== bSort) return aSort - bSort;
    return a.localeCompare(b);
  });

  return (
    <Document>
      <Page size="A5" style={styles.page} wrap>
        <CatalogueHeader
          showName={show.name}
          showType={show.showType}
          organisationName={show.organisation}
          date={show.date}
          venue={show.venue}
          venueAddress={show.venueAddress}
          kcLicenceNo={show.kcLicenceNo ?? undefined}
          logoUrl={show.logoUrl}
          subtitle="Catalogue — By Class"
        />

        {classKeys.map((classKey) => {
          const { className, sex, classNumber, entries: classEntries } = grouped[classKey];
          const sorted = [...classEntries].sort(
            (a, b) => (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
          );

          return (
            <View key={classKey}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...styles.groupHeading }}>
                <Text>{classNumber ? `Class ${classNumber}: ${className}` : className}</Text>
                {sex && (
                  <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#fff' }}>
                    ({sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'})
                  </Text>
                )}
              </View>
              <Text style={styles.classEntryCount}>
                {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
              </Text>

              {sorted.map((entry) => {
                const pedigree = formatPedigreeKC(entry.sire, entry.dam);
                return (
                  <View
                    key={`${className}-${entry.catalogueNumber}`}
                    style={styles.entryRowWrap}
                    wrap={false}
                  >
                    {/* Catalogue number + dog name (UPPER CASE) */}
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={styles.catalogueNumber}>
                        {entry.catalogueNumber ?? '—'}
                      </Text>
                      <Text style={styles.dogName}>
                        {uppercaseName(entry.dogName) || 'Unnamed'}
                      </Text>
                    </View>
                    <Text style={styles.entryDetail}>
                      {[
                        entry.breed,
                        entry.dateOfBirth ? `D.O.B: ${formatDobKC(entry.dateOfBirth)}` : null,
                        entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
                      ].filter(Boolean).join('  —  ')}
                    </Text>
                    {/* Pedigree: By [sire] ex [dam] */}
                    {pedigree && (
                      <Text style={styles.entryDetail}>{pedigree}</Text>
                    )}
                    {entry.owners.length > 0 && (
                      <Text style={styles.entryDetail}>
                        <Text style={styles.entryDetailLabel}>
                          Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                        </Text>
                        {entry.owners.map((o) => uppercaseName(o.name)).join(' & ')}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

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
