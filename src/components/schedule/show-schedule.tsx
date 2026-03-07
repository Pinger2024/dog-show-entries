import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import path from 'path';

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
  description: string | null;
  firstEntryFee: number | null;
  subsequentEntryFee: number | null;
  nfcEntryFee: number | null;
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

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 10,
    padding: '36 40 52 40',
    lineHeight: 1.4,
  },
  // ── Cover page ──
  coverPage: {
    fontFamily: 'Times',
    padding: '60 50 50 50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverLogo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  coverOrg: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  coverShowName: {
    fontSize: 24,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: 'center',
  },
  coverShowType: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 4,
    textAlign: 'center',
    color: '#444',
  },
  coverRegulatory: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  coverDetail: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
    color: '#333',
  },
  coverRule: {
    width: '50%',
    borderBottomWidth: 1,
    borderBottomColor: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
  coverSection: {
    marginTop: 12,
    textAlign: 'center',
  },
  coverLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  coverValue: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
  },
  // ── Section pages ──
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 6,
  },
  // ── Judges list ──
  judgeRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  judgeName: {
    fontSize: 10,
    fontWeight: 'bold',
    width: '35%',
  },
  judgeBreeds: {
    fontSize: 10,
    width: '65%',
    color: '#333',
  },
  // ── Class table ──
  classTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 3,
    marginBottom: 4,
  },
  classRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  colClassNo: { width: '10%' },
  colClassName: { width: '30%' },
  colClassSex: { width: '12%' },
  colClassBreed: { width: '20%' },
  colClassDesc: { width: '28%' },
  classHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classCellBold: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  classCell: {
    fontSize: 9,
  },
  classCellItalic: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#555',
  },
  // ── Class definitions ──
  defBlock: {
    marginBottom: 6,
  },
  defName: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  defDescription: {
    fontSize: 9,
    color: '#333',
    lineHeight: 1.4,
  },
  // ── Info section ──
  infoBlock: {
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#555',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  // ── Entry form ──
  formField: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  formLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    width: 120,
  },
  formLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    height: 18,
  },
  formFieldTall: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  formBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#999',
    height: 50,
  },
  formClassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  formClassBox: {
    width: '18%',
    marginRight: '2%',
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: '#999',
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formClassBoxLabel: {
    fontSize: 7,
    color: '#999',
  },
  // ── Fees table ──
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  feeLabel: {
    fontSize: 10,
  },
  feeValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 5,
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

  // Deduplicate class definitions for the definitions page
  const seenDefs = new Set<string>();
  const classDefinitions: { name: string; description: string }[] = [];
  for (const cls of classes) {
    if (cls.classDescription && !seenDefs.has(cls.className)) {
      seenDefs.add(cls.className);
      classDefinitions.push({ name: cls.className, description: cls.classDescription });
    }
  }

  return (
    <Document title={`Schedule — ${show.name}`} author="Remi Show Manager">
      {/* ── Cover Page ── */}
      <Page size="A4" style={s.coverPage}>
        {show.organisation?.logoUrl && (
          <Image src={show.organisation.logoUrl} style={s.coverLogo} />
        )}

        {show.organisation && (
          <Text style={s.coverOrg}>{show.organisation.name}</Text>
        )}

        <Text style={s.coverShowName}>{show.name}</Text>
        <Text style={s.coverShowType}>{showTypeLabel}</Text>

        <Text style={s.coverRegulatory}>
          Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
        </Text>

        <View style={s.coverRule} />

        <Text style={s.coverDetail}>{showDate}</Text>

        {show.venue && (
          <Text style={s.coverDetail}>
            {show.venue.name}
            {show.venue.address ? `, ${show.venue.address}` : ''}
            {show.venue.postcode ? ` ${show.venue.postcode}` : ''}
          </Text>
        )}

        {show.startTime && (
          <Text style={s.coverDetail}>Judging commences: {show.startTime}</Text>
        )}

        {show.kcLicenceNo && (
          <View style={s.coverSection}>
            <Text style={s.coverLabel}>KC Licence No</Text>
            <Text style={s.coverValue}>{show.kcLicenceNo}</Text>
          </View>
        )}

        {show.secretaryEmail && (
          <View style={s.coverSection}>
            <Text style={s.coverLabel}>Show Secretary</Text>
            <Text style={s.coverValue}>{show.secretaryEmail}</Text>
          </View>
        )}

        {show.organisation?.website && (
          <View style={s.coverSection}>
            <Text style={s.coverLabel}>Website</Text>
            <Text style={s.coverValue}>{show.organisation.website}</Text>
          </View>
        )}

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>

      {/* ── Judges Page ── */}
      {judges.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.sectionTitle}>Judges</Text>

          <View style={{ ...s.judgeRow, borderBottomWidth: 1.5, borderBottomColor: '#000', marginBottom: 4 }}>
            <Text style={{ ...s.judgeName, fontWeight: 'bold' }}>Judge</Text>
            <Text style={{ ...s.judgeBreeds, fontWeight: 'bold' }}>Breeds</Text>
          </View>

          {judges.map((judge, i) => (
            <View key={i} style={s.judgeRow}>
              <Text style={s.judgeName}>{judge.name}</Text>
              <Text style={s.judgeBreeds}>
                {judge.breeds.length > 0 ? judge.breeds.join(', ') : 'All breeds'}
              </Text>
            </View>
          ))}

          <Text
            style={s.footer}
            render={({ pageNumber, totalPages }) =>
              `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
            }
            fixed
          />
        </Page>
      )}

      {/* ── Entry Fees & Dates Page ── */}
      <Page size="A4" style={s.page}>
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
          <View style={s.feeRow}>
            <Text style={s.feeLabel}>Show date</Text>
            <Text style={s.feeValue}>{formatShortDate(show.date)}</Text>
          </View>
        </View>

        {/* Venue details */}
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

        {/* Online entries */}
        <View style={s.infoBlock}>
          <Text style={s.infoLabel}>Online Entries</Text>
          <Text style={s.infoText}>
            Enter online at remishowmanager.co.uk
          </Text>
        </View>

        {/* Description / additional info */}
        {show.description && (
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Additional Information</Text>
            <Text style={s.infoText}>{show.description}</Text>
          </View>
        )}

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>

      {/* ── Classes Page ── */}
      <Page size="A4" style={s.page}>
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
                <Text style={s.classCellBold}>
                  {cls.classNumber ?? ''}
                </Text>
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
                <Text style={s.classCellItalic}>
                  {cls.classDescription ?? ''}
                </Text>
              </View>
            </View>
          );
        })}

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>

      {/* ── Class Definitions Page ── */}
      {classDefinitions.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.sectionTitle}>Definitions of Classes</Text>

          {classDefinitions.map((def) => (
            <View key={def.name} style={s.defBlock} wrap={false}>
              <Text style={s.defName}>{def.name}</Text>
              <Text style={s.defDescription}>{def.description}</Text>
            </View>
          ))}

          <Text
            style={s.footer}
            render={({ pageNumber, totalPages }) =>
              `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
            }
            fixed
          />
        </Page>
      )}

      {/* ── Entry Form Page ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Entry Form</Text>

        <Text style={{ fontSize: 8, color: '#666', marginBottom: 12, textAlign: 'center', fontStyle: 'italic' }}>
          Enter online at remishowmanager.co.uk — or complete this form and post to the show secretary
        </Text>

        {/* Show name */}
        <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 10 }}>
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
          <View style={{ ...s.formLine, maxWidth: 120 }} />
          <Text style={{ ...s.formLabel, marginLeft: 20 }}>Tel</Text>
          <View style={s.formLine} />
        </View>
        <View style={s.formField}>
          <Text style={s.formLabel}>Email</Text>
          <View style={s.formLine} />
        </View>

        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 10 }} />

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
          <View style={{ ...s.formLine, maxWidth: 150 }} />
          <Text style={{ ...s.formLabel, marginLeft: 20 }}>Sex</Text>
          <View style={{ ...s.formLine, maxWidth: 80 }} />
        </View>
        <View style={s.formField}>
          <Text style={s.formLabel}>Date of Birth</Text>
          <View style={{ ...s.formLine, maxWidth: 120 }} />
          <Text style={{ ...s.formLabel, marginLeft: 20 }}>Colour</Text>
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

        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 10 }} />

        {/* Classes entered */}
        <Text style={{ ...s.formLabel, marginBottom: 6 }}>
          Classes Entered (write class numbers)
        </Text>
        <View style={s.formClassGrid}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={s.formClassBox}>
              <Text style={s.formClassBoxLabel}>{i + 1}</Text>
            </View>
          ))}
        </View>

        {/* Handler */}
        <View style={s.formField}>
          <Text style={s.formLabel}>Handler (if not owner)</Text>
          <View style={s.formLine} />
        </View>

        {/* Fees */}
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 10 }} />
        <View style={s.formField}>
          <Text style={s.formLabel}>Total Fee Enclosed</Text>
          <Text style={{ fontSize: 9, fontWeight: 'bold' }}>£</Text>
          <View style={{ ...s.formLine, maxWidth: 80 }} />
        </View>

        {/* Declaration */}
        <View style={{ marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: '#999' }}>
          <Text style={{ fontSize: 8, lineHeight: 1.5 }}>
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
        <View style={{ flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' }}>
          <View style={{ width: '55%' }}>
            <Text style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}>
              Signature of Owner
            </Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#000', height: 24 }} />
          </View>
          <View style={{ width: '30%' }}>
            <Text style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}>Date</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#000', height: 24 }} />
          </View>
        </View>

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${show.name} — Schedule — Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
