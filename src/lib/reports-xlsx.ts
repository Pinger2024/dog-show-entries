/**
 * Excel (.xlsx) output for the secretary reports — real Excel Tables
 * (filter buttons, banded rows, typed columns), not a CSV wearing an xlsx
 * extension. Every builder here is fed rows produced by the SAME
 * row-builder function (or the same DB query) the report's PDF/CSV output
 * uses — see report-rows.ts and server/services/report-queries.ts — so a
 * secretary can never see the PDF and the spreadsheet disagree.
 *
 * Styling follows sv-results-xlsx.ts: Remi-green header, frozen header row,
 * a blank seed row when there's no data (a table needs at least one row).
 */
import ExcelJS from 'exceljs';
import { classBreakdownFooter, type CatalogueOrderRow, type PrebookedCatalogueRow, type ClassBreakdownRow } from '@/components/reports/show-report-pdf';
import type { AbsenteeRow, FinancialStatementRow } from '@/lib/report-rows';
import type { Sh01BreedRow } from '@/lib/sh01-absentee';

export interface XlsxColumn {
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

async function buildTableXlsx(opts: {
  sheetName: string;
  tableName: string;
  columns: XlsxColumn[];
  rows: (string | number)[][];
  /** Reconciliation/summary line(s) written a couple of rows below the
   *  table — kept OUTSIDE the Excel Table itself so they don't count as a
   *  data row (mirrors the PDF's `total`/`note` footer). */
  footerNote?: string[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Remi Show Manager';
  wb.created = new Date(0); // deterministic — avoids Date.now() in output

  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.addTable({
    name: opts.tableName,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight8', showRowStripes: true },
    columns: opts.columns.map((c) => ({ name: c.header, filterButton: true })),
    // A table must have at least one row; seed a blank row when there are none.
    rows: opts.rows.length > 0 ? opts.rows : [opts.columns.map(() => '')],
  });

  opts.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? 16;
    if (c.align) col.alignment = { horizontal: c.align };
  });

  for (let c = 1; c <= opts.columns.length; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D5F3F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }
  ws.getRow(1).height = 26;

  if (opts.footerNote?.length) {
    const tableRowCount = Math.max(opts.rows.length, 1);
    let r = tableRowCount + 3; // table header + rows + one blank row
    for (const line of opts.footerNote) {
      const cell = ws.getRow(r).getCell(1);
      cell.value = line;
      cell.font = { italic: true, color: { argb: 'FF52525B' } };
      r += 1;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const sexLabel = (sx: string | null) => (sx === 'dog' ? 'Dog' : sx === 'bitch' ? 'Bitch' : '');
const sexLabelPlural = (sx: string | null) => (sx === 'dog' ? 'Dogs' : sx === 'bitch' ? 'Bitches' : '');

// ── Exhibitor List ────────────────────────────────────────────────────────

export async function buildExhibitorListXlsx(rows: CatalogueOrderRow[], showBreed: boolean): Promise<Buffer> {
  const columns: XlsxColumn[] = showBreed
    ? [
        { header: 'No.', width: 8, align: 'right' },
        { header: 'Dog', width: 32 },
        { header: 'Breed', width: 20 },
        { header: 'Sex', width: 10 },
        { header: 'Owner', width: 26 },
        { header: 'Classes', width: 26 },
      ]
    : [
        { header: 'No.', width: 8, align: 'right' },
        { header: 'Dog', width: 32 },
        { header: 'Sex', width: 10 },
        { header: 'Owner', width: 26 },
        { header: 'Classes', width: 26 },
      ];
  const tableRows = rows.map((r) =>
    showBreed
      ? [r.catalogueNumber, r.name, r.breed ?? '', sexLabel(r.sex), r.owner, r.classes]
      : [r.catalogueNumber, r.name, sexLabel(r.sex), r.owner, r.classes],
  );
  return buildTableXlsx({
    sheetName: 'Exhibitor List',
    tableName: 'ExhibitorList',
    columns,
    rows: tableRows,
    footerNote: [`${rows.length} entries`],
  });
}

// ── Pre-booked Catalogues ────────────────────────────────────────────────

export async function buildPrebookedCataloguesXlsx(rows: PrebookedCatalogueRow[]): Promise<Buffer> {
  const columns: XlsxColumn[] = [
    { header: 'No.', width: 8, align: 'right' },
    { header: 'Exhibitor', width: 30 },
    { header: 'Type', width: 14 },
    { header: 'Copies', width: 12, align: 'right' },
  ];
  const ordered = [...rows].sort(
    (a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'Printed' ? -1 : 1),
  );
  const tableRows = ordered.map((r, i) => [i + 1, r.name, r.type, r.quantity]);
  const printedCopies = rows.filter((r) => r.type === 'Printed').reduce((s, r) => s + r.quantity, 0);
  const onlineCount = rows.filter((r) => r.type === 'Online').length;
  return buildTableXlsx({
    sheetName: 'Pre-booked Catalogues',
    tableName: 'PrebookedCatalogues',
    columns,
    rows: tableRows,
    footerNote: [`${rows.length} orders — ${printedCopies} printed · ${onlineCount} online`],
  });
}

// ── Class Breakdown ───────────────────────────────────────────────────────

export async function buildClassBreakdownXlsx(rows: ClassBreakdownRow[], dogCount?: number): Promise<Buffer> {
  const columns: XlsxColumn[] = [
    { header: 'No.', width: 10, align: 'right' },
    { header: 'Class', width: 40 },
    { header: 'Sex', width: 12 },
    { header: 'Entries', width: 12, align: 'right' },
  ];
  const tableRows = rows.map((r) => [r.label, r.name, sexLabelPlural(r.sex), r.count]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const footer = classBreakdownFooter(total, dogCount);
  const footerNote = [`${rows.length} classes — ${footer.value}`, ...(footer.note ? [footer.note] : [])];
  return buildTableXlsx({ sheetName: 'Class Breakdown', tableName: 'ClassBreakdown', columns, rows: tableRows, footerNote });
}

// ── Absentees (three separate reports, same row shape) ───────────────────

export async function buildAbsenteeXlsx(
  rows: AbsenteeRow[],
  meta: { sheetName: string; tableName: string; includeStatus: boolean },
): Promise<Buffer> {
  const columns: XlsxColumn[] = [
    { header: 'Catalogue No', width: 12, align: 'right' },
    { header: 'Dog Name', width: 26 },
    { header: 'Breed', width: 20 },
    { header: 'Sex', width: 10 },
    { header: 'Classes', width: 30 },
    { header: 'Owner', width: 24 },
    { header: 'Exhibitor', width: 24 },
    ...(meta.includeStatus ? [{ header: 'Status', width: 12 } satisfies XlsxColumn] : []),
  ];
  const tableRows = rows.map((r) => {
    const base: (string | number)[] = [
      r.catalogueNumber,
      r.dogName,
      r.breed,
      r.sex,
      r.classes,
      r.owner,
      r.exhibitor,
    ];
    if (meta.includeStatus) base.push(r.status);
    return base;
  });
  return buildTableXlsx({ sheetName: meta.sheetName, tableName: meta.tableName, columns, rows: tableRows });
}

// ── RKC SH01 Return ────────────────────────────────────────────────────────

export async function buildSh01Xlsx(breeds: Sh01BreedRow[]): Promise<Buffer> {
  const columns: XlsxColumn[] = [
    { header: 'Breed', width: 24 },
    { header: 'Judged Separately', width: 16 },
    { header: 'No. of Dogs', width: 12, align: 'right' },
    { header: 'No. of Absentees (Dogs)', width: 16, align: 'right' },
    { header: 'No. of Bitches', width: 12, align: 'right' },
    { header: 'No. of Absentees (Bitches)', width: 16, align: 'right' },
    { header: 'No. of Dogs & Bitches (Mixed)', width: 18, align: 'right' },
    { header: 'No. of Absentees (Mixed)', width: 16, align: 'right' },
  ];
  const tableRows = breeds.map((r) => [
    r.breedName,
    r.judgedSeparately ? 'Yes' : 'No',
    r.judgedSeparately ? r.dogs : '',
    r.judgedSeparately ? r.absentDogs : '',
    r.judgedSeparately ? r.bitches : '',
    r.judgedSeparately ? r.absentBitches : '',
    r.judgedSeparately ? '' : r.mixed,
    r.judgedSeparately ? '' : r.absentMixed,
  ]);
  return buildTableXlsx({ sheetName: 'RKC SH01 Return', tableName: 'Sh01Return', columns, rows: tableRows });
}

// ── Financial Statement ──────────────────────────────────────────────────

export async function buildFinancialStatementXlsx(rows: FinancialStatementRow[]): Promise<Buffer> {
  const columns: XlsxColumn[] = [
    { header: 'Dog', width: 26 },
    { header: 'Exhibitor', width: 24 },
    { header: 'Status', width: 14 },
    { header: 'Classes', width: 30 },
    { header: 'Fee (£)', width: 12, align: 'right' },
    { header: 'Catalogue Ordered', width: 16 },
  ];
  const tableRows = rows.map((r) => [r.dog, r.exhibitor, r.status, r.classes, r.fee, r.catalogueOrdered]);
  return buildTableXlsx({ sheetName: 'Financial Statement', tableName: 'FinancialStatement', columns, rows: tableRows });
}
