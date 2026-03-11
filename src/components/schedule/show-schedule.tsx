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
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Definitions of Classes</Text>

        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          In the following definitions, a Challenge Certificate includes any Show award that counts towards the title of Champion under the Rules of any governing body recognised by The Royal Kennel Club.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          Wins at Championship Shows in breed classes where Challenge Certificates are not on offer shall be counted as wins at Open Shows.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          In the case of a dog owned in partnership and entered in Members&apos; classes or competing for Members&apos; Specials each partner must at the time of entry be a member of the Society.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          In estimating the number of awards won, all wins up to and including the seventh day before the first closing date shall be counted when entering for any class{estimationDate ? ` i.e. ${estimationDate}.` : '.'}
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          Wins in Variety classes do not count for entry in Breed classes but when entering in Variety classes, wins in both Breed and Variety classes must be counted. First prizes awarded in any classes defined as Special do not count towards eligibility.
        </Text>

        {/* Withdrawal and Transfer */}
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          If an exhibitor reports before the judging of a class or classes that a dog has been entered which is ineligible, the exhibitor may choose one of the following options:-
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          (1) <Text style={s.noticeTextBold}>Withdrawal</Text> - The dog may be withdrawn from competition subject to the conditions of Regulation F.(1).19.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          (2) <Text style={s.noticeTextBold}>Transfer a)</Text> If a dog is ineligible for a class or classes as regards its breed, colour, sex, weight or height the Show Secretary shall transfer it to the equivalent class or classes for the correct breed, colour, sex, weight or height or, in the event of there being no equivalent class, Minor Puppy and Puppy excepted, to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          <Text style={s.noticeTextBold}>b)</Text> For an exhibit entered incorrectly in a Minor Puppy class, Puppy class or Junior Class, which is over age but under twelve calendar months of age, eighteen calendar months of age or twenty-four calendar months of age respectively, the Show Secretary shall transfer the exhibit to the Puppy Class, Junior Class or Yearling Class respectively for the correct breed, colour, sex, weight or height and in the event of there being no Puppy, Junior or Yearling Class to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          <Text style={s.noticeTextBold}>c)</Text> For any reason other than the above, the Show Secretary shall transfer it to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 6 }}>
          <Text style={s.noticeTextBold}>d)</Text> If an exhibit arrives late and misses a class, even if it is the only class in which the dog is entered, the dog may not be transferred to any other class.
        </Text>

        {/* Class definitions */}
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>MINOR PUPPY:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 9 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>PUPPY:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>JUNIOR:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 18 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>NOVICE:</Text>
          <Text style={s.defDescription}>For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or three or more First Prizes at Open and Championship Shows (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>POST GRADUATE:</Text>
          <Text style={s.defDescription}>For dogs which have not won a CC/CACIB/CAC/Green Stars or five or more First prizes at Championship Shows in Post Graduate, Minor Limit, Mid Limit, Limit and Open classes whether restricted or not where Challenge Certificates were offered for the breed.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>LIMIT:</Text>
          <Text style={s.defDescription}>For dogs which have not become Show Champions under Royal Kennel Club Regulations or under the rules of any governing body recognised by the Royal Kennel Club or won 3 or more CC/CACIB/CAC/Green Stars or won 7 or more First prizes in all at Championship Shows in Limit and Open classes, confined to the breed, whether restricted or not at shows where Challenge Certificates were offered for the breed.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>OPEN:</Text>
          <Text style={s.defDescription}>For all dogs of the breeds for which the class is provided and eligible for entry at the Show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>VETERAN:</Text>
          <Text style={s.defDescription}>For dogs of not less than 7 years of age on the first day of the Show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>NOT FOR COMPETITION:</Text>
          <Text style={s.defDescription}>Dogs may be entered for Not for Competition, such entries must be recorded on the entry form enclosed for the purpose.</Text>
        </View>

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Rules and Regulations ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Rules and Regulations</Text>

        {show.showOpenTime && (
          <Text style={{ ...s.noticeText, marginBottom: 2 }}>1. The show will open at {formatTime(show.showOpenTime)}.</Text>
        )}
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          {sd?.isBenched
            ? `2. Dogs will be benched${sd.benchingRemovalTime ? `. ${sd.benchingRemovalTime}` : ' and may be removed after Best in Show judging has been completed'}.`
            : '2. Dogs will not be benched at any time but it is the exhibitor\u2019s responsibility to ensure that exhibits are available for judging.'}
        </Text>
        {show.startTime && (
          <Text style={{ ...s.noticeText, marginBottom: 2 }}>3. Judging will commence {formatTime(show.startTime)}.</Text>
        )}
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          4. Exhibits may be removed from the Show after their judging has been completed. The Show will close half an hour after all judging has been completed.
        </Text>
        {(show.firstEntryFee != null || show.subsequentEntryFee != null || show.nfcEntryFee != null) && (
          <Text style={{ ...s.noticeText, marginBottom: 2 }}>
            5. ENTRY FEES: {show.firstEntryFee != null ? `${formatPence(show.firstEntryFee)} first entry` : ''}
            {show.subsequentEntryFee != null ? `, subsequent entries same dog ${formatPence(show.subsequentEntryFee)}` : ''}
            {show.nfcEntryFee != null ? `. NFC ${formatPence(show.nfcEntryFee)}` : ''}.
          </Text>
        )}
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          6. ONLINE ENTRY can be found at remishowmanager.co.uk
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          7. The Committee reserves to itself the right to refuse any entries.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          8. No dog under 6 calendar months of age on the first day of the Show are not eligible for exhibition.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          9. The mating of bitches within the precincts of the Show is forbidden.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          10. <Text style={s.noticeTextBold}>Best Puppy in Show:</Text> Where a Best Puppy in Show competition is scheduled the Best Puppy in Show is a puppy which has competed and is unbeaten by any other puppy exhibited at the show. A puppy is a dog of six and not exceeding twelve calendar months of age on the first day of the show.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          11. A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show. Baby Puppy classes may be scheduled at any breed Club show, Best Baby Puppy in Breed may be declared at each breed from the dogs entered in the Baby Puppy class. There must be no progression to further competitions.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          12. In Best in Show the exhibits may be selected from the exhibits declared Best of Sex. If a Reserve Best in Show is to be selected, the eligible dogs are those declared Best of Sex, Opposite Best of Sex of the exhibit declared Best in Show.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          13. Exhibits will not be admitted to Best in Show competition after a period of ten minutes has elapsed since the announcement that exhibits are required for judging, unless they have been unavoidably delayed by previous judging not being completed on time, and then only with the special permission of the Show Management.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          14. Exhibitors must not pick up dogs by their tails and leads. When lifting dogs not handle in a rough manner.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          15. All exhibitors must be familiar with Royal Kennel Club Regulation F (Annex B) Regulations for the Preparation of Dogs for Exhibition.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          16. All dogs resident outside the UK must be issued with a Royal Kennel Club Authority to Compete number before entry to the show/event can be made. All singled must be resident within the UK. A singled entry for an overseas exhibit must be accompanied by a copy of the dog&apos;s official export pedigree.
        </Text>

        {/* Dogs in vehicles WARNING */}
        <View style={{ ...s.noticeBlock, marginTop: 4 }} wrap={false}>
          <Text style={s.noticeTextBold}>
            WARNING: IF YOUR DOG IS FOUND TO BE AT RISK FORCIBLE ENTRY TO YOUR VEHICLE MAY BE NECESSARY WITHOUT LIABILITY FOR ANY DAMAGE CAUSED.
          </Text>
        </View>

        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          17. Anyone whose dog is entered at a Royal Kennel Club licensed event should take all reasonable steps to ensure the needs of their dog(s) are met and should not put a dog&apos;s health and welfare at risk by any action, default, omission or otherwise. Breach of Royal Kennel Club Regulations in this respect may be referred to the Board for disciplinary action under the Royal Kennel Club Rules and Regulations. The use of pinch collars, electronic shock collars, or prong collars, is not permitted at any show licensed by the Royal Kennel Club. This shall apply at the venue or within the precincts of the show.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          18. <Text style={s.noticeTextBold}>Not for Competition:</Text> Not for Competition entries are accepted. Details of each dog so entered must be recorded on the entry form and must be Royal Kennel Club registered.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          19. No modifications will be made to the schedule except by permission of the Board of the Royal Kennel Club, which will be followed by advertisement in the Canine press wherever possible.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          20. An exhibitor or competitor should ensure that contact details for any handler are available and must be provided upon request in any investigation of a breach of this regulation by such handler.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2 }}>
          20. Should any judge be prevented from fulfilling their engagement, the Committee reserves to themselves the right of appointing other judges to fulfil their duties. Exhibitors are at liberty to withdraw from competition, but no entry fees can be refunded.
        </Text>

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Additional Rules and Regulations ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Additional Rules and Regulations</Text>

        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          i. Should any judge be prevented from fulfilling their engagement, the Committee reserves to themselves the right of appointing other judges to fulfil their duties. Exhibitors are at liberty to withdraw from competition but no entry fees can be refunded.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          ii. Any owner, competitor or other person in charge of a dog is required to remove as soon as possible any fouling caused by their dog(s) at any Royal Kennel Club licensed venue and within the environs of that event including car and caravan parks and approaches. Adequate receptacles for the disposal of such fouling will be provided.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          iii. The Committee will do its utmost to ensure the safety of the dogs brought for exhibition but it must be clearly understood by exhibitors and all other persons at the Show that the Committee will not be responsible for the loss or damage to any dogs or property, or personal injury whether arising from accident or any other cause whatsoever.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          iv. An announcement prior to the date of closing of entries in Our Dogs of any alteration of addition made by the Committee to the schedule or in these Regulation shall be sufficient notice thereof.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          v. All children must be kept under control and parents will be held responsible for any damage caused and charges incurred.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          vi. Please do not obstruct gangways with cages, pens, grooming tables, trolleys and dogs. Storage space will be made available for trolleys/cages.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          vii. The Committee are empowered to exclude any dog which is not in the opinion of the Show Secretary, Show Manager, or Judge in a fit state for exhibition owing to disease, savage disposition, or any other cause. If such an exclusion takes place before or after judging the entrance fee will be forfeited.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          viii. No animal other than an exhibit duly entered at the show will be allowed within the precincts of the show during its continuance.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          ix. The owner, exhibitor, handler or other person in charge of a dog at a Royal Kennel Club licensed event must at all times ensure that the dog is kept under proper control whilst at the licensed venue, including its environs, car and caravan parks and approaches. This regulation applies before (at any time during the set up period at the venue), during the event and afterwards (at any time during the breakdown of the event).
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          x. A dog may be disqualified by the Board from any award, whether an objection has been lodged or not, if proved amongst other things to have been a) registered or recorded as having been bred by the scheduled judge, this shall not apply to a judge appointed in an emergency; b) exhibited without payment of the appropriate entry fees.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 3 }}>
          xi. Every exhibitor shall ensure that whilst the dog is being exhibited, its handler shall display the correct ring number.
        </Text>

        {/* Dogs in hot weather */}
        <View style={{ ...s.noticeBlock, marginTop: 4 }} wrap={false}>
          <Text style={s.noticeTextBold}>
            YOUR DOG&apos;S WELFARE
          </Text>
          <Text style={{ ...s.noticeText, marginTop: 2 }}>
            Your dog is vulnerable and at risk during hot weather and the Royal Kennel Club offers the following guidance to help you guide your dog(s) through the do&apos;s and don&apos;ts of travelling to and whilst at a KC licensed event.
          </Text>
          <Text style={{ ...s.noticeText, marginTop: 2 }}>
            {'\u2022'} When travelling to a show please take a moment to consider whether the route to the show is on a busy motorway route, and leave earlier to avoid increased time in traffic.{'\n'}
            {'\u2022'} If your vehicle is not air-conditioned seriously consider whether travelling to the show is a good idea at all.{'\n'}
            {'\u2022'} The vehicle should be as fully ventilated as possible, and plenty of stops should be taken, with water available to drink.{'\n'}
            {'\u2022'} Ensure your dog is not sitting in full sunlight. There should be plenty of free flowing air around the dog.{'\n'}
            {'\u2022'} When at the Show, never leave your dog in the vehicle.{'\n'}
            {'\u2022'} Keep the dog in the shade — take your own shade for example and always have plenty of water available to drink so your dogs stay well hydrated.{'\n'}
            {'\u2022'} Avoid your dog taking part in unnecessary exercise or from standing in exposed sunlight for extended lengths of time.{'\n'}
            {'\u2022'} Remember, if you feel hot your dog is very likely to feel much hotter and dehydrated, and this could lead to dire results. Please look after your dog&apos;s welfare.
          </Text>
        </View>

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ── Regulations for Preparation of Dogs F(B) ── */}
      <Page size="A5" style={s.page}>
        <Text style={s.sectionTitle}>Regulations for the Preparation of Dogs for Exhibition F (B)</Text>

        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          1. These Regulations must be observed when a dog is prepared for exhibition for any Royal Kennel Club Licensed event.{'\n'}
          Objections may be referred to the Board for disciplinary action under these Show Regulations and/or for disciplinary action under Royal Kennel Club Rule A11.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 2, marginLeft: 10 }}>
          a) A dog found to have been in breach of these Regulations will automatically be disqualified from exhibition at the show and from any award thereat.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4, marginLeft: 10 }}>
          b) Unless the exhibitor provides a satisfactory explanation for the dog being exhibited in breach of these Regulations then he/she may be subject to further penalties of either a fine or as listed under Rule A11.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          2. (a) No substance which alters the natural colour, texture or body of the coat may be present in the DOG&apos;s coat for any purpose at any time during the show. No substance which alters the natural colour of any external part of the dog may be present on the dog for any purpose at any time during the show. (b) Any other substance (other than water) which may be used in preparation of the dog for exhibition must not be allowed to remain in the coat or on any other part of the dog at the time of exhibition.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          3. No act or operation which alters the natural conformation of a dog or any part thereof may be performed except:- (a) Operations certified to the satisfaction of the Board. (b) The removal of dew-claws of any breed. (c) Operations to prevent breeding provided that such operations are notified to the Royal Kennel Club before neutered dogs are shown. Nor must anything be done calculated in the opinion of the General Committee to deceive.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          4. The Board without previous notice may order an examination of any dog or dogs at any Show. Any examination thus ordered will be made by a person having executive authority who shall have a written directive from the Royal Kennel Club in their possession. Samples may be taken for further examination and analysis.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          5. An individual has the right to lodge an objection to a dog if he/she is the owner or handler of a dog competing in the same breed or class. An objection may however, be lodged by an official of the Show or by anyone so deputed by the Royal Kennel Club. It will be the responsibility of the individual who lodges the objection or the official (as appropriate) to substantiate the grounds for the objection. The Royal Kennel Club will substantiate the grounds for an objection made on its behalf.
        </Text>
        <Text style={{ ...s.noticeText, marginBottom: 4 }}>
          6. Any objection by an individual related to an infringement of these regulations must be made in writing to the Show Secretary or his/her office before the close of the Show and the individual must produce evidence of identity at the time of lodging the complaint.
        </Text>

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
