import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles, PROJECT_ROOT } from '../helpers/static-scan';
import * as owner from '@/lib/show-setup-steps';

// Mandy, 28 Oct 2026: the setup wizard ticked "Fees & Setup" from its own
// three-item rule while the lifecycle banner, from getPhaseBlockers, still
// said "Venue not confirmed" — two owners of "what is left to do on this
// step". Now src/lib/show-setup-steps.ts owns the step table and the link
// that opens the wizard on a step; every blocker carries its step; the
// wizard ticks a step only when no required blocker points at it.

const OWNER = path.join('src', 'lib', 'show-setup-steps.ts');
const WIZARD = path.join(
  'src', 'app', '(secretary)', 'secretary', 'shows', '[id]', '_components', 'setup-wizard.tsx',
);
const rel = (f: string) => path.relative(PROJECT_ROOT, f);
const sources = () =>
  findFiles('src', ['.ts', '.tsx']).filter((f) => !rel(f).includes(`${path.sep}__tests__${path.sep}`));

describe('the setup wizard steps have one owner', () => {
  it('src/lib/show-setup-steps.ts owns the step table and the step link', () => {
    expect(owner.WIZARD_STEPS.map((s) => s.id)).toEqual(['classes', 'judge', 'details', 'schedule', 'open']);
    expect(owner.wizardStepPath('details')).toBe('?step=details');
    expect(owner.isWizardStepId('details')).toBe(true);
    expect(owner.isWizardStepId('venue')).toBe(false);
    expect(owner.wizardStepBlocked('details', undefined), 'loading must not read as complete').toBe(true);
    expect(owner.wizardStepBlocked('details', [{ step: 'details', severity: 'recommended' }])).toBe(false);
    expect(owner.wizardStepBlocked('details', [{ step: 'details', severity: 'required' }])).toBe(true);
  });

  it('no other file builds a ?step= link or hand-types the step table', () => {
    const offenders: string[] = [];
    for (const f of sources()) {
      const r = rel(f);
      if (r === OWNER) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/[?&]step=(classes|judge|details|schedule|open)\b/.test(line) || /\bid:\s*'classes'/.test(line)) {
          offenders.push(`${r}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      'These lines hand-type a wizard step link or step table. Use wizardStepPath()/WIZARD_STEPS from src/lib/show-setup-steps.ts.',
    ).toEqual([]);
  });

  it('the wizard ticks steps from the blockers, not from a rule of its own', () => {
    const src = readFileSync(path.join(PROJECT_ROOT, WIZARD), 'utf8');
    expect(src).toMatch(/from '@\/lib\/show-setup-steps'/);
    expect(src).toMatch(/wizardStepBlocked\(/);
    for (const key of [
      'secretary_details_set',
      'entry_fees_set',
      'entry_close_date_set',
      'classes_created',
      'judges_assigned',
    ]) {
      expect(src.includes(key), `setup-wizard.tsx still decides a step from autoDetect.${key}`).toBe(false);
    }
  });
});
