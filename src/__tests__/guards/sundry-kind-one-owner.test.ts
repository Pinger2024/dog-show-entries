import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// GUARD (15 Oct 2026): what a sundry item IS lives in sundry_items.kind, and
// src/lib/sundry-kind.ts is the only module that knows what a kind means.
// Guessing it from the item's NAME in a second place is exactly the bug that
// made "Catalogue Advert" unlock the online catalogue and "Car Park Pass"
// miss its parking pass. If this fails, read the kind column through
// sundry-kind.ts instead of adding a name check.

const SRC = path.join(__dirname, '..', '..');
const OWNER = path.join('lib', 'sundry-kind.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'isCatalogueItem', re: /\bisCatalogueItem\b/ },
  { label: 'CATALOGUE_NAME_PATTERN', re: /\bCATALOGUE_NAME_PATTERN\b/ },
  { label: "'%catalogue%'", re: /%catalogue%/i },
  { label: 'isParkingSundry', re: /\bisParkingSundry\b/ },
  { label: 'PARKING_NAME_PATTERNS', re: /\bPARKING_NAME_PATTERNS\b/ },
  { label: 'isDonationName', re: /\bisDonationName\b/ },
  { label: "name .includes('catalogue'|'print'|'parking'|'donation')", re: /\.includes\(\s*['"](catalogue|print|parking|donation)['"]\s*\)/i },
  { label: 'ilike on sundryItems.name', re: /ilike\(\s*sundryItems\.name/ },
];

export function findSundryNameHeuristics(files: Array<{ file: string; text: string }>) {
  const hits: string[] = [];
  for (const { file, text } of files) {
    if (file.endsWith(OWNER)) continue;
    text.split('\n').forEach((line, i) => {
      for (const { label, re } of FORBIDDEN) {
        if (re.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1}  ${label}`);
      }
    });
  }
  return hits;
}

describe('sundry kind has one owner', () => {
  it('no name heuristics for a sundry item outside lib/sundry-kind.ts', () => {
    const files = walk(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    expect(findSundryNameHeuristics(files)).toEqual([]);
  });

  it('the scanner itself catches each forbidden pattern', () => {
    const bad = [
      'if (isCatalogueItem(s.name)) {}',
      "const p = CATALOGUE_NAME_PATTERN;",
      "ilike(x, '%Catalogue%')",
      'isParkingSundry(row.name)',
      "PARKING_NAME_PATTERNS.map(p => p)",
      'isDonationName(n)',
      "item.name.toLowerCase().includes('catalogue')",
      "row.itemName.toLowerCase().includes('print')",
      'ilike(sundryItems.name, x)',
    ];
    for (const text of bad) {
      expect(findSundryNameHeuristics([{ file: path.join(SRC, 'x.ts'), text }]), text).not.toEqual([]);
    }
    expect(findSundryNameHeuristics([{ file: path.join(SRC, 'lib', 'sundry-kind.ts'), text: bad[0]! }])).toEqual([]);
  });
});
