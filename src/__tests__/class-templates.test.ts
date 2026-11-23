import { describe, it, expect } from 'vitest';
import { CLASS_TEMPLATES } from '@/lib/class-templates';

describe('class templates', () => {
  // Amanda 2026-06-01: the "GSD Open (Single Breed)" template listed
  // "Special Long Coat Yearling" but omitted the plain "Yearling". For GSD
  // coat-variety age classes the standard and Long Coat versions come in
  // pairs — a Long Coat class without its standard counterpart is a setup gap
  // that leaves a real class off the schedule.
  it('every "Special Long Coat <X>" class has its standard "<X>" in the same template', () => {
    for (const template of CLASS_TEMPLATES) {
      for (const name of template.classNames) {
        const m = name.match(/^Special Long Coat (.+)$/);
        if (!m) continue;
        const standard = m[1];
        expect(
          template.classNames,
          `template "${template.name}" includes "${name}" but is missing "${standard}"`,
        ).toContain(standard);
      }
    }
  });

  it('GSD Open template includes the standard Yearling class', () => {
    const t = CLASS_TEMPLATES.find((x) => x.id === 'gsd_open_single_breed');
    expect(t).toBeDefined();
    expect(t!.classNames).toContain('Yearling');
  });
});
