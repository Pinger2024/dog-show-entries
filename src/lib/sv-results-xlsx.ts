/**
 * SV / WUSV RESULTS spreadsheet (.xlsx) export — server-only.
 *
 * Writes the flat one-row-per-dog table (column layout copied from the GSDL
 * "Results for SV" sheet) as a proper Excel Table so the regional club can
 * sort / filter / merge it into their own SV admin. Built on top of the pure
 * row builder in `sv-results.ts` so the spreadsheet and the PDF always agree.
 */
import ExcelJS from 'exceljs';
import { SV_XLSX_COLUMNS, type SvXlsxRow } from './sv-results';

/** Flatten a typed row into the exact 34-cell order of SV_XLSX_COLUMNS.
 *  Columns Remi doesn't store granularly (affix splits, height, depth) stay
 *  blank — every value Remi holds lands in its correct column. */
function rowToCells(r: SvXlsxRow): (string | number)[] {
  return [
    r.venue,
    r.date,
    r.className,
    r.judge,
    r.ringNumber,
    r.dogName,
    r.dogAdditionalAffix, // Additional Affix
    r.dogAffix, // Affix
    r.registrationBody,
    r.registrationNumber,
    r.dateOfBirth,
    r.microchip,
    r.sireName,
    r.sireAdditionalAffix, // Sire's Additional Affix
    r.sireAffix, // Affix2
    r.sireRegistrationBody,
    r.sireRegistrationNumber,
    r.damName,
    r.damAdditionalAffix, // Dam's Additional Affix
    r.damAffix, // Dam's Affix
    r.damRegistrationBody,
    r.damRegistrationNumber,
    r.breederFirstName,
    r.breederSurname,
    r.breederCityPostcode,
    r.breederCountry,
    r.ownerFirstName,
    r.ownerSurname,
    r.ownerCityPostcode,
    r.ownerCountry,
    r.grading,
    r.placing,
    '', // Height
    '', // Depth
  ];
}

/** Per-column widths (chars) — wide enough for names/affixes, snug for codes. */
const COLUMN_WIDTHS: Record<string, number> = {
  Venue: 16,
  Date: 12,
  Class: 14,
  Judge: 18,
  'Ring Number': 11,
  "Dog's Name": 22,
  'Registration Body': 12,
  'Registration Number': 18,
  'Date Birth': 12,
  'Micro-chip Number': 18,
  'Registered Name of Sire': 22,
  "Sire's Registration Body": 12,
  "Sire's Registration Number": 18,
  'Registered Name of Dam': 22,
  "Dam's Registration Body": 12,
  "Dam's Registration Number": 18,
  "Breeder's First Name": 16,
  "Breeder's Surname": 16,
  "Breeder's City and Postcode": 22,
  "Breeder's Country": 14,
  "Owner's First Name": 16,
  "Owner's Surname": 16,
  "Owner's City and Postcode": 22,
  "Owner's Country": 14,
  Grading: 9,
  Placing: 8,
};

export async function buildSvResultsXlsx(
  rows: SvXlsxRow[],
  meta: { showName: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Remi Show Manager';
  wb.created = new Date(0); // deterministic — avoids Date.now() in output

  const ws = wb.addWorksheet('Results for SV', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Real Excel Table — gives the club filter buttons + banded rows.
  ws.addTable({
    name: 'ResultsForSV',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight8', showRowStripes: true },
    columns: SV_XLSX_COLUMNS.map((name) => ({ name, filterButton: true })),
    // A table must have at least one row; seed a blank row when there are none.
    rows: rows.length > 0 ? rows.map(rowToCells) : [SV_XLSX_COLUMNS.map(() => '')],
  });

  // Column widths.
  SV_XLSX_COLUMNS.forEach((name, i) => {
    ws.getColumn(i + 1).width = COLUMN_WIDTHS[name] ?? 14;
  });

  // Header row: a solid Remi-green fill with bold white text so the column
  // names are always legible (the table theme alone rendered dark-on-dark in
  // some viewers). Wrap + a taller row keeps the longer names readable.
  for (let c = 1; c <= SV_XLSX_COLUMNS.length; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D5F3F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }
  ws.getRow(1).height = 30;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
