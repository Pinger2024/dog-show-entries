/**
 * Shared catalogue formatting utilities.
 * KC-standard typography for all catalogue PDF formats.
 */

/** Format date as DD.MM.YYYY (KC catalogue standard) */
export function formatDobKC(dob: string | null | undefined): string {
  if (!dob) return '';
  const d = new Date(dob);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** UPPER CASE a name (for dog names and owner names in KC catalogues) */
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

/** Format pedigree as "By [Sire] ex [Dam]" (KC standard) */
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

/** Format owner names + address for KC catalogue (UPPER CASE name) */
export function formatOwnerKC(
  owners: { name: string; address: string | null }[]
): string {
  if (owners.length === 0) return '';
  return owners
    .map((o) => {
      const name = uppercaseName(o.name);
      return o.address ? `${name}, ${o.address}` : name;
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
