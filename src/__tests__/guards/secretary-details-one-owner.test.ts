import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';
import * as owner from '@/lib/show-setup-requirements';

// GUARD (28 Oct 2026, Mandy): "are the secretary's contact details complete?"
// had two owners that disagreed. The setup wizard ticked its Details step when
// name + email were set (getChecklistAutoDetect), while the lifecycle banner
// said "Secretary contact details incomplete" until name, email, postal
// address AND phone were all set (getPhaseBlockers). One show showed a green
// tick and a red warning at once.
//
// The rule lives in ONE function, secretaryDetailsComplete, in
// src/lib/show-setup-requirements.ts. Anything that needs to know whether the
// details are complete calls it. Printing a field if it is present, or
// binding form state, is fine and is not caught here.

const SRC = path.join(__dirname, '..', '..');
const OWNER_FILE = path.join('lib', 'show-setup-requirements.ts');

function sourceFiles(): string[] {
  return findFiles('src', ['.ts', '.tsx']).filter(
    (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !/\.test\.(ts|tsx)$/.test(f),
  );
}

const FIELD = 'secretary(?:Name|Email|Address|Phone)';
const FIELD_CAPTURE = 'secretary(Name|Email|Address|Phone)';
// A completeness test joins two or more secretary fields with && / ||, or
// negates one and chains on with ||. A lone `show.secretaryName && (...)`
// (print if present) matches neither.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  {
    label: 'secretary fields joined with && (completeness check)',
    // Two DIFFERENT secretary fields on the same object (show.secretaryName &&
    // show.secretaryEmail). A bare local `secretaryEmail && secretaryEmail !==
    // adminEmail` (notification routes) is not a completeness check.
    re: new RegExp(`\\b(\\w+)\\.${FIELD_CAPTURE}\\s*&&\\s*!?\\1\\.secretary(?!\\2\\b)(?:Name|Email|Address|Phone)\\b`),
  },
  {
    label: '!secretary field chained with || (completeness check)',
    re: new RegExp(`!\\s*\\w*\\.?${FIELD}\\s*\\|\\|`),
  },
];

export function findSecretaryDetailsChecks(files: Array<{ file: string; text: string }>) {
  const hits: string[] = [];
  for (const { file, text } of files) {
    if (file.endsWith(OWNER_FILE)) continue;
    text.split('\n').forEach((line, i) => {
      for (const { label, re } of FORBIDDEN) {
        if (re.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1}  ${label}`);
      }
    });
  }
  return hits;
}

describe('secretary details completeness has one owner', () => {
  it('src/lib/show-setup-requirements.ts exports secretaryDetailsComplete', () => {
    expect(
      typeof (owner as Record<string, unknown>).secretaryDetailsComplete,
      'show-setup-requirements.ts must export secretaryDetailsComplete(show) - the one owner of "are the secretary details complete"',
    ).toBe('function');
  });

  it('no file outside show-setup-requirements.ts decides completeness from the raw secretary fields', () => {
    const files = sourceFiles().map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    expect(
      findSecretaryDetailsChecks(files),
      'These lines decide whether the secretary details are complete by hand. Call secretaryDetailsComplete() from src/lib/show-setup-requirements.ts instead.',
    ).toEqual([]);
  });

  it('the scanner catches the two copies that existed, and ignores print-if-present', () => {
    const f = path.join(SRC, 'x.ts');
    const bad = [
      'detected.secretary_details_set = !!(show.secretaryName && show.secretaryEmail);',
      'if (!show.secretaryName || !show.secretaryEmail || !show.secretaryAddress || !show.secretaryPhone) {',
    ];
    for (const text of bad) {
      expect(findSecretaryDetailsChecks([{ file: f, text }]), text).not.toEqual([]);
    }
    const fine = [
      '{show.secretaryName && (',
      'const hasSecretaryInfo = !!(show.secretaryName || show.secretaryEmail);',
      "secretaryName: values.secretaryName || undefined,",
      "secretaryName: secretaryName || null,",
    ];
    for (const text of fine) {
      expect(findSecretaryDetailsChecks([{ file: f, text }]), text).toEqual([]);
    }
    expect(findSecretaryDetailsChecks([{ file: path.join(SRC, OWNER_FILE), text: bad[1]! }])).toEqual([]);
  });
});
