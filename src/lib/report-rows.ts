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
import {
  appendRegistrationFlags,
  type RegistrationFlags,
} from '@/lib/registration-flags';

// ── Exhibitor List ──────────────────────────────────────────────────────

export interface CatalogueOrderEntryInput extends RegistrationFlags {
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
        // RKC paperwork flags print after the name here exactly as in the
        // catalogue — same helper, so the two can never word it differently.
        name: e.dog?.registeredName
          ? appendRegistrationFlags(e.dog.registeredName, e)!
          : 'Junior Handler',
        breed: e.dog?.breed?.name ?? null,
        sex: e.dog?.sex ?? null,
        owner,
        classes,
      };
    });
}

// ── Membership claim (Entry Report) ─────────────────────────────────────

export interface MembershipClaimOrder {
  regionalMembership: string | null;
  regionalMembershipNumber: string | null;
  discountGroup: { label: string | null } | null;
}

/** What the exhibitor claimed at checkout to unlock a member rate — the
 *  regional membership option (+ the number they typed), or the RKC
 *  discount group label. Empty string = no claim, they paid the standard
 *  rate. Shown on the Entry Report so the membership secretary can verify
 *  claims against the club's records (Mandy 2026-08-10). */
export function membershipClaimLabel(order: MembershipClaimOrder | null | undefined): string {
  if (!order) return '';
  if (order.regionalMembership) {
    return order.regionalMembershipNumber
      ? `${order.regionalMembership} (${order.regionalMembershipNumber})`
      : order.regionalMembership;
  }
  return order.discountGroup?.label ?? '';
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

export interface AbsenteeEntryInput extends RegistrationFlags {
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
    /** Per-class attendance (Mandy 2026-08-12) — true when THIS class was
     *  marked absent, independent of any other class the entry holds. */
    absent: boolean;
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
  // Withdrawal is a whole-entry status (not per-class), so a withdrawn row
  // lists every class she'd been entered in. An "Absent" row, though, is
  // per-class (Mandy 2026-08-12) — an entry can be absent from one class and
  // present in another (e.g. her breed class vs. a Special Award), so it
  // lists only the classes she was actually marked absent from.
  const isWithdrawn = entry.status === 'withdrawn';
  const listedClasses = isWithdrawn
    ? entry.entryClasses
    : entry.entryClasses.filter((ec) => ec.absent);
  return {
    catalogueNumber: entry.catalogueNumber ?? '',
    dogName: entry.dog?.registeredName
      ? appendRegistrationFlags(entry.dog.registeredName, entry)!
      : 'Junior Handler',
    breed: entry.dog?.breed?.name ?? '',
    sex: entry.dog?.sex === 'dog' ? 'Dog' : entry.dog?.sex === 'bitch' ? 'Bitch' : '',
    classes: listedClasses
      .map((ec) => {
        const num = ec.showClass?.classNumber;
        const name = ec.showClass?.classDefinition?.name ?? '';
        return num != null ? `${num}. ${name}` : name;
      })
      .filter(Boolean)
      .join('; '),
    owner: entry.dog?.owners?.map((o) => o.ownerName).join(' & ') ?? '',
    exhibitor: entry.exhibitor?.name ?? '',
    status: isWithdrawn ? 'Withdrawn' : 'Absent',
  };
}

// ── Financial Statement ─────────────────────────────────────────────────

export interface FinancialStatementEntryInput {
  dog: { registeredName: string | null } | null;
  naf?: boolean | null;
  taf?: boolean | null;
  cnaf?: boolean | null;
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
    dog: entry.dog?.registeredName
      ? appendRegistrationFlags(entry.dog.registeredName, entry)!
      : 'Unknown',
    exhibitor: entry.exhibitor?.name ?? 'Unknown',
    status: entry.status,
    classes: entry.entryClasses.map((ec) => ec.showClass?.classDefinition?.name ?? '').join('; '),
    fee: (entry.totalFee / 100).toFixed(2),
    catalogueOrdered:
      entry.exhibitor?.email && catalogueBuyerEmails.has(entry.exhibitor.email.toLowerCase()) ? 'Yes' : 'No',
  };
}
