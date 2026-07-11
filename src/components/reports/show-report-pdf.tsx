import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Remi-branded secretary reports (Mandy 2026-06-19 — wants the catalogue order
 * and class breakdown as tidy printable PDFs for the pack she sends to the show
 * secretary, not just CSV). Uses the built-in Helvetica so it renders anywhere
 * without font registration. Remi logo is inlined as a data URI so the server
 * render never has to fetch it.
 */
const remiLogo: string | null = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'branding', 'remi-horizontal.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const C = {
  ink: '#1a1a1a',
  mid: '#52525b',
  rule: '#d4d4d8',
  band: '#0d5c3d',
  bandText: '#ffffff',
  zebra: '#f4f4f5',
};

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 34, fontFamily: 'Helvetica', fontSize: 9, color: C.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  org: { fontSize: 9, color: C.mid, marginBottom: 2 },
  showName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.band },
  meta: { fontSize: 8, color: C.mid, marginTop: 3 },
  logo: { width: 96, objectFit: 'contain' },
  // Table
  thead: { flexDirection: 'row', backgroundColor: C.band, paddingVertical: 4, paddingHorizontal: 4 },
  th: { color: C.bandText, fontFamily: 'Helvetica-Bold', fontSize: 8, paddingRight: 6 },
  row: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  rowAlt: { backgroundColor: C.zebra },
  cell: { fontSize: 8.5, paddingRight: 6 },
  cellMuted: { fontSize: 7.5, color: C.mid },
  totalRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: C.band, marginTop: 2 },
  totalText: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  footer: { position: 'absolute', bottom: 16, left: 34, right: 34, textAlign: 'center', fontSize: 7, color: C.mid },
});

export type ReportColumn = { header: string; width: number; align?: 'left' | 'right' | 'center' };

export type ShowReportInfo = {
  showName: string;
  organisation: string | null;
  showDate: string;
  generatedAt: string;
};

function ReportShell({
  info,
  title,
  columns,
  rows,
  total,
}: {
  info: ShowReportInfo;
  title: string;
  columns: ReportColumn[];
  /** Each row is an array of cells aligned to `columns`; a cell can be a
   *  string, or {text, sub} to add a small muted sub-line. */
  rows: Array<Array<string | { text: string; sub?: string }>>;
  total?: { label: string; value: string };
}) {
  return (
    <Document title={`${title} — ${info.showName}`} author="Remi Show Manager">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {info.organisation ? <Text style={s.org}>{info.organisation}</Text> : null}
            <Text style={s.showName}>{info.showName}</Text>
            <Text style={s.title}>{title}</Text>
            <Text style={s.meta}>
              {info.showDate}  ·  Generated {info.generatedAt}
            </Text>
          </View>
          {remiLogo ? <Image src={remiLogo} style={s.logo} /> : null}
        </View>

        <View style={s.thead} fixed>
          {columns.map((c, i) => (
            <Text
              key={i}
              style={[s.th, { width: `${c.width}%`, textAlign: c.align ?? 'left' }]}
            >
              {c.header}
            </Text>
          ))}
        </View>

        {rows.map((row, ri) => (
          <View key={ri} style={ri % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
            {row.map((cell, ci) => {
              const col = columns[ci];
              const align = col?.align ?? 'left';
              if (typeof cell === 'string') {
                return (
                  <Text key={ci} style={[s.cell, { width: `${col?.width ?? 10}%`, textAlign: align }]}>
                    {cell}
                  </Text>
                );
              }
              return (
                <View key={ci} style={{ width: `${col?.width ?? 10}%` }}>
                  <Text style={[s.cell, { textAlign: align }]}>{cell.text}</Text>
                  {cell.sub ? <Text style={s.cellMuted}>{cell.sub}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}

        {total ? (
          // minPresenceAhead: never strand the totals row alone at the foot
          // of a near-blank page — move it to the next page if it doesn't fit.
          <View style={s.totalRow} minPresenceAhead={24}>
            <Text style={[s.totalText, { flex: 1 }]}>{total.label}</Text>
            <Text style={s.totalText}>{total.value}</Text>
          </View>
        ) : null}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Produced with Remi  ·  remishowmanager.co.uk  ·  Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export type CatalogueOrderRow = {
  catalogueNumber: string;
  name: string;
  breed: string | null;
  sex: string | null;
  owner: string;
  classes: string;
};

export function CatalogueOrderReport({
  info,
  rows,
  showBreed,
}: {
  info: ShowReportInfo;
  rows: CatalogueOrderRow[];
  showBreed: boolean;
}) {
  const columns: ReportColumn[] = showBreed
    ? [
        { header: 'No.', width: 7, align: 'right' },
        { header: 'Dog', width: 30 },
        { header: 'Breed', width: 18 },
        { header: 'Sex', width: 7 },
        { header: 'Owner', width: 20 },
        { header: 'Classes', width: 18 },
      ]
    : [
        { header: 'No.', width: 8, align: 'right' },
        { header: 'Dog', width: 38 },
        { header: 'Sex', width: 9 },
        { header: 'Owner', width: 25 },
        { header: 'Classes', width: 20 },
      ];

  const sexLabel = (sx: string | null) => (sx === 'dog' ? 'Dog' : sx === 'bitch' ? 'Bitch' : '');
  const body = rows.map((r) =>
    showBreed
      ? [r.catalogueNumber, r.name, r.breed ?? '', sexLabel(r.sex), r.owner, r.classes]
      : [r.catalogueNumber, r.name, sexLabel(r.sex), r.owner, r.classes],
  );

  return (
    <ReportShell
      info={info}
      title="Exhibitor List"
      columns={columns}
      rows={body}
      total={{ label: `${rows.length} entries`, value: '' }}
    />
  );
}

export type PrebookedCatalogueRow = {
  name: string;
  type: 'Printed' | 'Online';
  quantity: number;
};

export function PrebookedCataloguesReport({
  info,
  rows,
}: {
  info: ShowReportInfo;
  rows: PrebookedCatalogueRow[];
}) {
  const columns: ReportColumn[] = [
    { header: 'No.', width: 8, align: 'right' },
    { header: 'Exhibitor', width: 56 },
    { header: 'Type', width: 20 },
    { header: 'Copies', width: 16, align: 'right' },
  ];
  // Printed first (the club prints these), then online, each alphabetical.
  const ordered = [...rows].sort(
    (a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'Printed' ? -1 : 1),
  );
  const body = ordered.map((r, i) => [String(i + 1), r.name, r.type, String(r.quantity)]);
  const printedCopies = rows.filter((r) => r.type === 'Printed').reduce((s, r) => s + r.quantity, 0);
  const onlineCount = rows.filter((r) => r.type === 'Online').length;

  return (
    <ReportShell
      info={info}
      title="Pre-booked Catalogues"
      columns={columns}
      rows={body}
      total={{ label: `${rows.length} orders`, value: `${printedCopies} printed · ${onlineCount} online` }}
    />
  );
}

export type ClassBreakdownRow = {
  label: string;
  name: string;
  sex: string | null;
  count: number;
};

export function ClassBreakdownReport({
  info,
  rows,
}: {
  info: ShowReportInfo;
  rows: ClassBreakdownRow[];
}) {
  const columns: ReportColumn[] = [
    { header: 'No.', width: 12, align: 'right' },
    { header: 'Class', width: 58 },
    { header: 'Sex', width: 14 },
    { header: 'Entries', width: 16, align: 'right' },
  ];
  const sexLabel = (sx: string | null) => (sx === 'dog' ? 'Dogs' : sx === 'bitch' ? 'Bitches' : '');
  const body = rows.map((r) => [r.label, r.name, sexLabel(r.sex), String(r.count)]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <ReportShell
      info={info}
      title="Class Breakdown"
      columns={columns}
      rows={body}
      total={{ label: `${rows.length} classes`, value: `${total} entries` }}
    />
  );
}
