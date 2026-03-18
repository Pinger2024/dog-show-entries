import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, C } from './catalogue-styles';
import type { CatalogueShowInfo } from './catalogue-standard';

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

// ── Cover Page ──────────────────────────────────────────────────

/** Cover page for the RKC standard catalogue — matching schedule design */
export function CoverPage({ show }: FrontMatterProps) {
  const showTypeLabel = show.showType ? SHOW_TYPE_LABELS[show.showType] : undefined;

  // For single-breed shows, extract the single judge name from judgesByBreedName
  const judges = show.judgesByBreedName ?? {};
  const uniqueJudgeNames = [...new Set(Object.values(judges))];
  const isSingleBreed = show.showScope === 'single_breed';
  const coverJudges = isSingleBreed ? uniqueJudgeNames : [];

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

        {/* Show name — LibreBaskerville */}
        <Text style={styles.coverShowName}>{show.name}</Text>

        {/* Show type badge */}
        {showTypeLabel && (
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>{showTypeLabel}</Text>
          </View>
        )}

        {/* "CATALOGUE" label */}
        <Text style={{
          fontFamily: 'Inter',
          fontSize: 8,
          color: C.textLight,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Catalogue
        </Text>

        {/* RKC jurisdiction */}
        <Text style={styles.coverRegulatory}>
          Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
        </Text>

        <GoldRule />

        {/* Key details card with gold left border */}
        <View style={styles.coverDetailCard}>
          <View style={styles.coverDetailRow}>
            <Text style={styles.coverDetailLabel}>Date</Text>
            <Text style={styles.coverDetailValue}>{formatCoverDate(show.date)}</Text>
          </View>
          {show.venue && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Venue</Text>
              <Text style={styles.coverDetailValue}>
                {show.venue}{show.venueAddress ? `, ${show.venueAddress}` : ''}
              </Text>
            </View>
          )}
          {coverJudges.length > 0 && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>
                {coverJudges.length === 1 ? 'Judge' : 'Judges'}
              </Text>
              <Text style={styles.coverDetailValue}>
                {coverJudges.join(', ')}
              </Text>
            </View>
          )}
          {show.kcLicenceNo && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Licence</Text>
              <Text style={styles.coverDetailValue}>{show.kcLicenceNo}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Judging</Text>
              <Text style={styles.coverDetailValue}>Commences at {formatTime(show.startTime)}</Text>
            </View>
          )}
        </View>

        {/* Custom statements — prominently on cover page */}
        {show.customStatements && show.customStatements.length > 0 && (
          <View style={{ width: '100%', marginTop: 4, marginBottom: 2, paddingHorizontal: 8 }}>
            {show.customStatements.map((statement, i) => (
              <Text key={i} style={{
                fontFamily: 'Inter',
                fontSize: 7.5,
                fontWeight: 'bold',
                color: C.textDark,
                textAlign: 'center',
                textTransform: 'uppercase',
                marginTop: i > 0 ? 3 : 0,
              }}>
                {statement}
              </Text>
            ))}
          </View>
        )}

        {/* Secretary details — green left border */}
        {show.secretaryEmail && (
          <View style={{ ...styles.coverDetailCard, borderLeftColor: C.primary }}>
            <Text style={styles.coverSectionLabel}>Show Secretary</Text>
            <Text style={styles.coverSectionText}>{show.secretaryEmail}</Text>
          </View>
        )}

        {/* Show-level sponsors on cover */}
        {show.showSponsors && show.showSponsors.length > 0 && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 4 }}>
            {show.showSponsors.filter(sp => sp.tier === 'title' || sp.tier === 'show').length > 0 && (
              <View style={{ ...styles.coverDetailCard, borderLeftColor: C.accent }}>
                <Text style={styles.coverSectionLabel}>Sponsors</Text>
                {show.showSponsors
                  .filter(sp => sp.tier === 'title' || sp.tier === 'show')
                  .map((sp, i) => (
                    <Text key={i} style={{
                      fontFamily: 'Inter',
                      fontSize: 8,
                      color: C.textDark,
                      marginBottom: 1,
                    }}>
                      {sp.customTitle ? `${sp.customTitle}: ` : ''}{sp.name}
                    </Text>
                  ))}
              </View>
            )}
            {show.showSponsors.filter(sp => sp.tier !== 'title' && sp.tier !== 'show').length > 0 && (
              <View style={{ ...styles.coverDetailCard, borderLeftColor: C.accent }}>
                <Text style={styles.coverSectionLabel}>With grateful thanks to</Text>
                {show.showSponsors
                  .filter(sp => sp.tier !== 'title' && sp.tier !== 'show')
                  .map((sp, i) => (
                    <Text key={i} style={{
                      fontFamily: 'Inter',
                      fontSize: 7.5,
                      color: C.textMedium,
                      marginBottom: 1,
                    }}>
                      {sp.name}
                    </Text>
                  ))}
              </View>
            )}
          </View>
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
  const sortedBreeds = Object.keys(judges).sort();

  if (sortedBreeds.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="List of Judges" />

      {/* Table header */}
      <View style={{ ...styles.judgesListRow, borderBottomWidth: 1.5, borderBottomColor: C.primary, marginBottom: 4 }}>
        <Text style={{ ...styles.judgesListBreed, fontWeight: 'bold' }}>Breed</Text>
        <Text style={{ ...styles.judgesListJudge, fontWeight: 'bold' }}>Judge</Text>
      </View>

      {sortedBreeds.map((breed) => {
        const judgeName = judges[breed];
        const bio = judgeBios[judgeName ?? ''];
        return (
          <View key={breed} wrap={false}>
            <View style={styles.judgesListRow}>
              <Text style={styles.judgesListBreed}>{breed}</Text>
              <Text style={styles.judgesListJudge}>{judgeName}</Text>
            </View>
            {bio && (
              <Text style={styles.judgeBio}>{bio}</Text>
            )}
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

// ── Class Definitions Page ──────────────────────────────────────

/** Class definitions page — name + description for each class */
export function ClassDefinitionsPage({ show }: FrontMatterProps) {
  const defs = show.classDefinitions ?? [];

  // Only render if we have at least one definition with a description
  const defsWithDesc = defs.filter((d) => d.description);
  if (defsWithDesc.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Definitions of Classes" />

      {defsWithDesc.map((def) => (
        <View key={def.name} wrap={false}>
          <Text style={styles.classDefName}>{def.name}</Text>
          <Text style={styles.classDefDescription}>{def.description}</Text>
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

// ── Trophies & Sponsorships Page ────────────────────────────────

export interface ClassSponsorshipInfo {
  className: string;
  classNumber: number | null;
  trophyName: string | null;
  trophyDonor: string | null;
  sponsorName: string | null;
  sponsorAffix: string | null;
  prizeDescription: string | null;
}

interface TrophiesPageProps {
  show: CatalogueShowInfo;
  sponsorships: ClassSponsorshipInfo[];
}

/** Trophies & Sponsorships front-matter page */
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

      {sorted.map((sp, idx) => {
        const classLabel = sp.classNumber != null
          ? `Class ${sp.classNumber}. ${sp.className}`
          : sp.className;

        // Build trophy/sponsor description lines
        const lines: string[] = [];
        if (sp.trophyName) {
          let trophyLine = `Trophy: ${sp.trophyName}`;
          if (sp.trophyDonor) trophyLine += ` — donated by ${sp.trophyDonor}`;
          lines.push(trophyLine);
        }
        if (sp.sponsorName) {
          let sponsorLine = `Sponsored by ${sp.sponsorName}`;
          if (sp.sponsorAffix) sponsorLine += ` (${sp.sponsorAffix})`;
          lines.push(sponsorLine);
        }
        if (sp.prizeDescription) {
          lines.push(sp.prizeDescription);
        }

        return (
          <InfoCard key={`${sp.classNumber}-${sp.className}-${idx}`}>
            <Text style={{
              fontFamily: 'Inter',
              fontSize: 8,
              fontWeight: 'bold',
              color: C.textDark,
              marginBottom: 2,
            }}>
              {classLabel}
            </Text>
            {lines.map((line, i) => (
              <Text key={i} style={styles.sponsorLine}>
                {line}
              </Text>
            ))}
          </InfoCard>
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
