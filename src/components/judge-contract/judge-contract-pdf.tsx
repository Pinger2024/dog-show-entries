import type { ReactNode } from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'node:path';
import { formatCurrency, formatLondonLongDate, formatLondonShortDate } from '@/lib/date-utils';
import '@/lib/pdf-hyphenation';
import { displayShowTypeTitle } from '@/lib/show-types';
import {
  JUDGE_OFFER_TERMS_HEADING,
  SOCIETY_TERMS_HEADING,
  ALREADY_AGREED_LABEL,
  type JudgeOfferTerms,
} from '@/lib/judge-offer-terms';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});

export type JudgeContractPdfData = {
  societyName: string;
  secretaryEmail: string | null;
  show: {
    name: string;
    startDate: Date;
    showType: string | null;
    /** WUSV/SV regional shows still carry the legacy show_type column but
     *  should print "Regional" as the type — keyed off ruleset, not type. */
    showRuleset?: 'rkc' | 'wusv' | null;
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
  /** New: matches the offer email's "Breed: ... / Classification: ..." split.
   *  When present, the PDF renders the two-line format instead of the legacy
   *  combined breedsAssigned. Legacy contracts (pre-2026-05-19) won't have
   *  these set and fall through to the old single-line rendering. */
  breedLine?: string;
  classificationLine?: string;
  expenses: {
    hotelPence: number | null;
    travelPence: number | null;
    otherPence: number | null;
    notes: string | null;
  };
  /** The secretary's notes — printed as "Additional Terms". */
  terms: string | null;
  /** The standard terms exactly as stored on the contract when the offer was
   *  sent (src/lib/judge-offer-terms.ts). Null for a regional, or an offer
   *  sent before the terms existed: the section is then absent. */
  standardTerms?: JudgeOfferTerms | null;
  /** The judge's answer about appointments already agreed, as words
   *  ("None declared" or their text); null when they were never asked. */
  alreadyAgreed?: string | null;
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
    // Its own line height: the page's 1.5 is inherited as the 11pt body's
    // 16.5pt, so a show name that wrapped drew its second line on top of the
    // date line under it.
    lineHeight: 1.25,
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
  termRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  termNumber: {
    width: 18,
  },
  termText: {
    flex: 1,
    textAlign: 'justify',
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

/**
 * A section heading kept on the same page as the first thing it heads.
 *
 * `children` is the section's first piece — a small table, a fixed
 * paragraph, the signature block — and it shares one wrap={false} View with
 * the heading, so the two always move to a new page together. This is the
 * only reliable way in this document: react-pdf ignores minPresenceAhead on
 * a heading nested inside a section View (see pdf-kit/flow.tsx), and even
 * where it works it holds back only its own number of points, never a whole
 * unbreakable block. Until 15 Nov 2026 every heading here used it and
 * "TERMS OF THIS APPOINTMENT" or "ACCEPTANCE" could be the last line of a
 * page (judge-contract-pdf-page-breaks.test.tsx).
 *
 * `children` must be well under a page tall — wrap={false} clips anything
 * taller. Free-length text goes through splitForHeading first.
 */
function HeadedBlock({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={s.sectionHeading}>{heading}</Text>
      {children}
    </View>
  );
}

function formatPence(pence: number | null): string {
  if (pence == null) return '—';
  return formatCurrency(pence);
}

// Always Europe/London, never the process's own timezone (Michael 2026-09-03)
// — offerSentAt/acceptedAt/generatedAt are instants, and formatting them
// with no explicit timeZone picks up the SERVER's own zone (UTC in prod).
function formatDate(d: Date | null): string {
  if (!d) return '—';
  return formatLondonLongDate(d);
}

function formatDateShort(d: Date): string {
  return formatLondonShortDate(d);
}

/**
 * How much of a free-length text (the judge's "already agreed" answer, the
 * secretary's Additional Terms — up to 2,000 characters each, perhaps one
 * item per line) stays on the same page as its heading or label.
 *
 * A short text stays whole with it. A long one keeps only its first line
 * there and the rest (`rest`) flows on across pages: an unbreakable block
 * taller than a page is clipped by react-pdf. One line of 2,000 characters
 * is about 21 printed lines, so `first` is always well under a page.
 */
function splitForHeading(text: string): { first: string; rest: string | null } {
  if (text.length <= 600 && text.split('\n').length <= 12) return { first: text, rest: null };
  const nl = text.indexOf('\n');
  if (nl < 0) return { first: text, rest: null };
  return { first: text.slice(0, nl), rest: text.slice(nl + 1) };
}

function SocietyTerm({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.termRow}>
      <Text style={s.termNumber}>{n}.</Text>
      <Text style={s.termText}>{text}</Text>
    </View>
  );
}

export function JudgeContractPdf({ data }: { data: JudgeContractPdfData }) {
  const showTypeLabel = data.show.showType
    ? displayShowTypeTitle(data.show.showType, data.show.showRuleset)
    : null;
  const isWusv = data.show.showRuleset === 'wusv';
  const venue = data.show.venueName
    ? `${data.show.venueName}${data.show.venuePostcode ? `, ${data.show.venuePostcode}` : ''}`
    : 'Venue to be confirmed';

  const expenseTotal =
    (data.expenses.hotelPence ?? 0) +
    (data.expenses.travelPence ?? 0) +
    (data.expenses.otherPence ?? 0);
  const hasExpenses = expenseTotal > 0 || data.expenses.notes;

  const [firstInvitation, ...restInvitation] = data.standardTerms?.invitationParagraphs ?? [];
  const alreadyAgreed = data.alreadyAgreed != null ? splitForHeading(data.alreadyAgreed) : null;
  const additionalTerms = data.terms ? splitForHeading(data.terms) : null;

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
            above show under {isWusv ? 'the GSDL British Regional Group Rules & Regulations (based on those of the WUSV)' : 'the rules and regulations of the Royal Kennel Club'}.
          </Text>
        </View>

        <View style={s.section}>
          <HeadedBlock heading="Show Details">
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
          </HeadedBlock>
        </View>

        <View style={s.section}>
          <HeadedBlock heading="Judge">
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
          </HeadedBlock>
        </View>

        <View style={s.section}>
          <HeadedBlock heading="Appointment">
            <View style={s.breedsBlock}>
              {data.breedLine || data.classificationLine ? (
                <>
                  <Text style={{ marginBottom: 3 }}>
                    <Text style={{ fontWeight: 'bold' }}>Breed: </Text>
                    {data.breedLine || 'All breeds scheduled at the show'}
                  </Text>
                  {data.classificationLine && (
                    <Text>
                      <Text style={{ fontWeight: 'bold' }}>Classification: </Text>
                      {data.classificationLine}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Breeds to be judged</Text>
                  <Text>
                    {data.breedsAssigned.length > 0
                      ? data.breedsAssigned.join(', ')
                      : 'All breeds scheduled at the show'}
                  </Text>
                </>
              )}
            </View>
          </HeadedBlock>
        </View>

        {hasExpenses && (
          <View style={s.section}>
            {/* The table is at most 4 rows (hotel/travel/other/total): it
                stays whole, with its heading. */}
            <HeadedBlock heading="Agreed Expenses">
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
            </HeadedBlock>
            {data.expenses.notes && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.notesBlock}>{data.expenses.notes}</Text>
              </View>
            )}
          </View>
        )}

        {data.standardTerms && (
          <View style={s.section}>
            {/* The heading travels with the first invitation paragraph (a
                fixed four lines); the rest is free to break across a page. */}
            <HeadedBlock heading={JUDGE_OFFER_TERMS_HEADING}>
              {firstInvitation != null && <Text style={s.paragraph}>{firstInvitation}</Text>}
            </HeadedBlock>
            {restInvitation.map((p, i) => (
              <Text key={`inv-${i + 1}`} style={s.paragraph}>{p}</Text>
            ))}
            {data.standardTerms.societyTerms.length > 0 && (
              <>
                {/* wrap={false}: the heading travels with the first term, and
                    each term (two or three lines) stays whole — otherwise the
                    number was left alone at the foot of a page with its text
                    on the next. */}
                <View wrap={false}>
                  <Text style={{ fontWeight: 'bold', marginTop: 4, marginBottom: 4 }}>{SOCIETY_TERMS_HEADING}</Text>
                  <SocietyTerm n={1} text={data.standardTerms.societyTerms[0]!} />
                </View>
                {data.standardTerms.societyTerms.slice(1).map((t, i) => (
                  <View key={`soc-${i + 2}`} wrap={false}>
                    <SocietyTerm n={i + 2} text={t} />
                  </View>
                ))}
              </>
            )}
            {alreadyAgreed && (alreadyAgreed.rest == null ? (
              <View style={[s.row, { marginTop: 6 }]} wrap={false}>
                <Text style={s.rowLabel}>{ALREADY_AGREED_LABEL}</Text>
                <Text style={s.rowValue}>{alreadyAgreed.first}</Text>
              </View>
            ) : (
              // A long answer: the label sits above it (a side-by-side row
              // that splits across pages draws its label on the LAST page),
              // and travels with the answer's first line; the rest flows on.
              <View style={{ marginTop: 6 }}>
                <View wrap={false}>
                  <Text style={{ color: '#555' }}>{ALREADY_AGREED_LABEL}</Text>
                  <Text style={{ fontWeight: 'bold' }}>{alreadyAgreed.first}</Text>
                </View>
                <Text style={{ fontWeight: 'bold' }}>{alreadyAgreed.rest}</Text>
              </View>
            ))}
          </View>
        )}

        {additionalTerms && (
          <View style={s.section}>
            {/* A long note keeps its first line with the heading and flows
                on; the two pieces share one box (no padding between). */}
            <HeadedBlock heading="Additional Terms">
              <Text style={additionalTerms.rest == null ? s.notesBlock : [s.notesBlock, { paddingBottom: 0 }]}>
                {additionalTerms.first}
              </Text>
            </HeadedBlock>
            {additionalTerms.rest != null && (
              <Text style={[s.notesBlock, { paddingTop: 0 }]}>{additionalTerms.rest}</Text>
            )}
          </View>
        )}

        <View style={s.section}>
          {/* The closing paragraph and both signature blocks are small and
              belong together with their heading — never split across a page. */}
          <HeadedBlock heading="Acceptance">
            <Text style={s.paragraph}>
              By clicking &quot;Accept Appointment&quot; on the offer link sent to the Judge&apos;s email
              address, the Judge has confirmed acceptance of this appointment on the terms set out above.
              This digital acceptance is recorded by Remi and is binding under {isWusv ? 'the GSDL British Regional Group Rules & Regulations' : 'Royal Kennel Club regulations'}.
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
          </HeadedBlock>
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
