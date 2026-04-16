import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, uppercaseName, buildSponsorLines } from './catalogue-utils';
import { CoverPage, ShowInformationPage, JudgesListPage, ClassDefinitionsPage, TrophiesPage, BestAwardsPage, ExhibitorIndexPage } from './catalogue-front-matter';

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
  // Build a lookup: classNumber -> sponsorship info (array, since one class
  // can have multiple sponsors — e.g. one for the trophy and another for
  // the rosettes).
  const sponsorsByClassNumber = new Map<number, ClassSponsorshipInfo[]>();
  for (const sp of show.classSponsorships ?? []) {
    if (sp.classNumber != null) {
      const existing = sponsorsByClassNumber.get(sp.classNumber) ?? [];
      existing.push(sp);
      sponsorsByClassNumber.set(sp.classNumber, existing);
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

  // Chunk threshold. Too low creates artificial page breaks with
  // trailing whitespace; too high triggers pdfkit's coordinate-
  // overflow crash (unsupported number -9.979e+21) inside
  // `clipBorderTop` on shows with many entries in a single <Page wrap>.
  // Crash boundary is between 125 and 128 entries on Amanda's 187-entry
  // Final Test Show with 44 sponsorships (scripts/repro-byclass-overflow.ts
  // sweeps the value). 125 sits one safety margin below the boundary
  // while keeping chunks as big as possible so the whole catalogue
  // usually fits in 2 chunks rather than 3, minimising the forced-
  // break whitespace at chunk boundaries.
  const PAGE_ENTRY_THRESHOLD = 125;
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
      {/* Front matter — cover, show info, judges, definitions, trophies.
          The exhibitor index lives at the back of the catalogue (backlog
          #93) since exhibitors look up their own catalogue numbers more
          often than they read alphabetical reference indexes. */}
      <CoverPage show={show} />
      <ShowInformationPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />
      {!show.skipTrophiesPage && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
      )}
      <BestAwardsPage show={show} />

      {classChunks.map((chunkKeys, chunkIdx) => (
      <Page key={`chunk-${chunkIdx}`} size="A5" style={styles.page} wrap>
      {chunkKeys.map((classKey, idx) => {
        const { className, sex, classNumber, entries: classEntries } = grouped[classKey];
        const sorted = [...classEntries].sort(
          (a, b) => (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
        );
        // Small classes (≤ 8 entries) stay atomic — never split the header
        // from its entries. Larger classes can break across pages if needed.
        // Amanda's feedback: "just dont want a class broken up like that
        // unless its a big class that takes up more than one page".
        const keepTogether = sorted.length <= 8;

        // Render one entry — extracted so we can render the FIRST
        // entry inside the wrap=false header block (keeping header
        // and first dog atomic, per Amanda) and the rest as a
        // normal flowing list.
        const renderEntry = (entry: typeof classEntries[number], entryIdx: number) => {
          const isJH = entry.entryType === 'junior_handler';
          const rowKey = `${classKey}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`;
          if (isJH) {
            const handlerName = entry.jhHandlerName ?? entry.exhibitor ?? 'Unnamed Handler';
            return (
              <View key={rowKey} style={styles.entryRowWrap} wrap={false}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
                  <Text style={styles.dogName}>{handlerName}</Text>
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
                    {formatOwnerKC(entry.owners, entry.exhibitorId, entry.withholdFromPublication)}
                  </Text>
                )}
              </View>
            );
          }
          const pedigree = formatPedigreeKC(entry.sire, entry.dam);
          const metaParts = [
            entry.kcRegNumber,
            entry.dateOfBirth ? `DOB ${formatDobKC(entry.dateOfBirth)}` : null,
            entry.colour,
            entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
            pedigree,
            entry.breeder ? `br ${entry.breeder}` : null,
          ].filter(Boolean);
          return (
            <View key={rowKey} style={styles.entryRowWrap} wrap={false}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
                <Text style={styles.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
              </View>
              {metaParts.length > 0 && (
                <Text style={styles.entryDetail}>{metaParts.join('  ·  ')}</Text>
              )}
              {entry.owners.length > 0 && (
                <Text style={styles.entryDetail}>
                  <Text style={styles.entryDetailLabel}>
                    Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                  </Text>
                  {formatOwnerKC(entry.owners, entry.exhibitorId, entry.withholdFromPublication)}
                </Text>
              )}
            </View>
          );
        };

        return (
          <View
            key={classKey}
            wrap={!keepTogether}
            style={idx > 0 ? { marginTop: 6 } : undefined}
          >

            {/* Header block kept atomic with the FIRST entry so we
                never orphan a class heading at the bottom of a page
                with the dogs starting fresh on the next. Per Amanda:
                "if there is a dog displayed immediately under the
                classification … but it doesn't look right" without. */}
            <View wrap={false}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...styles.groupHeading }}
              >
                <Text>{classNumber ? `Class ${classNumber}: ${className}` : className}</Text>
                {sex && (
                  <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#fff' }}>
                    ({sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'})
                  </Text>
                )}
              </View>
              {classNumber != null && sponsorsByClassNumber.has(classNumber) &&
                buildSponsorLines(sponsorsByClassNumber.get(classNumber)!).map((line, i) => (
                  <Text key={i} style={styles.sponsorLine}>{line}</Text>
                ))}

              <Text style={styles.classEntryCount}>
                {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
              </Text>

              {sorted.length > 0 && renderEntry(sorted[0], 0)}
            </View>

            {sorted.slice(1).map((entry, sliceIdx) => renderEntry(entry, sliceIdx + 1))}

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

      {/* Back matter: exhibitor index — moved to the end per backlog #93 */}
      <ExhibitorIndexPage show={show} entries={entries} />
    </Document>
  );
}
