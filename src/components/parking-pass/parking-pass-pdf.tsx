import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'node:path';

// Self-contained registration (mirrors judge-contract-pdf.tsx) rather than
// importing the shared src/lib/pdf-fonts.ts module — this document is
// rendered standalone (never combined with the catalogue/schedule/Judge's
// Book pipeline in the same render), and it only ever uses ONE font family,
// so it can't trigger the "4th distinct family corrupts an unrelated page"
// react-pdf/pdfkit bug documented there.
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

export type ParkingPassPdfData = {
  showName: string;
  organisationName: string | null;
  /** YYYY-MM-DD */
  showDate: string;
  /** YYYY-MM-DD */
  showEndDate: string;
  venueName: string | null;
  venueAddress: string | null;
  venuePostcode: string | null;
  exhibitorName: string;
  orderRef: string;
  /** Number of passes purchased — one page is rendered per pass. */
  quantity: number;
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 12,
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  border: {
    margin: 24,
    borderWidth: 4,
    borderColor: '#000000',
    flexGrow: 1,
    padding: 36,
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: 42,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 6,
  },
  passOf: {
    fontSize: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 26,
  },
  showName: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  orgName: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
  },
  dateVenueBlock: {
    alignItems: 'center',
    marginBottom: 8,
  },
  dateLine: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  venueLine: {
    fontSize: 13,
    textAlign: 'center',
  },
  admitsBlock: {
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#000000',
    paddingVertical: 20,
    alignItems: 'center',
  },
  issuedTo: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  exhibitorName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  admits: {
    fontSize: 17,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 10,
  },
});

/** Long-form UK date, matching the convention used across confirmation and
 *  catalogue-ready emails (e.g. "Saturday 6 June 2026"). Single-day shows
 *  print one date; multi-day shows print a start–end range. */
function formatShowDateLine(startDate: string, endDate: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`;
}

export function ParkingPassPdf({ data }: { data: ParkingPassPdfData }) {
  const pageCount = Math.max(data.quantity, 1);
  const venueAddressLine = [data.venueAddress, data.venuePostcode].filter(Boolean).join(', ');

  return (
    <Document
      title={`Parking Pass — ${data.showName}`}
      subject={`Parking pass for ${data.exhibitorName}`}
    >
      {Array.from({ length: pageCount }, (_, i) => (
        <Page key={i} size="A4" style={s.page}>
          <View style={s.border}>
            <View>
              <Text style={s.heading}>PARKING PASS</Text>
              {data.quantity > 1 && (
                <Text style={s.passOf}>
                  Pass {i + 1} of {data.quantity}
                </Text>
              )}
              {data.quantity <= 1 && <View style={{ marginBottom: 20 }} />}
              <Text style={s.showName}>{data.showName}</Text>
              {data.organisationName && <Text style={s.orgName}>{data.organisationName}</Text>}
              <View style={s.dateVenueBlock}>
                <Text style={s.dateLine}>
                  {formatShowDateLine(data.showDate, data.showEndDate)}
                </Text>
                {data.venueName && <Text style={s.venueLine}>{data.venueName}</Text>}
                {venueAddressLine.length > 0 && <Text style={s.venueLine}>{venueAddressLine}</Text>}
              </View>
            </View>

            <View style={s.admitsBlock}>
              <Text style={s.issuedTo}>Issued to</Text>
              <Text style={s.exhibitorName}>{data.exhibitorName}</Text>
              <Text style={s.admits}>Admits one vehicle</Text>
            </View>

            <View style={s.footer}>
              <Text>Order {data.orderRef}</Text>
              <Text>Remi · remishowmanager.co.uk</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
