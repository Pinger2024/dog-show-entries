/**
 * Pure row-builders shared between a report's CSV/PDF rendering and its
 * Excel (.xlsx) twin — so the two outputs can never disagree about what a
 * row means. Each function here takes already-fetched data (from whichever
 * Drizzle query the CSV/PDF route already runs) and returns a plain typed
 * row object. No DB access, no framework imports — safe to import from a
 * 'use client' file as well as from a server route.
 *
 * Mirrors the discipline established for the SV Results report
 * (buildSvResultsReport / buildSvResultsXlsxRows sharing computeClassMembers
 * in sv-results.ts): one function builds the row, every output format just
 * formats it differently.
 */
import type { CatalogueOrderRow, ClassBreakdownRow } from '@/components/reports/show-report-pdf';

// ── Exhibitor List ──────────────────────────────────────────────────────

export interface CatalogueOrderEntryInput {
  catalogueNumber: string | null;
  dog: {
    registeredName: string | null;
    breed: { name: string | null } | null;
    sex: string | null;
    owners: { ownerName: string }[] | null;
  } | null;
  exhibitor: { name: string | null } | null;
  entryClasses: { showClass: { id: string } | null }[];
}

/** Same rows the Exhibitor List PDF renders — reused verbatim for its xlsx
 *  twin so the two can't drift apart. */
export function buildCatalogueOrderRows(
  confirmed: CatalogueOrderEntryInput[],
  classLabelMap: Map<string, string>,
): CatalogueOrderRow[] {
  return confirmed
    .slice()
    .sort((a, b) => parseInt(a.catalogueNumber ?? '0') - parseInt(b.catalogueNumber ?? '0'))
    .map((e) => {
      const owner =
        e.dog?.owners?.map((o) => o.ownerName).filter(Boolean).join(' & ') ||
        e.exhibitor?.name ||
        '';
      const classes = e.entryClasses
        .map((ec) => (ec.showClass ? classLabelMap.get(ec.showClass.id) : null))
        .filter(Boolean)
        .join(', ');
      return {
        catalogueNumber: e.catalogueNumber ?? '—',
        name: e.dog?.registeredName ?? 'Junior Handler',
        breed: e.dog?.breed?.name ?? null,
        sex: e.dog?.sex ?? null,
        owner,
        classes,
      };
    });
}

// ── Class Breakdown ─────────────────────────────────────────────────────

export interface ClassBreakdownClassInput {
  id: string;
  classNumber: number | null;
  sex: string | null;
  classDefinition: { name: string | null } | null;
}

/** Same rows the Class Breakdown PDF renders — reused verbatim for its xlsx
 *  twin. `orderedClasses` and `counts` are the values the PDF route already
 *  computes (schedule order, Junior Handlers last; confirmed-entry counts
 *  per class). */
export function buildClassBreakdownRows(
  orderedClasses: ClassBreakdownClassInput[],
  counts: Map<string, number>,
  classLabelMap: Map<string, string>,
): ClassBreakdownRow[] {
  return orderedClasses.map((sc) => ({
    label: classLabelMap.get(sc.id) ?? (sc.classNumber != null ? String(sc.classNumber) : ''),
    name: sc.classDefinition?.name ?? 'Class',
    sex: sc.sex,
    count: counts.get(sc.id) ?? 0,
  }));
}

// ── Absentees (Catalogue PDF / CSV / Withdrawn & Absent) ────────────────
//
// Three separate reports share this row shape but answer different
// questions via different WHERE clauses (see
// src/server/services/report-queries.ts for the shared where-clause
// builders). Never merge the three lists — they exist because Mandy asked
// three different questions of the same entries table.

export interface AbsenteeEntryInput {
  catalogueNumber: string | null;
  status: string;
  dog: {
    registeredName: string | null;
    breed: { name: string | null } | null;
    sex: string | null;
    owners: { ownerName: string }[] | null;
  } | null;
  exhibitor: { name: string | null } | null;
  entryClasses: {
    showClass: { classNumber: number | null; classDefinition: { name: string | null } | null } | null;
  }[];
}

export interface AbsenteeRow {
  catalogueNumber: string;
  dogName: string;
  breed: string;
  sex: string;
  classes: string;
  owner: string;
  exhibitor: string;
  status: 'Withdrawn' | 'Absent';
}

export function buildAbsenteeRow(entry: AbsenteeEntryInput): AbsenteeRow {
  return {
    catalogueNumber: entry.catalogueNumber ?? '',
    dogName: entry.dog?.registeredName ?? 'Junior Handler',
    breed: entry.dog?.breed?.name ?? '',
    sex: entry.dog?.sex === 'dog' ? 'Dog' : entry.dog?.sex === 'bitch' ? 'Bitch' : '',
    classes: entry.entryClasses
      .map((ec) => {
        const num = ec.showClass?.classNumber;
        const name = ec.showClass?.classDefinition?.name ?? '';
        return num != null ? `${num}. ${name}` : name;
      })
      .filter(Boolean)
      .join('; '),
    owner: entry.dog?.owners?.map((o) => o.ownerName).join(' & ') ?? '',
    exhibitor: entry.exhibitor?.name ?? '',
    status: entry.status === 'withdrawn' ? 'Withdrawn' : 'Absent',
  };
}

// ── Financial Statement ─────────────────────────────────────────────────

export interface FinancialStatementEntryInput {
  dog: { registeredName: string | null } | null;
  exhibitor: { name: string | null; email: string | null } | null;
  status: string;
  entryClasses: { showClass: { classDefinition: { name: string | null } | null } | null }[];
  totalFee: number;
}

export interface FinancialStatementRow {
  dog: string;
  exhibitor: string;
  status: string;
  classes: string;
  fee: string;
  catalogueOrdered: 'Yes' | 'No';
}

export function buildFinancialStatementRow(
  entry: FinancialStatementEntryInput,
  catalogueBuyerEmails: Set<string>,
): FinancialStatementRow {
  return {
    dog: entry.dog?.registeredName ?? 'Unknown',
    exhibitor: entry.exhibitor?.name ?? 'Unknown',
    status: entry.status,
    classes: entry.entryClasses.map((ec) => ec.showClass?.classDefinition?.name ?? '').join('; '),
    fee: (entry.totalFee / 100).toFixed(2),
    catalogueOrdered:
      entry.exhibitor?.email && catalogueBuyerEmails.has(entry.exhibitor.email.toLowerCase()) ? 'Yes' : 'No',
  };
}
