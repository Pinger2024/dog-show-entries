/**
 * SV / WUSV graded RESULTS report — pure data-shaping logic.
 *
 * Produces the two regional-club deliverables from a show's results:
 *   1. `buildSvResultsReport` — the structured tree the PDF renders
 *      (Short Coat / Long Coats → class → graded rows + absentees, with a
 *      Best/Most-Promising + Junior Handling footer).
 *   2. `buildSvResultsXlsxRows` — the flat one-row-per-dog table the
 *      spreadsheet export writes.
 *
 * This module is DB- and React-free so the ordering, grading and absentee
 * numbering can be unit-tested in isolation. Both surfaces consume the same
 * per-class computation (`computeClassMembers`) so the PDF and the .xlsx can
 * never disagree about a dog's grade or placing.
 *
 * SV conventions baked in here (source: GSDL British Regional Group Spring
 * Show 2026 results sheet — see research/regional-reports/):
 *   - The RESULTS sheet runs OLDEST class first (Working → Minor Puppy),
 *     MALE before female — the reverse of the schedule/catalogue, which runs
 *     youngest-first, bitch-first. We key off the shared SV_AGE_ORDER and flip.
 *   - Within a class, dogs are ranked WITHIN their grade and the count
 *     restarts per grade (V1, V2, then G1…). Absentees stay in the list,
 *     shown as `Abs` with placing 90, 91, 92… in ring-number order.
 *   - Grade tiers, best-of awards and the age bands all match the SV rulebook.
 */

import { SV_AGE_ORDER, svDisplayAge } from './class-labels';
import { formatRegNumber } from '@/components/catalogue/catalogue-utils';

export type SvCoat = 'stock' | 'long_stock';

// ── Input shapes (minimal, decoupled from Drizzle rows) ─────────────

export interface SvResultInput {
  svGrade: string | null;
  placement: number | null;
  placementStatus: string | null;
}

export interface SvEntryClassInput {
  showClassId: string;
  result: SvResultInput | null;
}

export interface SvOwnerInput {
  ownerName: string;
  ownerAddress: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface SvDogInput {
  registeredName: string;
  sex: 'dog' | 'bitch' | null;
  coatType: SvCoat | null;
  dateOfBirth: string | null;
  microchipNumber: string | null;
  registrationBody: string | null;
  registrationBodyOther: string | null;
  kcRegNumber: string | null;
  sireName: string | null;
  sireRegistrationBody: string | null;
  sireRegistrationNumber: string | null;
  damName: string | null;
  damRegistrationBody: string | null;
  damRegistrationNumber: string | null;
  breederName: string | null;
  breederCity: string | null;
  breederPostcode: string | null;
  breederCountry: string | null;
  owners: SvOwnerInput[];
}

export interface SvEntryInput {
  id: string;
  absent: boolean;
  catalogueNumber: string | null;
  entryType: 'standard' | 'junior_handler';
  dog: SvDogInput | null;
  juniorHandler: { handlerName: string; dateOfBirth: string } | null;
  entryClasses: SvEntryClassInput[];
}

export interface SvShowClassInput {
  id: string;
  sex: 'dog' | 'bitch' | null;
  svCoatType: SvCoat | null;
  classNumber: number | null;
  sortOrder: number | null;
  classDefinition: { type: string | null; name: string | null } | null;
}

export interface SvAchievementInput {
  type: string;
  dog: { registeredName: string } | null;
}

export interface SvJudgeRowInput {
  judge?: { id?: string | null; name?: string | null } | null;
  breed?: { name?: string | null } | null;
  sex?: string | null;
  isSpecialAwardsClassesJudge?: boolean | null;
  subjectToRkcApproval?: boolean | null;
  judgeRoleId?: string | null;
}

export interface SvResultsReportInput {
  showClasses: SvShowClassInput[];
  entries: SvEntryInput[];
  achievements: SvAchievementInput[];
  judges: SvJudgeRowInput[];
}

// ── Output shapes ───────────────────────────────────────────────────

export interface SvDogRow {
  /** Grade code for display — 'V' / 'SG' / 'G' / 'VP' …, 'Abs' for an
   *  absentee, 'Disqualified' for a DQ, or '' when no grade is recorded. */
  grade: string;
  /** Within-grade rank ('1', '2' …) or absentee marker ('90', '91' …). */
  placement: string;
  name: string;
  sire: string;
  dam: string;
  absent: boolean;
}

export interface SvResultsClass {
  /** e.g. "Working Male (2 years +)". */
  label: string;
  rows: SvDogRow[];
}

export interface SvResultsCoatSection {
  coat: SvCoat | null;
  /** "Short Coat" / "Long Coats", or null for a single-coat (un-split) show. */
  title: string | null;
  classes: SvResultsClass[];
}

export interface SvFooterAward {
  label: string;
  dogName: string;
}

export interface SvJhGroup {
  label: string;
  rows: { placement: string; handler: string }[];
}

export interface SvResultsReportData {
  entered: number;
  present: number;
  absent: number;
  absenteePct: number;
  judgeName: string | null;
  coatSections: SvResultsCoatSection[];
  awards: SvFooterAward[];
  jhJudgeName: string | null;
  jhGroups: SvJhGroup[];
}

// ── Constants ───────────────────────────────────────────────────────

/** Highest → lowest grade, used to order dogs within a class. */
const SV_GRADE_RANK = ['v', 'sg', 'g', 'a', 'm', 'u', 'vp', 'p', 'wv', 'disqualified'];

const GRADE_DISPLAY: Record<string, string> = {
  v: 'V',
  sg: 'SG',
  g: 'G',
  a: 'A',
  m: 'M',
  u: 'U',
  vp: 'VP',
  p: 'P',
  wv: 'WV',
  disqualified: 'Disqualified',
};

/** SV age bands (months) — differ from RKC. Source: reference_sv_schedule. */
const AGE_RANGE: Record<string, string> = {
  'Baby Puppy': '4-6 months',
  'Minor Puppy': '6-9 months',
  Puppy: '9-12 months',
  Junior: '12-18 months',
  Yearling: '18-24 months',
  Adult: '2 years +',
  Working: '2 years +',
};

/** Coat-section ordering + headings for the PDF — Long Coats first, matching
 *  the 1a Long / 1b Short class convention the regional groups adopted
 *  2026-08-11 (Mandy: "flip the results page too so everything matches";
 *  previously Short-first, mirroring the League's old results sheet). */
const COAT_ORDER: { coat: SvCoat | null; title: string | null }[] = [
  { coat: 'long_stock', title: 'Long Coats' },
  { coat: 'stock', title: 'Short Coat' },
  { coat: null, title: null },
];

/** Footer best-of awards in their printed order, mapped to achievement types. */
const FOOTER_AWARDS: { type: string; label: string }[] = [
  { type: 'best_dog', label: 'Best Male' },
  { type: 'best_bitch', label: 'Best Female' },
  { type: 'most_promising_young_dog', label: 'Most Promising Male' },
  { type: 'most_promising_young_bitch', label: 'Most Promising Female' },
];

// ── Small helpers ───────────────────────────────────────────────────

/** SV uses "Male/Female" for the older classes and "Dog/Bitch" for puppies. */
export function svSexWord(age: string, sex: 'dog' | 'bitch'): string {
  const isPuppy = age === 'Puppy' || age === 'Minor Puppy' || age === 'Baby Puppy';
  if (sex === 'dog') return isPuppy ? 'Dog' : 'Male';
  return isPuppy ? 'Bitch' : 'Female';
}

/** "Working Male (2 years +)" / "Minor Puppy Bitch (6-9 months)". */
export function svClassLabel(age: string, sex: 'dog' | 'bitch' | null): string {
  const range = AGE_RANGE[age];
  const base = sex ? `${age} ${svSexWord(age, sex)}` : age;
  return range ? `${base} (${range})` : base;
}

/** "Anton x Bailey" — the pedigree line. Blank halves are tolerated. */
export function formatSireDam(sire: string | null, dam: string | null): { sire: string; dam: string } {
  return { sire: (sire ?? '').trim(), dam: (dam ?? '').trim() };
}

/** Ring numbers sort numerically when they're numeric, else lexically. */
function ringSort(a: string | null, b: string | null): number {
  const an = parseInt(a ?? '', 10);
  const bn = parseInt(b ?? '', 10);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return (a ?? '').localeCompare(b ?? '');
}

// ── Per-class computation (shared by PDF + xlsx) ────────────────────

/** One dog's computed standing in a class, carrying both display strings
 *  and the source entry so the xlsx can read every pedigree field. */
export interface SvComputedRow {
  entry: SvEntryInput;
  showClass: SvShowClassInput;
  gradeCode: string | null; // lower-case enum value, null if ungraded
  gradeDisplay: string; // 'V' / 'SG' / 'Abs' / 'Disqualified' / ''
  placementDisplay: string; // '1' / '90' / ''
  placementNumber: number | null; // numeric placing for the xlsx
  absent: boolean;
}

/**
 * Rank every dog in one show-class. Present dogs are grouped by grade (in
 * SV_GRADE_RANK order) and numbered 1..n within each grade, in the steward's
 * placing order; absentees follow, numbered 90, 91… in ring-number order.
 */
export function computeClassMembers(
  showClass: SvShowClassInput,
  members: { entry: SvEntryInput; result: SvResultInput | null }[],
): SvComputedRow[] {
  const present = members.filter((m) => !m.entry.absent);
  const absent = members.filter((m) => m.entry.absent);
  const out: SvComputedRow[] = [];

  // Present dogs, grade by grade.
  const byGrade = new Map<string, { entry: SvEntryInput; result: SvResultInput | null }[]>();
  const ungraded: { entry: SvEntryInput; result: SvResultInput | null }[] = [];
  for (const m of present) {
    const grade = m.result?.svGrade ?? null;
    if (grade && grade !== 'disqualified') {
      const list = byGrade.get(grade) ?? [];
      list.push(m);
      byGrade.set(grade, list);
    } else {
      ungraded.push(m);
    }
  }

  for (const grade of SV_GRADE_RANK) {
    if (grade === 'disqualified') continue;
    const list = byGrade.get(grade);
    if (!list) continue;
    list.sort((a, b) => (a.result?.placement ?? 9999) - (b.result?.placement ?? 9999));
    list.forEach((m, i) => {
      out.push({
        entry: m.entry,
        showClass,
        gradeCode: grade,
        gradeDisplay: GRADE_DISPLAY[grade] ?? grade.toUpperCase(),
        placementDisplay: String(i + 1),
        placementNumber: i + 1,
        absent: false,
      });
    });
  }

  // Disqualified + ungraded-but-present dogs (rare) after the graded block.
  for (const m of ungraded) {
    const grade = m.result?.svGrade ?? null;
    if (grade === 'disqualified') {
      out.push({
        entry: m.entry,
        showClass,
        gradeCode: 'disqualified',
        gradeDisplay: GRADE_DISPLAY.disqualified,
        placementDisplay: '',
        placementNumber: null,
        absent: false,
      });
    } else {
      const placement = m.result?.placement ?? null;
      out.push({
        entry: m.entry,
        showClass,
        gradeCode: null,
        gradeDisplay: '',
        placementDisplay: placement != null ? String(placement) : '',
        placementNumber: placement,
        absent: false,
      });
    }
  }

  // Absentees: kept in the list, numbered 90+ in ring-number order.
  absent.sort((a, b) => ringSort(a.entry.catalogueNumber, b.entry.catalogueNumber));
  absent.forEach((m, i) => {
    out.push({
      entry: m.entry,
      showClass,
      gradeCode: null,
      gradeDisplay: 'Abs',
      placementDisplay: String(90 + i),
      placementNumber: 90 + i,
      absent: true,
    });
  });

  return out;
}

// ── Class / coat ordering ───────────────────────────────────────────

function ageIndex(name: string | null | undefined): number {
  const idx = SV_AGE_ORDER.indexOf(svDisplayAge(name));
  return idx === -1 ? SV_AGE_ORDER.length : idx;
}

/** Map showClassId → its members ({entry, result}). A standard entry's
 *  entryClasses point at the SV age class it ran in. */
function membersByShowClass(
  entries: SvEntryInput[],
): Map<string, { entry: SvEntryInput; result: SvResultInput | null }[]> {
  const map = new Map<string, { entry: SvEntryInput; result: SvResultInput | null }[]>();
  for (const entry of entries) {
    if (entry.entryType !== 'standard') continue;
    for (const ec of entry.entryClasses) {
      const list = map.get(ec.showClassId) ?? [];
      list.push({ entry, result: ec.result });
      map.set(ec.showClassId, list);
    }
  }
  return map;
}

function judgeNames(judges: SvJudgeRowInput[]): { breed: string[]; jh: string[] } {
  const breed = new Map<string, string>();
  const jh = new Map<string, string>();
  for (const ja of judges) {
    const id = ja.judge?.id;
    const name = ja.judge?.name;
    if (!id || !name) continue;
    if (ja.isSpecialAwardsClassesJudge) continue;
    if (ja.judgeRoleId) continue; // panel/group judges handled elsewhere
    const isJh = !ja.breed?.name && !ja.sex;
    if (isJh) jh.set(id, name);
    else breed.set(id, name);
  }
  return { breed: [...breed.values()], jh: [...jh.values()] };
}

// ── Public builders ─────────────────────────────────────────────────

/** Build the structured tree the PDF renders. */
export function buildSvResultsReport(input: SvResultsReportInput): SvResultsReportData {
  const { showClasses, entries, achievements, judges } = input;
  const memberMap = membersByShowClass(entries);

  const svAgeClasses = showClasses.filter((c) => c.classDefinition?.type === 'sv_age');

  // Coat sections in fixed order; within each, oldest class first then
  // male-before-female. Only classes with at least one dog appear.
  const coatSections: SvResultsCoatSection[] = [];
  for (const { coat, title } of COAT_ORDER) {
    const classesForCoat = svAgeClasses
      .filter((c) => (c.svCoatType ?? null) === coat)
      .sort((a, b) => {
        const ai = ageIndex(a.classDefinition?.name);
        const bi = ageIndex(b.classDefinition?.name);
        if (ai !== bi) return bi - ai; // OLDEST first (reverse age order)
        // Male (dog) before Female (bitch).
        if (a.sex !== b.sex) return a.sex === 'dog' ? -1 : 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });

    const classes: SvResultsClass[] = [];
    for (const sc of classesForCoat) {
      const members = memberMap.get(sc.id) ?? [];
      if (members.length === 0) continue;
      const computed = computeClassMembers(sc, members);
      const age = svDisplayAge(sc.classDefinition?.name);
      classes.push({
        label: svClassLabel(age, sc.sex),
        rows: computed.map((r) => {
          const { sire, dam } = formatSireDam(r.entry.dog?.sireName ?? null, r.entry.dog?.damName ?? null);
          return {
            grade: r.gradeDisplay,
            placement: r.placementDisplay,
            name: r.entry.dog?.registeredName ?? '',
            sire,
            dam,
            absent: r.absent,
          };
        }),
      });
    }

    if (classes.length > 0) coatSections.push({ coat, title, classes });
  }

  // Header counts — over the standard (non-JH) entries that ran an SV class.
  const standardEntries = entries.filter(
    (e) => e.entryType === 'standard' && e.entryClasses.some((ec) => svAgeClasses.find((c) => c.id === ec.showClassId)),
  );
  const entered = standardEntries.length;
  const absent = standardEntries.filter((e) => e.absent).length;
  const present = entered - absent;
  const absenteePct = entered > 0 ? Math.round((absent / entered) * 100) : 0;

  // Footer awards from the canonical achievements store.
  const awards: SvFooterAward[] = [];
  for (const fa of FOOTER_AWARDS) {
    const ach = achievements.find((a) => a.type === fa.type && a.dog?.registeredName);
    if (ach?.dog?.registeredName) awards.push({ label: fa.label, dogName: ach.dog.registeredName });
  }

  // Junior Handling groups (each JH class is an age group with its own list).
  const jhClasses = showClasses
    .filter((c) => c.classDefinition?.type === 'junior_handler')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const jhGroups: SvJhGroup[] = [];
  for (const jc of jhClasses) {
    const members = memberMap.get(jc.id) ?? entries
      .filter((e) => e.entryType === 'junior_handler' && e.entryClasses.some((ec) => ec.showClassId === jc.id))
      .map((e) => ({ entry: e, result: e.entryClasses.find((ec) => ec.showClassId === jc.id)?.result ?? null }));
    const placed = members
      .filter((m) => !m.entry.absent && m.result?.placement != null)
      .sort((a, b) => (a.result?.placement ?? 9999) - (b.result?.placement ?? 9999));
    if (placed.length === 0) continue;
    jhGroups.push({
      label: svDisplayAge(jc.classDefinition?.name) || 'Junior Handling',
      rows: placed.map((m) => ({
        placement: String(m.result?.placement ?? ''),
        handler: m.entry.juniorHandler?.handlerName ?? '',
      })),
    });
  }

  const names = judgeNames(judges);
  return {
    entered,
    present,
    absent,
    absenteePct,
    judgeName: names.breed.length > 0 ? names.breed.join(' & ') : null,
    coatSections,
    awards,
    jhJudgeName: names.jh.length > 0 ? names.jh.join(' & ') : null,
    jhGroups,
  };
}

// ── XLSX flat rows ──────────────────────────────────────────────────

/** Column order matches the GSDL "Results for SV" spreadsheet exactly. */
export const SV_XLSX_COLUMNS = [
  'Venue',
  'Date',
  'Class',
  'Judge',
  'Ring Number',
  "Dog's Name",
  'Additional Affix',
  'Affix',
  'Registration Body',
  'Registration Number',
  'Date Birth',
  'Micro-chip Number',
  'Registered Name of Sire',
  "Sire's Additional Affix",
  'Affix2',
  "Sire's Registration Body",
  "Sire's Registration Number",
  'Registered Name of Dam',
  "Dam's Additional Affix",
  "Dam's Affix",
  "Dam's Registration Body",
  "Dam's Registration Number",
  "Breeder's First Name",
  "Breeder's Surname",
  "Breeder's City and Postcode",
  "Breeder's Country",
  "Owner's First Name",
  "Owner's Surname",
  "Owner's City and Postcode",
  "Owner's Country",
  'Grading',
  'Placing',
  'Height',
  'Depth',
] as const;

export interface SvXlsxRow {
  venue: string;
  date: string;
  className: string;
  judge: string;
  ringNumber: string;
  dogName: string;
  dogAdditionalAffix: string;
  dogAffix: string;
  registrationBody: string;
  registrationNumber: string;
  dateOfBirth: string;
  microchip: string;
  sireName: string;
  sireAdditionalAffix: string;
  sireAffix: string;
  sireRegistrationBody: string;
  sireRegistrationNumber: string;
  damName: string;
  damAdditionalAffix: string;
  damAffix: string;
  damRegistrationBody: string;
  damRegistrationNumber: string;
  breederFirstName: string;
  breederSurname: string;
  breederCityPostcode: string;
  breederCountry: string;
  ownerFirstName: string;
  ownerSurname: string;
  ownerCityPostcode: string;
  ownerCountry: string;
  grading: string;
  placing: number | string;
}

/** Display form of a registration body enum value. */
function regBody(body: string | null, other?: string | null): string {
  if (!body) return '';
  if (body === 'other') return (other ?? '').trim() || 'Other';
  return body.toUpperCase();
}

/** Split a single stored name into first-names + surname on the last space —
 *  Remi stores names as one string; the SV sheet wants them split. A
 *  single-word name lands entirely in the first-name column. */
export function splitPersonName(full: string | null): { first: string; surname: string } {
  const name = (full ?? '').trim();
  if (!name) return { first: '', surname: '' };
  const lastSpace = name.lastIndexOf(' ');
  if (lastSpace === -1) return { first: name, surname: '' };
  return { first: name.slice(0, lastSpace).trim(), surname: name.slice(lastSpace + 1).trim() };
}

function joinCityPostcode(city: string | null, postcode: string | null): string {
  return [city, postcode].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
}

/** Connector words that begin a suffix affix ("vom Falkenhorst", "at Howlinwolf"). */
const AFFIX_CONNECTORS = new Set([
  'vom', 'von', 'aus', 'zu', 'zur', 'zum', 'auf', 'im', 'v.',
  'at', 'of', 'with', 'from', 'ex', 'avec',
]);

/**
 * Best-effort split of a registered name into given name + up to two affixes
 * for the SV "Results" sheet. Handles the two common patterns:
 *   "Stern vom Falkenhorst"       -> name "Stern", affix "vom Falkenhorst"
 *   "Mascani Milan at Howlinwolf" -> name "Milan", affix "Mascani",
 *                                    additionalAffix "at Howlinwolf"
 * A suffix affix starts at a connector word; any leading word(s) before the
 * given name are treated as a prefix (kennel) affix. Unusual names may need a
 * manual tweak in the sheet.
 */
export function splitAffix(full: string | null): { name: string; affix: string; additionalAffix: string } {
  const tokens = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { name: tokens[0] ?? '', affix: '', additionalAffix: '' };

  let suffix = '';
  let core = tokens;
  for (let i = 1; i < tokens.length; i++) {
    if (AFFIX_CONNECTORS.has(tokens[i].toLowerCase())) {
      suffix = tokens.slice(i).join(' ');
      core = tokens.slice(0, i);
      break;
    }
  }
  // UK convention (Mandy 2026-07-23): the kennel affix is the FIRST word;
  // everything after it (before any at/of/with clause) is the dog's name.
  const name = core.slice(1).join(' ') || core[0];
  const prefix = core.length > 1 ? core[0] : '';
  return prefix
    ? { name, affix: prefix, additionalAffix: suffix }
    : { name, affix: suffix, additionalAffix: '' };
}

/** UK city + postcode from a free-text address — drops the street, keeps just
 *  the town and postcode ("1 Birmingham Road, Solihull, B91 2AA" ->
 *  "Solihull, B91 2AA"). Best-effort; unusual addresses may need a tweak. */
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
function cityAndPostcode(address: string | null): string {
  const addr = (address ?? '').trim();
  if (!addr) return '';
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  // Already just town + postcode (no street to drop), e.g. "Preston PR5 4DB".
  if (parts.length <= 1) return addr;
  const pcIdx = parts.findIndex((p) => UK_POSTCODE.test(p));
  if (pcIdx === -1) return parts[parts.length - 1];
  const postcode = (parts[pcIdx].match(UK_POSTCODE)?.[0] ?? parts[pcIdx]).toUpperCase();
  const city = pcIdx > 0 ? parts[pcIdx - 1] : '';
  return [city, postcode].filter(Boolean).join(', ');
}

function primaryOwner(owners: SvOwnerInput[]): SvOwnerInput | null {
  if (owners.length === 0) return null;
  return (
    owners.find((o) => o.isPrimary) ??
    [...owners].sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
    null
  );
}

/**
 * Build the flat one-row-per-dog spreadsheet rows, ordered by ring number
 * (which the catalogue assigns in age-ascending, class-grouped order, so the
 * sheet reads the same way the GSDL sample does).
 *
 * Columns Remi doesn't store granularly (affix splits, height/depth) are left
 * blank — the data Remi holds always lands in the right column.
 */
export function buildSvResultsXlsxRows(
  input: SvResultsReportInput,
  context: { venue: string; date: string },
): SvXlsxRow[] {
  const { showClasses, entries, judges } = input;
  const memberMap = membersByShowClass(entries);
  const svAgeClasses = showClasses.filter((c) => c.classDefinition?.type === 'sv_age');
  const judge = judgeNames(judges).breed.join(' & ');

  const rows: { ring: string | null; row: SvXlsxRow }[] = [];
  for (const sc of svAgeClasses) {
    const members = memberMap.get(sc.id) ?? [];
    if (members.length === 0) continue;
    const computed = computeClassMembers(sc, members);
    const className = svDisplayAge(sc.classDefinition?.name);
    for (const r of computed) {
      const dog = r.entry.dog;
      const owner = primaryOwner(dog?.owners ?? []);
      const ownerName = splitPersonName(owner?.ownerName ?? null);
      const breeder = splitPersonName(dog?.breederName ?? null);
      const dogNm = splitAffix(dog?.registeredName ?? null);
      const sireNm = splitAffix(dog?.sireName ?? null);
      const damNm = splitAffix(dog?.damName ?? null);
      rows.push({
        ring: r.entry.catalogueNumber,
        row: {
          venue: context.venue,
          date: context.date,
          className,
          judge,
          ringNumber: r.entry.catalogueNumber ?? '',
          dogName: dogNm.name,
          dogAdditionalAffix: dogNm.additionalAffix,
          dogAffix: dogNm.affix,
          registrationBody: regBody(dog?.registrationBody ?? null, dog?.registrationBodyOther ?? null),
          registrationNumber: formatRegNumber(dog?.kcRegNumber),
          dateOfBirth: dog?.dateOfBirth ?? '',
          microchip: dog?.microchipNumber ?? '',
          sireName: sireNm.name,
          sireAdditionalAffix: sireNm.additionalAffix,
          sireAffix: sireNm.affix,
          sireRegistrationBody: regBody(dog?.sireRegistrationBody ?? null),
          sireRegistrationNumber: dog?.sireRegistrationNumber ?? '',
          damName: damNm.name,
          damAdditionalAffix: damNm.additionalAffix,
          damAffix: damNm.affix,
          damRegistrationBody: regBody(dog?.damRegistrationBody ?? null),
          damRegistrationNumber: dog?.damRegistrationNumber ?? '',
          breederFirstName: breeder.first,
          breederSurname: breeder.surname,
          breederCityPostcode: joinCityPostcode(dog?.breederCity ?? null, dog?.breederPostcode ?? null),
          breederCountry: dog?.breederCountry ?? '',
          ownerFirstName: ownerName.first,
          ownerSurname: ownerName.surname,
          ownerCityPostcode: cityAndPostcode(owner?.ownerAddress ?? null),
          ownerCountry: owner ? 'UK' : '',
          grading: r.gradeDisplay,
          placing: r.placementNumber ?? '',
        },
      });
    }
  }

  rows.sort((a, b) => ringSort(a.ring, b.ring));
  return rows.map((r) => r.row);
}
