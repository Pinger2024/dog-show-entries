import { describe, it, expect } from 'vitest';
import { scanFiles } from './helpers/static-scan';

// The RKC registration-number clash check (kc_reg_number is UNIQUE) used to
// be written twice, with different wording, and was missing entirely from a
// third write path — see lib/dog-registration-clash.ts for the incident.
// This guard stops a fourth copy of `eq(dogs.kcRegNumber, ...)` creeping
// back into a router instead of going through the shared module.
describe('dog registration-clash rule — one owner', () => {
  it('is looked up in exactly one place', () => {
    const pattern = /eq\(dogs\.kcRegNumber/;
    const matches = scanFiles(['src'], ['.ts', '.tsx'], pattern).filter(
      (m) => m.file !== 'src/lib/dog-registration-clash.ts' && !m.file.includes('__tests__'),
    );

    if (matches.length > 0) {
      const details = matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');
      expect.fail(
        `Found a second lookup of dogs.kcRegNumber outside lib/dog-registration-clash.ts — ` +
          `route it through findDogRegistrationClash instead:\n${details}`,
      );
    }
  });
});
