import fs from 'fs';
import path from 'path';

/**
 * Shared static-scan scaffolding for source-sweep tests (mobile-overflow,
 * design-conformance) — these grep .tsx/.css source for regex patterns
 * (banned classes, retired hexes, dark: variants, etc.) rather than
 * exercising runtime behavior. Extracted here because both test files had
 * byte-identical copies of findFiles/Match/scanFiles.
 */
export const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Recursively find files matching an extension in a directory.
 */
export function findFiles(dir: string, extensions: string[]): string[] {
  const fullDir = path.resolve(PROJECT_ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];

  const entries = fs.readdirSync(fullDir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && extensions.some((ext) => e.name.endsWith(ext)))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

export interface Match {
  /** Path relative to project root */
  file: string;
  line: number;
  content: string;
}

/**
 * Scan files for a regex pattern, returning matches with file/line info.
 */
export function scanFiles(dirs: string[], extensions: string[], pattern: RegExp): Match[] {
  const matches: Match[] = [];
  for (const dir of dirs) {
    const files = findFiles(dir, extensions);
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matches.push({
            file: path.relative(PROJECT_ROOT, filePath),
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    }
  }
  return matches;
}
