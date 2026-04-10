import type { ReactNode } from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, C } from './catalogue-styles';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';
// Re-export so existing imports of ClassSponsorshipInfo from this module
// keep working without touching every caller.
export type { ClassSponsorshipInfo };

const SHOW_TYPE_LABELS: Record<string, string> = {
  championship: 'Championship Show',
  premier_open: 'Premier Open Show',
  open: 'Open Show',
  limited: 'Limited Show',
  primary: 'Primary Show',
  companion: 'Companion Show',
};

function formatCoverDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  if (timeStr.includes(':') && !timeStr.includes(' ')) {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  return timeStr;
}

interface FrontMatterProps {
  show: CatalogueShowInfo;
}

// ── Reusable components (matching schedule) ─────────────────────

function GoldRule() {
  return <View style={styles.coverGoldRule} />;
}

function SectionBand({ title }: { title: string }) {
  return (
    <View style={styles.sectionBand}>
      <Text style={styles.sectionBandText}>{title}</Text>
    </View>
  );
}

function InfoCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.infoCard} wrap={false}>
      {title && <Text style={styles.infoCardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

function JurisdictionBlock() {
  return (
    <View style={{ width: '100%', marginTop: 10, paddingHorizontal: 8 }} wrap={false}>
      <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textDark, marginBottom: 2 }}>
        Jurisdiction and Responsibilities
      </Text>
      <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 6.5, lineHeight: 1.4, color: C.textMedium }}>
        The Officers and Committee members of the society holding the licence are deemed responsible for organising and conducting the show safely and in accordance with the Rules and Regulations of the Royal Kennel Club and agree to abide by and adopt any decision of the Board or any authority to whom the Board may delegate its powers, subject to the conditions of Regulation F16. In so doing those appointed as Officers and Committee members accept that they are jointly and severally responsible for the organisation of the show and that this is a binding undertaking (vide Royal Kennel Club General Show Regulations F4 and F5).
      </Text>
    </View>
  );
}

function WelcomeNote({ show }: FrontMatterProps) {
  if (!show.welcomeNote) return null;
  return (
    <View style={{ ...styles.coverDetailCard, borderLeftColor: C.accent, marginTop: 8, marginBottom: 4 }} wrap={false}>
      <Text style={styles.coverSectionLabel}>Welcome</Text>
      <Text style={{ fontFamily: 'Times', fontSize: 8, fontStyle: 'italic', color: C.textDark, lineHeight: 1.4 }}>
        {show.welcomeNote}
      </Text>
    </View>
  );
}

// ── Cover Page ──────────────────────────────────────────────────

/** Cover page for the RKC standard catalogue — matching schedule design */
export function CoverPage({ show }: FrontMatterProps) {
  const showTypeLabel = show.showType ? SHOW_TYPE_LABELS[show.showType] : undefined;

  // Show judges on cover for single-breed OR when there's only one unique judge
  // Prefer sex-annotated display list (e.g. "Dogs — Mr A Winfrow") when available
  const judges = show.judgesByBreedName ?? {};
  const uniqueJudgeNames = [...new Set(Object.values(judges))];
  const isSingleBreed = show.showScope === 'single_breed';
  const coverJudges = (show.judgeDisplayList && show.judgeDisplayList.length > 0)
    ? show.judgeDisplayList
    : (isSingleBreed || uniqueJudgeNames.length === 1) ? uniqueJudgeNames : [];

  // Multi-day date display
  const dateDisplay = show.endDate
    ? `${formatCoverDate(show.date)} — ${formatCoverDate(show.endDate)}`
    : formatCoverDate(show.date);

  return (
    <Page size="A5" style={styles.coverPage}>
      {/* Green top band with organisation name */}
      {show.organisation && (
        <View style={styles.coverTopBand}>
          <Text style={styles.coverOrgName}>{show.organisation}</Text>
        </View>
      )}
      {!show.organisation && <View style={{ height: 12 }} />}

      {/* Main cover content */}
      <View style={styles.coverContent}>
        {/* Organisation logo */}
        {show.logoUrl && (
          <Image src={show.logoUrl} style={styles.coverLogo} />
        )}

        {/* Title sponsor logo — prominent, above the show name (matching schedule) */}
        {(() => {
          const titleSponsor = (show.showSponsors ?? []).find((sp) => sp.tier === 'title' && sp.logoUrl);
          if (!titleSponsor) return null;
          return (
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>
                {titleSponsor.customTitle ?? 'Sponsored by'}
              </Text>
              <Image src={titleSponsor.logoUrl!} style={{ maxWidth: 120, maxHeight: 40, objectFit: 'contain' }} />
            </View>
          );
        })()}

        {/* Show name — LibreBaskerville */}
        <Text style={styles.coverShowName}>{show.name}</Text>

        {/* Show type badge */}
        {showTypeLabel && (
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>{showTypeLabel}</Text>
          </View>
        )}

        {/* Show-level sponsor logos below badge (matching schedule) */}
        {(() => {
          const showLevelSponsors = (show.showSponsors ?? []).filter((sp) => sp.tier === 'show' && sp.logoUrl);
          if (showLevelSponsors.length === 0) return null;
          return (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {showLevelSponsors.map((sp, i) => (
                <View key={i} style={{ alignItems: 'center' }}>
                  <Image src={sp.logoUrl!} style={{ maxWidth: 80, maxHeight: 28, objectFit: 'contain' }} />
                  <Text style={{ fontFamily: 'Inter', fontSize: 5.5, color: C.textLight, marginTop: 1 }}>
                    {sp.customTitle ?? sp.name}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* Class count */}
        {show.totalClasses != null && show.totalClasses > 0 && (
          <Text style={{ fontFamily: 'Inter', fontSize: 8, color: C.textMedium, marginTop: 2, marginBottom: 2 }}>
            {show.totalClasses} Class{show.totalClasses !== 1 ? 'es' : ''}
          </Text>
        )}

        {/* RKC jurisdiction */}
        <Text style={styles.coverRegulatory}>
          Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
        </Text>

        <GoldRule />

        {/* Key details card with gold left border — matching schedule layout */}
        <View style={styles.coverDetailCard}>
          <View style={styles.coverDetailRow}>
            <Text style={styles.coverDetailLabel}>Date</Text>
            <Text style={styles.coverDetailValue}>{dateDisplay}</Text>
          </View>
          {show.venue && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Venue</Text>
              <Text style={styles.coverDetailValue}>
                {[show.venue, show.venueAddress].filter(Boolean).join(', ').replace(/,\s*,/g, ',').trim()}
              </Text>
            </View>
          )}
          {coverJudges.length > 0 && coverJudges.map((j, i) => (
            <View key={i} style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>{i === 0 ? (coverJudges.length === 1 ? 'Judge' : 'Judges') : ''}</Text>
              <Text style={styles.coverDetailValue}>{j}</Text>
            </View>
          ))}
          {show.showOpenTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Show Opens</Text>
              <Text style={styles.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Judging Starts</Text>
              <Text style={styles.coverDetailValue}>{formatTime(show.startTime)}</Text>
            </View>
          )}
          {show.kcLicenceNo && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Licence</Text>
              <Text style={styles.coverDetailValue}>{show.kcLicenceNo}</Text>
            </View>
          )}
        </View>

        {/* Outside attraction — mandatory RKC notice, displayed prominently */}
        {show.outsideAttraction && (
          <View style={{
            backgroundColor: '#fef2f2',
            borderWidth: 1,
            borderColor: '#dc2626',
            borderRadius: 4,
            padding: '6 10',
            marginTop: 4,
            marginBottom: 2,
          }}>
            <Text style={{
              fontFamily: 'Inter',
              fontSize: 8,
              fontWeight: 'bold',
              color: '#dc2626',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}>
              Please Note: Outside Attraction — RKC Regulation F(1) 16H will be strictly enforced
            </Text>
          </View>
        )}

        {/* Custom statements — compact on cover */}
        {show.customStatements && show.customStatements.length > 0 && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 1, paddingHorizontal: 8 }}>
            {show.customStatements.map((statement, i) => (
              <Text key={i} style={{
                fontFamily: 'Inter',
                fontSize: 6.5,
                fontWeight: 'bold',
                color: C.textDark,
                textAlign: 'center',
                textTransform: 'uppercase',
                marginTop: i > 0 ? 1 : 0,
              }}>
                {statement}
              </Text>
            ))}
          </View>
        )}

        {/* Regulatory statements — group system + wet weather */}
        {show.judgedOnGroupSystem && (
          <Text style={{
            fontFamily: 'Inter',
            fontSize: 6.5,
            fontWeight: 'bold',
            color: C.textDark,
            textAlign: 'center',
            textTransform: 'uppercase',
            marginTop: 2,
          }}>
            Judged on the Group System
          </Text>
        )}
        {show.wetWeatherAccommodation === false && (
          <Text style={{
            fontFamily: 'Inter',
            fontSize: 6.5,
            color: C.textMedium,
            textAlign: 'center',
            marginTop: 1,
          }}>
            No wet weather accommodation is provided
          </Text>
        )}

        {/* Secretary details — green left border (matching schedule) */}
        {(show.secretaryName || show.secretaryEmail || show.secretaryPhone) && (
          <View style={{ ...styles.coverDetailCard, borderLeftColor: C.primary, marginTop: 4 }}>
            <Text style={styles.coverSectionLabel}>Show Secretary</Text>
            {show.secretaryName && (
              <Text style={styles.coverSectionText}>{show.secretaryName}</Text>
            )}
            {show.secretaryAddress && (
              <Text style={styles.coverSectionText}>{show.secretaryAddress}</Text>
            )}
            {show.secretaryPhone && (
              <Text style={styles.coverSectionText}>Tel: {show.secretaryPhone}</Text>
            )}
            {show.secretaryEmail && (
              <Text style={styles.coverSectionText}>{show.secretaryEmail}</Text>
            )}
          </View>
        )}

        {/* On-call vet + show manager — compact */}
        {(show.onCallVet || show.showManager) && (
          <View style={{ width: '100%', marginTop: 2 }}>
            {show.onCallVet && (
              <View style={{ marginBottom: 2 }}>
                <Text style={styles.coverSectionLabel}>On-Call Veterinary Surgeon</Text>
                <Text style={styles.coverSectionText}>{show.onCallVet}</Text>
              </View>
            )}
            {show.showManager && (
              <View style={{ marginBottom: 2 }}>
                <Text style={styles.coverSectionLabel}>Show Manager</Text>
                <Text style={styles.coverSectionText}>{show.showManager}</Text>
              </View>
            )}
          </View>
        )}

        {/* Show-level sponsors on cover — logos displayed prominently */}
        {show.showSponsors && show.showSponsors.length > 0 && (() => {
          const tierSponsors = show.showSponsors!.filter(sp => sp.tier === 'title' || sp.tier === 'show');
          const supporterSponsors = show.showSponsors!.filter(sp => sp.tier !== 'title' && sp.tier !== 'show');
          return (
            <View style={{ width: '100%', marginTop: 6, marginBottom: 4 }}>
              {tierSponsors.length > 0 && (
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textLight, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                    {tierSponsors.length === 1 ? 'Sponsored by' : 'Sponsors'}
                  </Text>
                  {tierSponsors.map((sp, i) => (
                    <View key={i} style={{ alignItems: 'center', marginBottom: 4 }}>
                      {sp.logoUrl && (
                        <Image src={sp.logoUrl} style={{ width: 100, height: 50, objectFit: 'contain', marginBottom: 3 }} />
                      )}
                      <Text style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', color: C.textDark }}>
                        {sp.customTitle ? `${sp.customTitle}: ` : ''}{sp.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {supporterSponsors.length > 0 && (
                <View style={{ ...styles.coverDetailCard, borderLeftColor: C.accent }}>
                  <Text style={styles.coverSectionLabel}>With grateful thanks to</Text>
                  {supporterSponsors.map((sp, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                      {sp.logoUrl && (
                        <Image src={sp.logoUrl} style={{ width: 30, height: 15, objectFit: 'contain', marginRight: 6 }} />
                      )}
                      <Text style={{ fontFamily: 'Inter', fontSize: 7.5, color: C.textMedium }}>
                        {sp.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Docking statement — mandatory per F(1).7.c(2) */}
        {show.dockingStatement && (
          <Text style={{
            fontFamily: 'Times',
            fontSize: 7,
            fontStyle: 'italic',
            color: C.textMedium,
            textAlign: 'center',
            marginTop: 4,
            marginBottom: 2,
            paddingHorizontal: 8,
          }}>
            {show.dockingStatement}
          </Text>
        )}

        <Text style={styles.coverFooterText}>
          Generated by Remi  ·  remishowmanager.co.uk
        </Text>
      </View>

      {/* Green bottom band */}
      <View style={styles.coverBottomBand} />
    </Page>
  );
}

// ── Judges List Page ────────────────────────────────────────────

/** Judges list page — breed -> judge name table with optional bios */
export function JudgesListPage({ show }: FrontMatterProps) {
  const judges = show.judgesByBreedName ?? {};
  const judgeBios = show.judgeBios ?? {};
  const ringNumbers = show.judgeRingNumbers ?? {};
  const hasRings = Object.keys(ringNumbers).length > 0;
  const sortedBreeds = Object.keys(judges).sort();

  // For single-breed shows where judgesByBreedName is empty, show the display list instead
  if (sortedBreeds.length === 0 && show.judgeDisplayList && show.judgeDisplayList.length > 0) {
    return (
      <Page size="A5" style={styles.frontMatterPage} wrap>
        <SectionBand title="List of Judges" />
        {show.judgeDisplayList.map((label, i) => (
          <Text key={i} style={{ fontFamily: 'Inter', fontSize: 9, textAlign: 'center', marginBottom: 4, color: C.textDark }}>
            {label}
          </Text>
        ))}
        <WelcomeNote show={show} />
        <JurisdictionBlock />
      </Page>
    );
  }

  if (sortedBreeds.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="List of Judges" />

      {/* Table header */}
      <View style={{ ...styles.judgesListRow, borderBottomWidth: 1.5, borderBottomColor: C.primary, marginBottom: 4 }}>
        <Text style={{ ...styles.judgesListBreed, fontWeight: 'bold' }}>Breed</Text>
        <Text style={{ ...styles.judgesListJudge, fontWeight: 'bold' }}>Judge</Text>
        {hasRings && (
          <Text style={{ fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', width: 30, textAlign: 'right' }}>Ring</Text>
        )}
      </View>

      {sortedBreeds.map((breed) => {
        const judgeName = judges[breed];
        const ringNo = ringNumbers[breed];
        const bio = judgeBios[judgeName ?? ''];
        const photoUrl = show.judgePhotos?.[judgeName ?? ''];
        return (
          <View key={breed} wrap={false}>
            <View style={styles.judgesListRow}>
              <Text style={styles.judgesListBreed}>{breed}</Text>
              <Text style={styles.judgesListJudge}>{judgeName}</Text>
              {hasRings && (
                <Text style={{ fontFamily: 'Inter', fontSize: 7.5, width: 30, textAlign: 'right', color: ringNo ? C.textDark : C.textLight }}>
                  {ringNo ?? '—'}
                </Text>
              )}
            </View>
            {(bio || photoUrl) && (
              <View style={{ flexDirection: 'row', paddingLeft: 6, paddingTop: 2, paddingBottom: 4, gap: 6 }}>
                {photoUrl && (
                  <Image src={photoUrl} style={{ width: 36, height: 36, borderRadius: 18 }} />
                )}
                {bio && (
                  <Text style={{ ...styles.judgeBio, flex: 1, marginBottom: 0 }}>{bio}</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      <WelcomeNote show={show} />
      <JurisdictionBlock />

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`
        }
        fixed
      />
    </Page>
  );
}

// ── Class Definitions Page ──────────────────────────────────────

/** Class definitions page — name + description for each class */
export function ClassDefinitionsPage({ show }: FrontMatterProps) {
  const defs = show.classDefinitions ?? [];

  // Always render if we have any class definitions (RKC F(1)11 requirement)
  if (defs.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Definitions of Classes" />

      {defs.map((def) => (
        <View key={def.name} wrap={false}>
          <Text style={styles.classDefName}>{def.name}</Text>
          {def.description && (
            <Text style={styles.classDefDescription}>{def.description}</Text>
          )}
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
  );
}

// ── Exhibitor Index (Championship shows — RKC F(1).11.b(6)) ───

type ExhibitorIndexEntry = Pick<
  CatalogueEntry,
  'exhibitor' | 'exhibitorId' | 'catalogueNumber' | 'owners' | 'classes' | 'withholdFromPublication' | 'breed'
>;

interface ExhibitorIndexPageProps {
  show: CatalogueShowInfo;
  entries: ExhibitorIndexEntry[];
  /**
   * When set, renders a per-breed exhibitor index with the breed name in the
   * heading. Used for multi-breed championship shows where RKC F(1).11.b(6)
   * requires each breed section to start with its own alphabetical index.
   * Callers are responsible for filtering `entries` to just that breed.
   */
  breedName?: string;
}

/**
 * Alphabetical exhibitor index — required by RKC F(1).11.b(6) for
 * championship shows. Lists each exhibitor with their catalogue numbers
 * and classes entered, sorted alphabetically by exhibitor name.
 *
 * Called by ExhibitorIndexPage (front-matter, single-breed champ shows) and
 * by createBreedIndexRenderer (per-breed, multi-breed champ shows). Callers
 * are responsible for the `showType === 'championship'` check; this component
 * focuses on rendering.
 *
 * Entries where the exhibitor has requested withholding from publication
 * per F(1).11.b.(6)/(8) are excluded from the index entirely.
 */
export function ExhibitorIndexPage({ show, entries, breedName }: ExhibitorIndexPageProps) {
  const byExhibitor = new Map<string, { name: string; address?: string; catNos: string[]; classes: string[] }>();
  for (const entry of entries) {
    if (entry.withholdFromPublication) continue;
    const name = entry.exhibitor ?? entry.owners[0]?.name ?? 'Unknown';
    const key = name.toUpperCase();
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        name: name.toUpperCase(),
        address: entry.owners[0]?.address ?? undefined,
        catNos: [],
        classes: [],
      });
    }
    const ex = byExhibitor.get(key)!;
    if (entry.catalogueNumber && !ex.catNos.includes(entry.catalogueNumber)) {
      ex.catNos.push(entry.catalogueNumber);
    }
    for (const cls of entry.classes) {
      const label = cls.classNumber != null ? `${cls.classNumber}` : cls.name ?? '';
      if (label && !ex.classes.includes(label)) ex.classes.push(label);
    }
  }

  const sorted = Array.from(byExhibitor.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) return null;

  const title = breedName ? `Exhibitor Index — ${breedName}` : 'Exhibitor Index';

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title={title} />
      <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: C.primary, paddingBottom: 3, marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '40%', color: C.textDark }}>Exhibitor</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '20%', color: C.textDark }}>Cat No(s)</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '40%', color: C.textDark }}>Classes</Text>
      </View>
      {sorted.map((ex, idx) => (
        <View key={idx} wrap={false} style={{ flexDirection: 'row', paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: C.ruleLight }}>
          <View style={{ width: '40%', paddingRight: 4 }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textDark }}>{ex.name}</Text>
            {ex.address && <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textLight }}>{ex.address}</Text>}
          </View>
          <Text style={{ fontFamily: 'Inter', fontSize: 7, width: '20%', color: C.textDark }}>
            {ex.catNos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ')}
          </Text>
          <Text style={{ fontFamily: 'Inter', fontSize: 6.5, width: '40%', color: C.textMedium }}>
            {ex.classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ')}
          </Text>
        </View>
      ))}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

/** True when the show requires per-breed exhibitor indexes instead of a single
 *  front-matter index — RKC F(1).11.b(6) applies to multi-breed champ shows. */
export function isMultiBreedChampionship(
  show: Pick<CatalogueShowInfo, 'showType' | 'showScope'>,
): boolean {
  return show.showType === 'championship' && show.showScope !== 'single_breed';
}

/**
 * Builds a per-breed exhibitor-index renderer for multi-breed champ shows.
 *
 * Entries are bucketed by breed name in a single O(n) pass up front, so each
 * `render(breedName)` call is O(1) — no filter-inside-map-loop scaling.
 *
 * The returned function is a closure with private first-occurrence state: it
 * renders an index the first time a breed is seen and `null` on subsequent
 * calls, so callers can invoke it once per breed page without worrying about
 * deduping. When `enabled` is false (non-champ shows, single-breed champ shows),
 * it always returns `null` and skips the bucketing work entirely.
 */
export function createBreedIndexRenderer(
  show: CatalogueShowInfo,
  entries: ExhibitorIndexEntry[],
  enabled: boolean,
): (breedName: string) => ReactNode {
  if (!enabled) return () => null;

  const entriesByBreed = new Map<string, ExhibitorIndexEntry[]>();
  for (const entry of entries) {
    if (!entry.breed) continue;
    const bucket = entriesByBreed.get(entry.breed);
    if (bucket) bucket.push(entry);
    else entriesByBreed.set(entry.breed, [entry]);
  }

  const rendered = new Set<string>();
  return (breedName: string) => {
    if (rendered.has(breedName)) return null;
    const breedEntries = entriesByBreed.get(breedName);
    if (!breedEntries || breedEntries.length === 0) return null;
    rendered.add(breedName);
    return (
      <ExhibitorIndexPage
        show={show}
        entries={breedEntries}
        breedName={breedName}
      />
    );
  };
}

// ── Trophies & Sponsorships Page ────────────────────────────────

interface TrophiesPageProps {
  show: CatalogueShowInfo;
  sponsorships: ClassSponsorshipInfo[];
}

/** Trophies & Sponsorships front-matter page — compact table layout */
export function TrophiesPage({ show, sponsorships }: TrophiesPageProps) {
  if (sponsorships.length === 0) return null;

  // Sort by class number, then class name
  const sorted = [...sponsorships].sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return a.className.localeCompare(b.className);
  });

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Trophies & Sponsorships" />

      {/* Table header */}
      <View style={{
        flexDirection: 'row',
        borderBottomWidth: 1.5,
        borderBottomColor: C.primary,
        paddingBottom: 3,
        marginBottom: 4,
      }}>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '30%', color: C.textDark }}>Class</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '35%', color: C.textDark }}>Trophy / Sponsor</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '35%', color: C.textDark }}>Prize</Text>
      </View>

      {sorted.map((sp, idx) => {
        const classLabel = sp.classNumber != null
          ? `${sp.classNumber}. ${sp.className}`
          : sp.className;

        // Build trophy + sponsor combined text
        const trophySponsorParts: string[] = [];
        if (sp.trophyName) {
          let part = sp.trophyName;
          if (sp.trophyDonor) part += ` (${sp.trophyDonor})`;
          trophySponsorParts.push(part);
        }
        if (sp.sponsorName) {
          let part = `Sponsored by ${sp.sponsorName}`;
          if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
          trophySponsorParts.push(part);
        }

        return (
          <View
            key={`${sp.classNumber}-${sp.className}-${idx}`}
            wrap={false}
            style={{
              flexDirection: 'row',
              paddingVertical: 2.5,
              borderBottomWidth: 0.5,
              borderBottomColor: C.ruleLight,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', width: '30%', color: C.textDark }}>
              {classLabel}
            </Text>
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, fontStyle: 'italic', width: '35%', color: C.textMedium }}>
              {trophySponsorParts.join('\n') || '—'}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 6.5, width: '35%', color: C.textMedium }}>
              {sp.prizeDescription || '—'}
            </Text>
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
  );
}
