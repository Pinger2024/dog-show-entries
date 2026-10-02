import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Font } from '@react-pdf/renderer';
import { registerPdfKitFonts, assertFontBudget } from '../fonts';

/**
 * registerPdfKitFonts() must be idempotent: @react-pdf/renderer's
 * `Font.register` APPENDS to a family's source list on every call, so
 * calling registerPdfKitFonts() more than once (e.g. two pdf-kit component
 * modules each doing `import { registerPdfKitFonts } from '.../fonts'`)
 * must not re-register the same faces a second time.
 *
 * PROVING THE TEST FAILS (brief requirement — noted here rather than left
 * in the tree): with the `if (registered) return;` guard commented out in
 * fonts.ts, this test's `Font.register` call-count assertion failed (12
 * calls instead of 3 across two registerPdfKitFonts() calls). Restored
 * before committing.
 */
describe('registerPdfKitFonts', () => {
  it('only calls Font.register once per family, no matter how many times it is called', () => {
    const spy = vi.spyOn(Font, 'register');
    spy.mockClear();

    registerPdfKitFonts();
    const firstCallCount = spy.mock.calls.length;
    expect(firstCallCount).toBe(3); // Times, LibreBaskerville, Inter

    registerPdfKitFonts();
    registerPdfKitFonts();
    expect(spy.mock.calls.length).toBe(firstCallCount);

    spy.mockRestore();
  });
});

describe('assertFontBudget', () => {
  it('does not throw for 1-3 non-Hanken families', () => {
    expect(() => assertFontBudget(['Times'])).not.toThrow();
    expect(() => assertFontBudget(['Times', 'Inter'])).not.toThrow();
    expect(() => assertFontBudget(['Times', 'Inter', 'LibreBaskerville'])).not.toThrow();
  });

  it('throws for more than 3 distinct families', () => {
    expect(() => assertFontBudget(['Times', 'Inter', 'LibreBaskerville', 'HankenGrotesk'])).toThrow(
      /4 font families/,
    );
  });

  it('de-duplicates repeated family names before counting', () => {
    expect(() => assertFontBudget(['Times', 'Times', 'Times'])).not.toThrow();
  });

  it('throws when HankenGrotesk is combined with any other family, even within budget', () => {
    expect(() => assertFontBudget(['HankenGrotesk', 'Times'])).toThrow(/HankenGrotesk must never be combined/);
  });

  it('does not throw for HankenGrotesk alone', () => {
    expect(() => assertFontBudget(['HankenGrotesk'])).not.toThrow();
  });
});
