import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, uppercaseName } from './catalogue-utils';
import { CoverPage, JudgesListPage, ClassDefinitionsPage, TrophiesPage } from './catalogue-front-matter';
import type { ClassSponsorshipInfo } from './catalogue-front-matter';

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
  // Build a lookup: classNumber -> sponsorship info for inline display
  const sponsorByClassNumber = new Map<number, ClassSponsorshipInfo>();
  for (const sp of show.classSponsorships ?? []) {
    if (sp.classNumber != null) {
      sponsorByClassNumber.set(sp.classNumber, sp);
    }
  }

  const grouped = groupByClass(entries);

  // Inject empty classes from allShowClasses that have no entries
  if (show.allShowClasses) {
    const existingKeys = new Set(Object.keys(grouped));
    for (const sc of show.allShowClasses) {
      const classKey = sc.classNumber != null
        ? String(sc.classNumber)
        : `${sc.className}-${sc.sex ?? 'any'}`;
      if (!existingKeys.has(classKey)) {
        grouped[classKey] = {
          className: sc.className,
          sex: sc.sex,
          classNumber: sc.classNumber,
          sortOrder: sc.sortOrder,
          entries: [],
        };
      }
    }
  }

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

  // Chunk classes into page-sized groups to avoid @react-pdf/renderer coordinate
  // overflow bug (single <Page wrap> with many nodes crashes pdfkit with values
  // like -9.979e+21). Each chunk gets its own <Page> so coordinates reset.
  const PAGE_ENTRY_THRESHOLD = 35;
  const classChunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentCount = 0;
  for (const classKey of classKeys) {
    const entryCount = grouped[classKey].entries.length;
    // Start a new chunk if adding this class would exceed the threshold
    // (but always put at least one class per chunk, even if it's large)
    if (currentChunk.length > 0 && currentCount + entryCount > PAGE_ENTRY_THRESHOLD) {
      classChunks.push(currentChunk);
      currentChunk = [];
      currentCount = 0;
    }
    currentChunk.push(classKey);
    currentCount += entryCount;
  }
  if (currentChunk.length > 0) classChunks.push(currentChunk);

  return (
    <Document>
      {/* Front matter — cover, judges, definitions, trophies */}
      <CoverPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />
      {show.classSponsorships && show.classSponsorships.length > 0 && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships} />
      )}

      {classChunks.map((chunkKeys, chunkIdx) => (
      <Page key={`chunk-${chunkIdx}`} size="A5" style={styles.page} wrap>
      {chunkKeys.map((classKey, idx) => {
        const { className, sex, classNumber, entries: classEntries } = grouped[classKey];
        const sorted = [...classEntries].sort(
          (a, b) => (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
        );

        return (
          <View key={classKey} style={idx > 0 ? { marginTop: 12 } : undefined}>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...styles.groupHeading }}>
              <Text>{classNumber ? `Class ${classNumber}: ${className}` : className}</Text>
              {sex && (
                <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#fff' }}>
                  ({sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'})
                </Text>
              )}
            </View>
            {/* Sponsorship banner if class has a trophy/sponsor */}
            {classNumber != null && sponsorByClassNumber.has(classNumber) && (() => {
              const sp = sponsorByClassNumber.get(classNumber)!;
              const parts: string[] = [];
              if (sp.trophyName) {
                let part = `Trophy: ${sp.trophyName}`;
                if (sp.sponsorName) {
                  part += ` — sponsored by ${sp.sponsorName}`;
                  if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
                }
                parts.push(part);
              } else if (sp.sponsorName) {
                let part = `Sponsored by ${sp.sponsorName}`;
                if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
                parts.push(part);
              }
              return parts.map((line, i) => (
                <Text key={i} style={styles.sponsorLine}>{line}</Text>
              ));
            })()}

            <Text style={styles.classEntryCount}>
              {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
            </Text>

            {sorted.map((entry, entryIdx) => {
              const isJH = entry.entryType === 'junior_handler';
              const rowKey = `${classKey}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`;
              if (isJH) {
                // Junior Handling: handler-centric display
                const handlerName = entry.jhHandlerName ?? entry.exhibitor ?? 'Unnamed Handler';
                return (
                  <View
                    key={rowKey}
                    style={styles.entryRowWrap}
                    wrap={false}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={styles.catalogueNumber}>
                        {entry.catalogueNumber ?? '—'}
                      </Text>
                      <Text style={styles.dogName}>
                        {handlerName}
                      </Text>
                    </View>
                    {entry.dogName && (
                      <Text style={styles.entryDetail}>
                        <Text style={styles.entryDetailLabel}>Dog: </Text>
                        {entry.dogName}
                      </Text>
                    )}
                    {entry.owners.length > 0 && (
                      <Text style={styles.entryDetail}>
                        <Text style={styles.entryDetailLabel}>
                          Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                        </Text>
                        {formatOwnerKC(entry.owners, entry.exhibitorId)}
                      </Text>
                    )}
                  </View>
                );
              }

              const pedigree = formatPedigreeKC(entry.sire, entry.dam);
              return (
                <View
                  key={rowKey}
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
                  {/* RKC reg + DOB + colour + sex */}
                  <Text style={styles.entryDetail}>
                    {[
                      entry.kcRegNumber,
                      entry.dateOfBirth ? `D.O.B: ${formatDobKC(entry.dateOfBirth)}` : null,
                      entry.colour,
                      entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
                    ].filter(Boolean).join('  —  ')}
                  </Text>
                  {/* Pedigree: By [sire] ex [dam] */}
                  {pedigree && (
                    <Text style={styles.entryDetail}>{pedigree}</Text>
                  )}
                  {/* Breeder */}
                  {entry.breeder && (
                    <Text style={styles.entryDetail}>
                      <Text style={styles.entryDetailLabel}>Breeder: </Text>
                      {entry.breeder}
                    </Text>
                  )}
                  {/* Owner(s) — UPPER CASE + address (or "Exh." if owner is exhibiting) */}
                  {entry.owners.length > 0 && (
                    <Text style={styles.entryDetail}>
                      <Text style={styles.entryDetailLabel}>
                        Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                      </Text>
                      {formatOwnerKC(entry.owners, entry.exhibitorId)}
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
      ))}
    </Document>
  );
}
