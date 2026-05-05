import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'node:path';
import { formatCurrency } from '@/lib/date-utils';

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

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

export type JudgeContractPdfData = {
  societyName: string;
  secretaryEmail: string | null;
  show: {
    name: string;
    startDate: Date;
    showType: string | null;
    venueName: string | null;
    venuePostcode: string | null;
  };
  judge: {
    name: string;
    email: string;
    kennelClubAffix: string | null;
    jepLevel: number | null;
  };
  breedsAssigned: string[];
  expenses: {
    hotelPence: number | null;
    travelPence: number | null;
    otherPence: number | null;
    notes: string | null;
  };
  terms: string | null;
  dates: {
    offerSentAt: Date | null;
    acceptedAt: Date;
  };
  generatedAt: Date;
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 11,
    padding: '54 54 54 54',
    lineHeight: 1.5,
    color: '#1a1a1a',
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#2D5F3F',
    paddingBottom: 12,
    marginBottom: 20,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2D5F3F',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#2D5F3F',
    fontWeight: 'bold',
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d4d0c8',
    paddingBottom: 3,
  },
  paragraph: {
    marginBottom: 8,
    textAlign: 'justify',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  rowLabel: {
    width: 120,
    color: '#555',
  },
  rowValue: {
    flex: 1,
    fontWeight: 'bold',
  },
  expensesTable: {
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: '#d4d0c8',
  },
  expenseRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d4d0c8',
  },
  expenseRowLast: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  expenseLabel: {
    flex: 1,
    color: '#333',
  },
  expenseAmount: {
    fontWeight: 'bold',
    minWidth: 70,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f5f3ef',
    borderTopWidth: 1,
    borderTopColor: '#2D5F3F',
  },
  totalLabel: {
    flex: 1,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontWeight: 'bold',
    minWidth: 70,
    textAlign: 'right',
    fontSize: 12,
  },
  breedsBlock: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f5f3ef',
    borderRadius: 2,
  },
  signatureGrid: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 30,
  },
  signatureCell: {
    flex: 1,
  },
  signatureLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#555',
    marginBottom: 14,
  },
  signatureName: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  signatureStamp: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
  },
  notesBlock: {
    padding: 10,
    backgroundColor: '#f5f3ef',
    borderLeftWidth: 2,
    borderLeftColor: '#2D5F3F',
    fontSize: 10,
    color: '#333',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 54,
    right: 54,
    borderTopWidth: 0.5,
    borderTopColor: '#d4d0c8',
    paddingTop: 8,
    fontSize: 8,
    color: '#888',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function formatPence(pence: number | null): string {
  if (pence == null) return '—';
  return formatCurrency(pence);
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function JudgeContractPdf({ data }: { data: JudgeContractPdfData }) {
  const showTypeLabel = data.show.showType
    ? SHOW_TYPE_LABELS[data.show.showType] ?? data.show.showType
    : null;
  const venue = data.show.venueName
    ? `${data.show.venueName}${data.show.venuePostcode ? `, ${data.show.venuePostcode}` : ''}`
    : 'Venue to be confirmed';

  const expenseTotal =
    (data.expenses.hotelPence ?? 0) +
    (data.expenses.travelPence ?? 0) +
    (data.expenses.otherPence ?? 0);
  const hasExpenses = expenseTotal > 0 || data.expenses.notes;

  const judgeName = data.judge.kennelClubAffix
    ? `${data.judge.name} (${data.judge.kennelClubAffix})`
    : data.judge.name;

  return (
    <Document
      title={`Judging Contract — ${data.show.name}`}
      author={data.societyName}
      subject={`Judging contract for ${data.judge.name}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.eyebrow}>Judging Appointment Contract</Text>
          <Text style={s.title}>{data.show.name}</Text>
          <Text style={s.subtitle}>
            {formatDate(data.show.startDate)}
            {showTypeLabel ? ` · ${showTypeLabel}` : ''}
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.paragraph}>
            This is an agreement between <Text style={{ fontWeight: 'bold' }}>{data.societyName}</Text>{' '}
            (the &quot;Society&quot;) and <Text style={{ fontWeight: 'bold' }}>{judgeName}</Text>{' '}
            (the &quot;Judge&quot;), formalising the Judge&apos;s appointment to officiate at the
            above show under the rules and regulations of the Royal Kennel Club.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionHeading}>Show Details</Text>
          <View style={s.row}>
            <Text style={s.rowLabel}>Society</Text>
            <Text style={s.rowValue}>{data.societyName}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Show</Text>
            <Text style={s.rowValue}>{data.show.name}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Date</Text>
            <Text style={s.rowValue}>{formatDate(data.show.startDate)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Venue</Text>
            <Text style={s.rowValue}>{venue}</Text>
          </View>
          {showTypeLabel && (
            <View style={s.row}>
              <Text style={s.rowLabel}>Show Type</Text>
              <Text style={s.rowValue}>{showTypeLabel}</Text>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionHeading}>Judge</Text>
          <View style={s.row}>
            <Text style={s.rowLabel}>Name</Text>
            <Text style={s.rowValue}>{judgeName}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue}>{data.judge.email}</Text>
          </View>
          {data.judge.jepLevel != null && (
            <View style={s.row}>
              <Text style={s.rowLabel}>JEP Level</Text>
              <Text style={s.rowValue}>Level {data.judge.jepLevel}</Text>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionHeading}>Appointment</Text>
          <View style={s.breedsBlock}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Breeds to be judged</Text>
            <Text>
              {data.breedsAssigned.length > 0
                ? data.breedsAssigned.join(', ')
                : 'All breeds scheduled at the show'}
            </Text>
          </View>
        </View>

        {hasExpenses && (
          <View style={s.section}>
            <Text style={s.sectionHeading}>Agreed Expenses</Text>
            <View style={s.expensesTable}>
              <View style={s.expenseRow}>
                <Text style={s.expenseLabel}>Hotel / accommodation</Text>
                <Text style={s.expenseAmount}>{formatPence(data.expenses.hotelPence)}</Text>
              </View>
              <View style={s.expenseRow}>
                <Text style={s.expenseLabel}>Travel</Text>
                <Text style={s.expenseAmount}>{formatPence(data.expenses.travelPence)}</Text>
              </View>
              <View style={s.expenseRowLast}>
                <Text style={s.expenseLabel}>Other expenses</Text>
                <Text style={s.expenseAmount}>{formatPence(data.expenses.otherPence)}</Text>
              </View>
              {expenseTotal > 0 && (
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Total</Text>
                  <Text style={s.totalAmount}>{formatPence(expenseTotal)}</Text>
                </View>
              )}
            </View>
            {data.expenses.notes && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.notesBlock}>{data.expenses.notes}</Text>
              </View>
            )}
          </View>
        )}

        {data.terms && (
          <View style={s.section}>
            <Text style={s.sectionHeading}>Additional Terms</Text>
            <Text style={s.notesBlock}>{data.terms}</Text>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionHeading}>Acceptance</Text>
          <Text style={s.paragraph}>
            By clicking &quot;Accept Appointment&quot; on the offer link sent to the Judge&apos;s email
            address, the Judge has confirmed acceptance of this appointment on the terms set out above.
            This digital acceptance is recorded by Remi and is binding under Royal Kennel Club regulations.
          </Text>

          <View style={s.signatureGrid}>
            <View style={s.signatureCell}>
              <Text style={s.signatureLabel}>For the Society</Text>
              <Text style={s.signatureName}>{data.societyName}</Text>
              <Text style={s.signatureStamp}>
                Offer issued {formatDateShort(data.dates.offerSentAt ?? data.generatedAt)}
              </Text>
              {data.secretaryEmail && (
                <Text style={s.signatureStamp}>{data.secretaryEmail}</Text>
              )}
            </View>
            <View style={s.signatureCell}>
              <Text style={s.signatureLabel}>The Judge</Text>
              <Text style={s.signatureName}>{judgeName}</Text>
              <Text style={s.signatureStamp}>
                Accepted {formatDateShort(data.dates.acceptedAt)}
              </Text>
              <Text style={s.signatureStamp}>{data.judge.email}</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>
            Generated by Remi on {formatDateShort(data.generatedAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
