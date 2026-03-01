import { describe, it, expect } from 'vitest';
import { CLASS_TEMPLATES } from '../class-templates';

describe('CLASS_TEMPLATES', () => {
  it('has unique IDs', () => {
    const ids = CLASS_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate class names within a template', () => {
    for (const template of CLASS_TEMPLATES) {
      const names = template.classNames;
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('has positive default fees', () => {
    for (const template of CLASS_TEMPLATES) {
      expect(template.defaultFeePence).toBeGreaterThan(0);
    }
  });

  it('stores fees in pence (not pounds)', () => {
    for (const template of CLASS_TEMPLATES) {
      // Fees should be round numbers of pence (no decimals)
      expect(Number.isInteger(template.defaultFeePence)).toBe(true);
      // Sanity: fees should be at least 100 pence (£1.00)
      expect(template.defaultFeePence).toBeGreaterThanOrEqual(100);
    }
  });

  describe('GSD templates include Special Long Coat classes', () => {
    const gsdTemplates = CLASS_TEMPLATES.filter((t) =>
      t.id.startsWith('gsd_')
    );

    it('has at least one GSD template', () => {
      expect(gsdTemplates.length).toBeGreaterThan(0);
    });

    it('includes Special Long Coat Puppy', () => {
      for (const t of gsdTemplates) {
        expect(t.classNames).toContain('Special Long Coat Puppy');
      }
    });

    it('includes Special Long Coat Junior', () => {
      for (const t of gsdTemplates) {
        expect(t.classNames).toContain('Special Long Coat Junior');
      }
    });

    it('includes Special Long Coat Yearling', () => {
      for (const t of gsdTemplates) {
        expect(t.classNames).toContain('Special Long Coat Yearling');
      }
    });

    it('includes Special Long Coat Open', () => {
      for (const t of gsdTemplates) {
        expect(t.classNames).toContain('Special Long Coat Open');
      }
    });

    it('does NOT include old un-prefixed Long Coat names', () => {
      for (const t of gsdTemplates) {
        expect(t.classNames).not.toContain('Long Coat Open');
        expect(t.classNames).not.toContain('Long Coat Puppy');
      }
    });
  });

  describe('championship templates split by sex', () => {
    const champTemplates = CLASS_TEMPLATES.filter((t) =>
      t.id.includes('championship')
    );

    it('has splitBySex enabled', () => {
      for (const t of champTemplates) {
        expect(t.splitBySex).toBe(true);
      }
    });
  });
});
