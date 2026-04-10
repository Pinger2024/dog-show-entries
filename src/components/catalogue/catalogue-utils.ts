/**
 * Shared catalogue formatting utilities.
 * RKC-standard typography for all catalogue PDF formats.
 */

/** Format date as DD.MM.YYYY (RKC catalogue standard) */
export function formatDobKC(dob: string | null | undefined): string {
  if (!dob) return '';
  const d = new Date(dob);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** UPPER CASE a name (for dog names and owner names in RKC catalogues) */
export function uppercaseName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toUpperCase();
}

/** Title Case a name (for sire/dam in "By [sire] ex [dam]" format) */
export function titleCase(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format pedigree as "By [Sire] ex [Dam]" (RKC standard) */
export function formatPedigreeKC(
  sire: string | null | undefined,
  dam: string | null | undefined
): string | null {
  if (!sire && !dam) return null;
  const parts: string[] = [];
  if (sire) parts.push(`By ${titleCase(sire)}`);
  if (dam) parts.push(`ex ${titleCase(dam)}`);
  return parts.join(' ');
}

/**
 * Format owner names + address for RKC catalogue (UPPER CASE name).
 * Per RKC regulations, when an owner is also the exhibitor the address
 * is replaced with "Exh." (short for "Exhibitor").
 *
 * If `withhold` is true, owner details are replaced with "Details withheld"
 * per the exhibitor's right under F(1).11.b.(6)/(8) to have their name and
 * address kept out of publication.
 */
export function formatOwnerKC(
  owners: { name: string; address: string | null; userId: string | null }[],
  exhibitorId?: string | undefined,
  withhold?: boolean
): string {
  if (withhold) return 'Details withheld';
  if (owners.length === 0) return '';
  return owners
    .map((o) => {
      const name = uppercaseName(o.name);
      const isExhibitor = exhibitorId && o.userId && o.userId === exhibitorId;
      // Always show the address. Append "Exh." when the owner is also the exhibitor.
      const parts = [name];
      if (o.address) parts.push(o.address);
      if (isExhibitor) parts.push('Exh.');
      return parts.join(', ');
    })
    .join(' & ');
}

/** Format class list with numbers: "1. Minor Puppy, 3. Novice" */
export function formatClassList(
  classes: { name: string | undefined; classNumber: number | null | undefined; sortOrder: number | undefined }[]
): string {
  return classes
    .sort((a, b) => {
      if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
      if (a.classNumber != null) return -1;
      if (b.classNumber != null) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    })
    .map((c) => {
      if (c.classNumber != null && c.name) return `${c.classNumber}. ${c.name}`;
      return c.name;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Shared catalogue grouping utilities ───────────────────────

/** Minimal entry shape needed by shared grouping functions */
export interface CatalogueEntryBase {
  catalogueNumber: string | null;
  dogName: string | null;
  sex: string | undefined;
  entryType: string;
  // exhibitor / handler come from optional related rows whose name column
  // is nullable — so the full shape from the DB layer is `string | null`
  // as well as the undefined that appears when the row is missing.
  exhibitor: string | null | undefined;
  handler: string | null | undefined;
  jhHandlerName?: string | null | undefined;
  classes: {
    name: string | undefined;
    sex: string | null | undefined;
    classNumber: number | null | undefined;
    sortOrder: number | undefined;
  }[];
}

/** Show info needed for class grouping */
export interface ShowClassesInfo {
  allShowClasses?: {
    className: string;
    classNumber: number | null;
    sortOrder: number;
    sex: string | null;
  }[];
}

export interface ClassGroup {
  classNumber: number | null | undefined;
  className: string;
  sex: string | null | undefined;
  sortOrder: number | undefined;
  entries: CatalogueEntryBase[];
}

/** Group entries by class, injecting empty classes from show data. */
export function groupByClass<T extends CatalogueEntryBase>(
  entries: T[],
  show: ShowClassesInfo,
): ClassGroup[] {
  const byKey = new Map<string, ClassGroup>();

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const key =
        cls.classNumber != null
          ? `num:${cls.classNumber}`
          : `name:${cls.name ?? ''}-${cls.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: cls.classNumber,
          className: cls.name ?? 'Unknown Class',
          sex: cls.sex,
          sortOrder: cls.sortOrder,
          entries: [],
        });
      }
      byKey.get(key)!.entries.push(entry);
    }
  }

  if (show.allShowClasses) {
    for (const sc of show.allShowClasses) {
      const key =
        sc.classNumber != null
          ? `num:${sc.classNumber}`
          : `name:${sc.className}-${sc.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: sc.classNumber,
          className: sc.className,
          sex: sc.sex,
          sortOrder: sc.sortOrder,
          entries: [],
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null)
      return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

/** Sort entries by catalogue number (numeric-aware). */
export function sortEntries<T extends { catalogueNumber: string | null }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const an = a.catalogueNumber ?? '';
    const bn = b.catalogueNumber ?? '';
    return an.localeCompare(bn, undefined, { numeric: true });
  });
}

/** Display name for catalogue entries — handler for JH, dog name for regular. */
export function displayEntryName(entry: CatalogueEntryBase): string {
  if (entry.entryType === 'junior_handler') {
    return entry.jhHandlerName ?? entry.handler ?? entry.exhibitor ?? 'Unnamed Handler';
  }
  return uppercaseName(entry.dogName) || 'Unnamed';
}

/** Format sponsorship lines for class headers. */
export function buildSponsorLines(
  sps: { trophyName: string | null; trophyDonor: string | null; sponsorName: string | null; sponsorAffix: string | null; prizeDescription: string | null }[],
): string[] {
  const lines: string[] = [];
  for (const sp of sps) {
    if (sp.trophyName) {
      let part = sp.trophyName;
      if (sp.sponsorName) {
        part += ` — sponsored by ${sp.sponsorName}`;
        if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      } else if (sp.trophyDonor) {
        part += ` — donated by ${sp.trophyDonor}`;
      }
      lines.push(part);
    } else if (sp.sponsorName) {
      let part = `Sponsored by ${sp.sponsorName}`;
      if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      if (sp.prizeDescription) part += ` — ${sp.prizeDescription}`;
      lines.push(part);
    } else if (sp.prizeDescription) {
      lines.push(sp.prizeDescription);
    }
  }
  return lines;
}
