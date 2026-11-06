import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (16 Oct 2026): "which users row is this email" lives in ONE module,
// src/server/services/people.ts (findPersonByEmail). Six hand-rolled copies
// once disagreed: two used ilike (an `_` or `%` in a typed address is a
// wildcard, so one address could match another person's row), the rest eq on
// an input that was or was not trimmed. If this fails, call findPersonByEmail
// (or findOrCreatePersonByEmail) instead of comparing users.email yourself.

const SRC = path.join(__dirname, '..', '..');
const OWNER = path.join('server', 'services', 'people.ts');

function sourceFiles(): string[] {
  return findFiles('src', ['.ts', '.tsx']).filter(
    (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !/\.test\.(ts|tsx)$/.test(f),
  );
}

const USERS_EMAIL = String.raw`(?:schema\.)?users\.email`;
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'eq/ne/like/ilike(users.email, …)', re: new RegExp(String.raw`\b(?:eq|ne|like|ilike|inArray)\(\s*${USERS_EMAIL}\b`) },
  { label: '${users.email} inside an sql template', re: new RegExp(String.raw`\$\{\s*${USERS_EMAIL}\s*\}`) },
];

export function findEmailLookups(files: Array<{ file: string; text: string }>) {
  const hits: string[] = [];
  for (const { file, text } of files) {
    if (file.endsWith(OWNER)) continue;
    for (const { label, re } of FORBIDDEN) {
      const g = new RegExp(re.source, 'g');
      for (const m of text.matchAll(g)) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${path.relative(SRC, file)}:${line}  ${label}`);
      }
    }
  }
  return hits;
}

describe('finding a person by email has one owner', () => {
  it('nothing outside people.ts compares users.email in a query', () => {
    const files = sourceFiles().map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    expect(findEmailLookups(files)).toEqual([]);
  });

  it('the scan sees every copy shape it is meant to catch', () => {
    const bad = [
      'where: eq(users.email, x)',
      '.where(ilike(schema.users.email, email))',
      'sql`lower(${users.email}) = ${x}`',
      'eq(\n  users.email,\n x)',
    ].map((text, i) => ({ file: `x${i}.ts`, text }));
    expect(findEmailLookups(bad)).toHaveLength(4);
  });
});
