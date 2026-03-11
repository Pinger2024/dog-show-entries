import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import path from 'path';
import type { ScheduleData } from '@/server/db/schema/shows';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface ScheduleShowInfo {
  name: string;
  showType: string;
  showScope: string;
  date: string;
  endDate: string;
  startTime: string | null;
  entriesOpenDate: string | null;
  entryCloseDate: string | null;
  postalCloseDate: string | null;
  kcLicenceNo: string | null;
  secretaryEmail: string | null;
  secretaryName: string | null;
  secretaryAddress: string | null;
  secretaryPhone: string | null;
  showOpenTime: string | null;
  onCallVet: string | null;
  description: string | null;
  firstEntryFee: number | null;
  subsequentEntryFee: number | null;
  nfcEntryFee: number | null;
  acceptsPostalEntries: boolean;
  scheduleData: ScheduleData | null;
  organisation: {
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  venue: {
    name: string;
    address: string | null;
    postcode: string | null;
  } | null;
}

export interface ScheduleClass {
  classNumber: number | null;
  className: string;
  classDescription: string | null;
  sex: string | null;
  breedName: string | null;
}

export interface ScheduleJudge {
  name: string;
  breeds: string[];
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
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

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** Calculate awards estimation date: 7 days before entry close */
function getEstimationDate(closeDate: string | null): string | null {
  if (!closeDate) return null;
  const d = new Date(closeDate);
  d.setDate(d.getDate() - 7);
  return formatShortDate(d.toISOString());
}

/** Get the correct docking statement based on country and public admission */
function getDockingStatement(sd: ScheduleData | null): string {
  const country = sd?.country ?? 'england';
  const publicFee = sd?.publicAdmission !== false;

  if (publicFee && country === 'england') {
    return 'A dog docked on or after 6 April 2007 may not be entered for exhibition at this show.';
  }
  if (publicFee && country === 'wales') {
    return 'A dog docked on or after 28th March 2007 may not be entered for exhibition at this show.';
  }
  // England/Wales no fee, Scotland, NI
  return 'Only undocked dogs and legally docked dogs may be entered for exhibition at this show.';
}

// ── A5 styles (420pt × 595pt) ──
const s = StyleSheet.create({
  // ── Cover page ──
  coverPage: {
    fontFamily: 'Times',
    padding: '40 30 36 30',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  coverLogo: {
    width: 70,
    height: 70,
    marginBottom: 10,
  },
  coverOrg: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    marginBottom: 6,
    textAlign: 'center',
    color: '#333',
  },
  coverShowName: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  coverShowType: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 2,
    textAlign: 'center',
    color: '#444',
  },
  coverClassCount: {
    fontSize: 9,
    marginBottom: 6,
    textAlign: 'center',
    color: '#555',
  },
  coverRegulatory: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  coverRule: {
    width: '40%',
    borderBottomWidth: 0.75,
    borderBottomColor: '#999',
    marginVertical: 8,
  },
  coverDetailRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  coverDetailLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#888',
    width: 65,
    textAlign: 'right',
    marginRight: 6,
  },
  coverDetailValue: {
    fontSize: 9,
    color: '#333',
  },
  coverSection: {
    marginTop: 8,
    width: '100%',
    paddingHorizontal: 20,
  },
  coverSectionTitle: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  coverSectionText: {
    fontSize: 8.5,
    color: '#333',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  // ── Content pages ──
  page: {
    fontFamily: 'Times',
    fontSize: 8.5,
    padding: '28 25 36 25',
    lineHeight: 1.35,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1.2,
    marginBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 4,
  },
  // ── Judges ──
  judgeRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  judgeName: {
    fontSize: 8.5,
    fontWeight: 'bold',
    width: '35%',
  },
  judgeBreeds: {
    fontSize: 8.5,
    width: '65%',
    color: '#333',
  },
  // ── Info ──
  infoBlock: {
    marginBottom: 7,
  },
  infoLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#555',
    marginBottom: 1.5,
  },
  infoText: {
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  feeLabel: {
    fontSize: 8.5,
  },
  feeValue: {
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  // ── Class table ──
  classTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.2,
    borderBottomColor: '#000',
    paddingBottom: 2,
    marginBottom: 3,
  },
  classRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  colClassNo: { width: '8%' },
  colClassName: { width: '32%' },
  colClassSex: { width: '12%' },
  colClassBreed: { width: '20%' },
  colClassDesc: { width: '28%' },
  classHeaderText: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  classCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  classCell: {
    fontSize: 8,
  },
  classCellItalic: {
    fontSize: 7,
    fontStyle: 'italic',
    color: '#555',
  },
  // ── Definitions ──
  defBlock: {
    marginBottom: 4,
  },
  defName: {
    fontSize: 8.5,
    fontWeight: 'bold',
    marginBottom: 0.5,
  },
  defDescription: {
    fontSize: 7.5,
    color: '#333',
    lineHeight: 1.35,
  },
  // ── Regulatory notice ──
  noticeBlock: {
    marginBottom: 5,
    padding: 5,
    borderWidth: 0.5,
    borderColor: '#ccc',
  },
  noticeTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 7,
    lineHeight: 1.5,
    color: '#333',
  },
  noticeTextBold: {
    fontSize: 7,
    fontWeight: 'bold',
    lineHeight: 1.5,
  },
  // ── Entry form ──
  formField: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  formLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    width: 90,
  },
  formLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    height: 14,
  },
  formClassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  formClassBox: {
    width: '18%',
    marginRight: '2%',
    marginBottom: 5,
    borderWidth: 0.5,
    borderColor: '#999',
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formClassBoxLabel: {
    fontSize: 6,
    color: '#999',
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 25,
    right: 25,
    textAlign: 'center',
    fontSize: 6,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 3,
  },
});

export function ShowSchedule({
  show,
  classes,
  judges,
}: {
  show: ScheduleShowInfo;
  classes: ScheduleClass[];
  judges: ScheduleJudge[];
}) {
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const showDate = formatDate(show.date);
  const classCount = classes.length;
  const sd = show.scheduleData;

  // Docking statement
  const dockingStatement = getDockingStatement(sd);

  // Awards estimation date
  const estimationDate = getEstimationDate(show.entryCloseDate);

  // Deduplicate class definitions
  const seenDefs = new Set<string>();
  const classDefinitions: { name: string; description: string }[] = [];
  for (const cls of classes) {
    if (cls.classDescription && !seenDefs.has(cls.className)) {
      seenDefs.add(cls.className);
      classDefinitions.push({ name: cls.className, description: cls.classDescription });
    }
  }

  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${show.name} — Schedule — Page ${pageNumber} of ${totalPages}`;

  return (
    <Document title={`Schedule — ${show.name}`} author="Remi Show Manager">
      {/* ── Cover Page ── */}
      <Page size="A5" style={s.coverPage}>
        {show.organisation?.logoUrl && (
          <Image src={show.organisation.logoUrl} style={s.coverLogo} />
        )}

        {show.organisation && (
          <Text style={s.coverOrg}>{show.organisation.name}</Text>
        )}

        <Text style={s.coverShowName}>{show.name}</Text>
        <Text style={s.coverShowType}>{showTypeLabel}</Text>
        <Text style={s.coverClassCount}>
          {classCount} Class{classCount !== 1 ? 'es' : ''}
        </Text>

        <Text style={s.coverRegulatory}>
          Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
        </Text>

        {/* Group system notice */}
        {sd?.judgedOnGroupSystem && (
          <Text style={{ ...s.coverRegulatory, marginTop: 0 }}>
            Judged on the Group System
          </Text>
        )}

        <View style={s.coverRule} />

        {/* Key details */}
        <View style={s.coverDetailRow}>
          <Text style={s.coverDetailLabel}>Date</Text>
          <Text style={s.coverDetailValue}>{showDate}</Text>
        </View>

        {show.venue && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>Venue</Text>
            <Text style={s.coverDetailValue}>
              {show.venue.name}
              {show.venue.address ? `, ${show.venue.address}` : ''}
              {show.venue.postcode ? ` ${show.venue.postcode}` : ''}
            </Text>
          </View>
        )}

        {judges.length > 0 && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>Judge</Text>
            <Text style={s.coverDetailValue}>
              {judges.map((j) => j.name).join(', ')}
            </Text>
          </View>
        )}

        {show.startTime && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>Judging</Text>
            <Text style={s.coverDetailValue}>{formatTime(show.startTime)}</Text>
          </View>
        )}

        {show.showOpenTime && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>Doors Open</Text>
            <Text style={s.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
          </View>
        )}

        {sd?.latestArrivalTime && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>Dogs By</Text>
            <Text style={s.coverDetailValue}>{sd.latestArrivalTime}</Text>
          </View>
        )}

        {show.kcLicenceNo && (
          <View style={s.coverDetailRow}>
            <Text style={s.coverDetailLabel}>KC Licence</Text>
            <Text style={s.coverDetailValue}>{show.kcLicenceNo}</Text>
          </View>
        )}

        <View style={s.coverRule} />

        {/* Docking statement */}
        <Text style={{ fontSize: 7, fontStyle: 'italic', color: '#555', textAlign: 'center', marginTop: 2, marginBottom: 4, paddingHorizontal: 15 }}>
          {dockingStatement}
        </Text>

        {/* Wet weather */}
        {sd?.wetWeatherAccommodation === false && (
          <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 4 }}>
            NO WET WEATHER ACCOMMODATION IS PROVIDED
          </Text>
        )}
        {sd?.wetWeatherAccommodation === true && (
          <Text style={{ fontSize: 7, color: '#555', textAlign: 'center', marginBottom: 4 }}>
            Wet weather accommodation is available
          </Text>
        )}

        {/* Secretary details */}
        {(show.secretaryName || show.secretaryEmail) && (
          <View style={s.coverSection}>
            <Text style={s.coverSectionTitle}>Show Secretary</Text>
            {show.secretaryName && (
              <Text style={s.coverSectionText}>{show.secretaryName}</Text>
            )}
            {show.secretaryAddress && (
              <Text style={s.coverSectionText}>{show.secretaryAddress}</Text>
            )}
            {show.secretaryPhone && (
              <Text style={s.coverSectionText}>Tel: {show.secretaryPhone}</Text>
            )}
            {show.secretaryEmail && (
              <Text style={s.coverSectionText}>{show.secretaryEmail}</Text>
            )}
          </View>
        )}

        {/* On-call vet */}
        {show.onCallVet && (
          <View style={{ ...s.coverSection, marginTop: 6 }}>
            <Text style={s.coverSectionTitle}>On-Call Veterinary Surgeon</Text>
            <Text style={s.coverSectionText}>{show.onCallVet}</Text>
          </View>
        )}

        {/* Show Manager */}
        {sd?.showManager && (
          <View style={{ ...s.coverSection, marginTop: 4 }}>
            <Text style={s.coverSectionTitle}>Show Manager</Text>
            <Text style={s.coverSectionText}>{sd.showManager}</Text>
          </View>
        )}

        {/* Online entries */}
        <View style={{ ...s.coverSection, marginTop: 10 }}>
          <Text style={{ ...s.coverSectionText, fontSize: 7.5, color: '#666' }}>
            Enter online at remishowmanager.co.uk
          </Text>
        </View>

        {show.organisation?.website && (
          <View style={{ ...s.coverSection, marginTop: 2 }}>
            <Text style={{ ...s.coverSectionText, fontSize: 7.5, color: '#666' }}>
              {show.organisation.website}
            </Text>
          </View>
        )}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Entry Information Page ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Entry Information</Text>

        {/* Fees */}
        {(show.firstEntryFee || show.subsequentEntryFee || show.nfcEntryFee) && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Entry Fees</Text>
            {show.firstEntryFee != null && (
              <View style={s.feeRow}>
                <Text style={s.feeLabel}>First entry</Text>
                <Text style={s.feeValue}>{formatPence(show.firstEntryFee)}</Text>
              </View>
            )}
            {show.subsequentEntryFee != null && (
              <View style={s.feeRow}>
                <Text style={s.feeLabel}>Subsequent entry (same owner)</Text>
                <Text style={s.feeValue}>{formatPence(show.subsequentEntryFee)}</Text>
              </View>
            )}
            {show.nfcEntryFee != null && (
              <View style={s.feeRow}>
                <Text style={s.feeLabel}>Not for Competition</Text>
                <Text style={s.feeValue}>{formatPence(show.nfcEntryFee)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Important dates */}
        <View style={s.infoBlock}>
          <Text style={s.infoLabel}>Important Dates</Text>
          {show.entriesOpenDate && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Entries open</Text>
              <Text style={s.feeValue}>{formatShortDate(show.entriesOpenDate)}</Text>
            </View>
          )}
          {show.entryCloseDate && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Online entries close</Text>
              <Text style={s.feeValue}>{formatShortDate(show.entryCloseDate)}</Text>
            </View>
          )}
          {show.postalCloseDate && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Postal entries close</Text>
              <Text style={s.feeValue}>{formatShortDate(show.postalCloseDate)}</Text>
            </View>
          )}
          {estimationDate && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Date for estimating awards won</Text>
              <Text style={s.feeValue}>{estimationDate}</Text>
            </View>
          )}
          <View style={s.feeRow}>
            <Text style={s.feeLabel}>Show date</Text>
            <Text style={s.feeValue}>{formatShortDate(show.date)}</Text>
          </View>
        </View>

        {/* Show timing */}
        <View style={s.infoBlock}>
          <Text style={s.infoLabel}>Show Timing</Text>
          {show.showOpenTime && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Time of opening</Text>
              <Text style={s.feeValue}>{formatTime(show.showOpenTime)}</Text>
            </View>
          )}
          {sd?.latestArrivalTime && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Latest time dogs will be received</Text>
              <Text style={s.feeValue}>{sd.latestArrivalTime}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={s.feeRow}>
              <Text style={s.feeLabel}>Judging commences</Text>
              <Text style={s.feeValue}>{formatTime(show.startTime)}</Text>
            </View>
          )}
          {sd?.isBenched ? (
            <Text style={{ ...s.infoText, marginTop: 3, fontSize: 7.5 }}>
              {sd.benchingRemovalTime
                ? `Benched show. ${sd.benchingRemovalTime}`
                : 'Benched show. Dogs may only be removed from benches with the permission of the Show Secretary.'}
            </Text>
          ) : (
            <Text style={{ ...s.infoText, marginTop: 3, fontSize: 7.5 }}>
              Unbenched show. Dogs may be removed after judging of their breed is complete.
            </Text>
          )}
          <Text style={{ ...s.infoText, fontSize: 7.5 }}>
            The show closes half an hour after all judging has been completed.
          </Text>
        </View>

        {/* NFC statement */}
        <View style={s.infoBlock}>
          <Text style={s.infoLabel}>Not For Competition</Text>
          <Text style={s.infoText}>
            {sd?.acceptsNfc !== false
              ? 'Not For Competition entries are accepted. NFC dogs must be registered with the Royal Kennel Club and aged 3 months or over.'
              : 'Not For Competition entries are not accepted at this show.'}
          </Text>
        </View>

        {/* Venue */}
        {show.venue && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Venue</Text>
            <Text style={s.infoText}>{show.venue.name}</Text>
            {show.venue.address && (
              <Text style={s.infoText}>{show.venue.address}</Text>
            )}
            {show.venue.postcode && (
              <Text style={s.infoText}>{show.venue.postcode}</Text>
            )}
          </View>
        )}

        {/* Judges */}
        {judges.length > 0 && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Judges</Text>
            {judges.map((judge, i) => (
              <View key={i} style={s.judgeRow}>
                <Text style={s.judgeName}>{judge.name}</Text>
                <Text style={s.judgeBreeds}>
                  {judge.breeds.length > 0 ? judge.breeds.join(', ') : 'All breeds'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Online entries */}
        <View style={s.infoBlock}>
          <Text style={s.infoLabel}>Online Entries</Text>
          <Text style={s.infoText}>
            Enter online at remishowmanager.co.uk
          </Text>
        </View>

        {/* Awards */}
        {sd?.awardsDescription && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Awards</Text>
            <Text style={s.infoText}>{sd.awardsDescription}</Text>
          </View>
        )}

        {/* Prize money */}
        {sd?.prizeMoney && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Prize Money</Text>
            <Text style={s.infoText}>{sd.prizeMoney}</Text>
          </View>
        )}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Officers, Guarantors & Officials ── */}
      {(sd?.officers?.length || sd?.guarantors?.length) && (
        <Page size="A5" style={s.page}>
          <Text style={s.sectionTitle}>Officials</Text>

          {/* Officers */}
          {sd?.officers && sd.officers.length > 0 && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Officers &amp; Committee</Text>
              {sd.officers.map((o, i) => (
                <View key={i} style={s.judgeRow}>
                  <Text style={s.judgeName}>{o.position}</Text>
                  <Text style={s.judgeBreeds}>{o.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Guarantors */}
          {sd?.guarantors && sd.guarantors.length > 0 && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Guarantors to the Royal Kennel Club</Text>
              {sd.guarantors.map((g, i) => (
                <View key={i} style={s.judgeRow}>
                  <Text style={s.judgeName}>{g.name}</Text>
                  {g.address && <Text style={s.judgeBreeds}>{g.address}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Show Manager */}
          {sd?.showManager && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Show Manager</Text>
              <Text style={s.infoText}>{sd.showManager}</Text>
            </View>
          )}

          {/* Vet */}
          {show.onCallVet && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>On-Call Veterinary Surgeon</Text>
              <Text style={s.infoText}>{show.onCallVet}</Text>
            </View>
          )}

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ── Schedule of Classes ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Schedule of Classes</Text>

        <View style={s.classTableHeader}>
          <View style={s.colClassNo}>
            <Text style={s.classHeaderText}>No.</Text>
          </View>
          <View style={s.colClassName}>
            <Text style={s.classHeaderText}>Class</Text>
          </View>
          <View style={s.colClassSex}>
            <Text style={s.classHeaderText}>Sex</Text>
          </View>
          <View style={s.colClassBreed}>
            <Text style={s.classHeaderText}>Breed</Text>
          </View>
          <View style={s.colClassDesc}>
            <Text style={s.classHeaderText}>Description</Text>
          </View>
        </View>

        {classes.map((cls, i) => {
          const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : 'Mixed';
          return (
            <View key={i} style={s.classRow} wrap={false}>
              <View style={s.colClassNo}>
                <Text style={s.classCellBold}>{cls.classNumber ?? ''}</Text>
              </View>
              <View style={s.colClassName}>
                <Text style={s.classCellBold}>{cls.className}</Text>
              </View>
              <View style={s.colClassSex}>
                <Text style={s.classCellItalic}>{sexLabel}</Text>
              </View>
              <View style={s.colClassBreed}>
                <Text style={s.classCell}>{cls.breedName ?? ''}</Text>
              </View>
              <View style={s.colClassDesc}>
                <Text style={s.classCellItalic}>{cls.classDescription ?? ''}</Text>
              </View>
            </View>
          );
        })}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Definitions of Classes ── */}
      {classDefinitions.length > 0 && (
        <Page size="A5" style={s.page}>
          <Text style={s.sectionTitle}>Definitions of Classes</Text>

          {classDefinitions.map((def) => (
            <View key={def.name} style={s.defBlock} wrap={false}>
              <Text style={s.defName}>{def.name}</Text>
              <Text style={s.defDescription}>{def.description}</Text>
            </View>
          ))}

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ── Regulations & Notices ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Regulations &amp; Notices</Text>

        {/* Judges assessment */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Judges&apos; Assessment</Text>
          <Text style={s.noticeText}>
            In assessing dogs, judges must penalise any features or exaggerations which they consider would be detrimental to the soundness, health and well being of the dog.
          </Text>
        </View>

        {/* Jurisdiction */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Jurisdiction</Text>
          <Text style={s.noticeText}>
            The Officers and Committee members of the society holding the licence are deemed responsible for organising and conducting the show safely and in accordance with the Rules and Regulations of the Royal Kennel Club. In so doing they accept responsibility for the safety of all dogs within the precincts of the show.
          </Text>
        </View>

        {/* Collar/welfare */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Welfare</Text>
          <Text style={s.noticeText}>
            The use of pinch collars, electronic shock collars, or prong collars, is not permitted at any show licensed by the Royal Kennel Club.
          </Text>
        </View>

        {/* Dogs in vehicles */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTextBold}>
            WARNING: IF YOUR DOG IS FOUND TO BE AT RISK FORCIBLE ENTRY TO YOUR VEHICLE MAY BE NECESSARY WITHOUT LIABILITY FOR ANY DAMAGE CAUSED.
          </Text>
        </View>

        {/* 10-minute BIS rule */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Best in Show</Text>
          <Text style={s.noticeText}>
            Exhibits will not be admitted to the Group or Best in Show competition after a period of ten minutes has elapsed since the announcement.
          </Text>
        </View>

        {/* Children */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Children</Text>
          <Text style={s.noticeText}>
            Children under 11 must be accompanied by a parent or guardian at all times.
          </Text>
        </View>

        {/* Fouling */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Fouling</Text>
          <Text style={s.noticeText}>
            Exhibitors are responsible for cleaning up after their dogs at all times within the showground, car park, and surrounding areas. Failure to do so may result in disqualification.
          </Text>
        </View>

        {/* GDPR */}
        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>Data Protection</Text>
          <Text style={s.noticeText}>
            Your personal data will be processed by the show society in accordance with the General Data Protection Regulation and the Data Protection Act 2018. Entry details may be shared with the Royal Kennel Club for the purposes of registering results and maintaining the Stud Book. By entering this show, you consent to the processing of your data for these purposes.
          </Text>
        </View>

        {/* Reserve CCs */}
        {show.showType === 'championship' && (
          <View style={s.noticeBlock} wrap={false}>
            <Text style={s.noticeTitle}>Reserve Challenge Certificates</Text>
            <Text style={s.noticeText}>
              Reserve Challenge Certificates now explicitly count towards Champion qualification as per Royal Kennel Club regulations.
            </Text>
          </View>
        )}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Regulatory References ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Regulation F Notices</Text>

        <Text style={{ ...s.infoText, marginBottom: 6 }}>
          The following Royal Kennel Club Regulations apply to this show. Exhibitors are bound by these regulations upon entering.
        </Text>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)8.a — Eligibility</Text>
          <Text style={s.noticeText}>
            Puppies under four calendar months of age on the day of the show are not eligible for exhibition at any show.
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)8.i — Partnership Entries</Text>
          <Text style={s.noticeText}>
            A dog entered at any show in partnership must be recorded at the Royal Kennel Club in the name of all the partners.
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)8.l — Estimating Awards Won</Text>
          <Text style={s.noticeText}>
            In estimating the number of awards won, all wins up to and including the seventh day before the date of closing of postal entries shall be counted when singling up entries.
            {estimationDate ? ` For this show, that date is ${estimationDate}.` : ''}
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)8.m — Withdrawal &amp; Transfer</Text>
          <Text style={s.noticeText}>
            An entry in a class may be withdrawn or transferred to another eligible class. A transfer must be made on the day of the show and may only be to another class in which the dog is eligible.
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)13 — Mating of Bitches</Text>
          <Text style={s.noticeText}>
            The mating of bitches within the precincts of a show is strictly forbidden.
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)18 — Not For Competition</Text>
          <Text style={s.noticeText}>
            {sd?.acceptsNfc !== false
              ? 'Not For Competition entries may be accepted. NFC exhibits must be registered at the Royal Kennel Club in the name of the owner and must be aged not less than three calendar months on the day of the show.'
              : 'Not For Competition entries are not accepted at this show.'}
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(1)26 &amp; 27 — Best in Show / Best Puppy in Show</Text>
          <Text style={s.noticeText}>
            Best in Show and Best Puppy in Show shall be judged in accordance with Royal Kennel Club Regulation F(1)26 and F(1)27. The judge of Best in Show must be approved by the Royal Kennel Club.
          </Text>
        </View>

        <View style={s.noticeBlock} wrap={false}>
          <Text style={s.noticeTitle}>F(B) — Preparation of Dogs for Exhibition</Text>
          <Text style={s.noticeText}>
            A dog must be exhibited in its natural state. No substance which alters the texture, colour, or body of the coat may be present in the dog's coat. No device or technique may be used to alter the natural set or carriage of the dog's ears or tail. The trimming, styling, and preparation of a dog's coat is permitted only if customary for that breed and within the limits of the breed standard.
          </Text>
        </View>

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Optional information page ── */}
      {(sd?.directions || sd?.catering || sd?.futureShowDates || sd?.additionalNotes) && (
        <Page size="A5" style={s.page}>
          <Text style={s.sectionTitle}>Additional Information</Text>

          {sd?.directions && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Directions to Venue</Text>
              <Text style={s.infoText}>{sd.directions}</Text>
            </View>
          )}

          {sd?.catering && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Catering</Text>
              <Text style={s.infoText}>{sd.catering}</Text>
            </View>
          )}

          {sd?.futureShowDates && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Future Show Dates</Text>
              <Text style={s.infoText}>{sd.futureShowDates}</Text>
            </View>
          )}

          {sd?.additionalNotes && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Notes</Text>
              <Text style={s.infoText}>{sd.additionalNotes}</Text>
            </View>
          )}

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ── Entry Form (only for shows accepting postal entries) ── */}
      {show.acceptsPostalEntries && (
        <Page size="A5" style={s.page}>
          <Text style={s.sectionTitle}>Entry Form</Text>

          <Text style={{ fontSize: 7, color: '#666', marginBottom: 8, textAlign: 'center', fontStyle: 'italic' }}>
            Enter online at remishowmanager.co.uk — or complete this form and post to the show secretary
          </Text>

          <Text style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 8 }}>
            {show.organisation?.name} — {show.name} — {formatShortDate(show.date)}
          </Text>

          {/* Owner details */}
          <View style={s.formField}>
            <Text style={s.formLabel}>Owner(s) Name</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Address</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel} />
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Postcode</Text>
            <View style={{ ...s.formLine, maxWidth: 90 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Tel</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Email</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 6 }} />

          {/* Dog details */}
          <View style={s.formField}>
            <Text style={s.formLabel}>Registered Name</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Breed</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>KC Reg. No.</Text>
            <View style={{ ...s.formLine, maxWidth: 110 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Sex</Text>
            <View style={{ ...s.formLine, maxWidth: 60 }} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Date of Birth</Text>
            <View style={{ ...s.formLine, maxWidth: 90 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Colour</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Sire</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Dam</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Breeder</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 6 }} />

          {/* Classes */}
          <Text style={{ ...s.formLabel, marginBottom: 4 }}>
            Classes Entered (write class numbers)
          </Text>
          <View style={s.formClassGrid}>
            {Array.from({ length: 10 }, (_, i) => (
              <View key={i} style={s.formClassBox}>
                <Text style={s.formClassBoxLabel}>{i + 1}</Text>
              </View>
            ))}
          </View>

          <View style={s.formField}>
            <Text style={s.formLabel}>Handler (if not owner)</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 6 }} />
          <View style={s.formField}>
            <Text style={s.formLabel}>Total Fee Enclosed</Text>
            <Text style={{ fontSize: 8, fontWeight: 'bold' }}>£</Text>
            <View style={{ ...s.formLine, maxWidth: 60 }} />
          </View>

          {/* Declaration */}
          <View style={{ marginTop: 6, padding: 6, borderWidth: 0.5, borderColor: '#999' }}>
            <Text style={{ fontSize: 6.5, lineHeight: 1.5 }}>
              I/We agree to submit to and be bound by Royal Kennel Club Rules and Show Regulations F(1)
              in their present form or as they may be amended from time to time. I/We also agree to
              submit to the regulations of this show and not to bring to the show any dog which has
              contracted or been knowingly exposed to any infectious or contagious disease during the
              21 days prior to the show. I/We further agree that if I/we default in any payment to the
              show society concerned, whether in connection with entry fees or otherwise, my/our dog(s)
              may be excluded from any or all societies affiliated to the Royal Kennel Club, and I/we
              shall not be entitled to register, transfer, or exhibit any dogs until the debt(s) is/are
              settled. I/We further declare that I/we believe to the best of my/our knowledge that the
              dog(s) entered is/are not a danger to the public.
            </Text>
          </View>

          {/* Signature */}
          <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'space-between' }}>
            <View style={{ width: '55%' }}>
              <Text style={{ fontSize: 7, fontWeight: 'bold', marginBottom: 2 }}>
                Signature of Owner
              </Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#000', height: 18 }} />
            </View>
            <View style={{ width: '30%' }}>
              <Text style={{ fontSize: 7, fontWeight: 'bold', marginBottom: 2 }}>Date</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#000', height: 18 }} />
            </View>
          </View>

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}
    </Document>
  );
}
