/**
 * SV / WUSV schedule — "Sieger Editorial" palette, page shell, and shared
 * atom styles. Equivalent to `sv-schedule/style.css` in the design brief,
 * translated to React-PDF StyleSheet.
 *
 * Fonts are registered upstream by `./styles.ts` (side-effect on import);
 * the design's Instrument Serif / Instrument Sans / Geist Mono families are
 * substituted with the schedule's existing Libre Baskerville / Inter / Inter
 * registrations. Visual feel is preserved: serif headlines, sans body,
 * letter-spaced eyebrows, oxblood accent.
 */
import { StyleSheet, Font } from '@react-pdf/renderer';
// Side-effect: registers Libre Baskerville + Inter + Times via the existing
// schedule font setup. Imported for the side-effect only.
import './styles';
// Side-effect: registers the HankenGrotesk family used by `eyebrow` /
// `panelInkEyebrow` below (Show Experience green rebrand, 2026-07-10).
// Confirmed safe as a 4th family in the SV/WUSV documents specifically —
// see src/lib/pdf-fonts.ts for the fuller story (it is NOT safe in the
// RKC catalogue/schedule/Judge's Book, which don't use it).
import '@/lib/pdf-fonts';

// Hyphenation off — the design relies on rags rather than mid-word breaks
// for headlines, and turning it off prevents accidental "Reg-ional" splits.
Font.registerHyphenationCallback((word) => [word]);

// ── Sieger palette ─────────────────────────────────────────────────────────
export const SV = {
  paper: '#faf6ee',        // warm bone, page background
  ink: '#161512',          // primary text
  ink2: '#3a352c',          // secondary text
  ink3: '#6a6457',          // tertiary / eyebrows
  rule: '#d8cfb8',          // hairline dividers
  rule2: '#b9ad8a',         // secondary divider
  accent: '#8f2c1e',        // oxblood — used sparingly
  accentSoft: '#f0d9c8',    // tinted background (JH band, panel highlights)
  paperOnInk: '#f3eee2',    // paper colour on dark panels
};

// Font families — re-using the existing registrations. See `./styles.ts`.
// We use Times (not Libre Baskerville) for the serif because the design
// leans on italic display headlines and pull-quotes, and only Times has an
// italic file bundled in `public/fonts/`.
export const SV_FONTS = {
  serif: 'Times',             // → "Instrument Serif" in the design
  sans: 'Inter',              // → "Instrument Sans" in the design
  mono: 'Inter',              // → "Geist Mono" in the design (we approximate
                              //   the monospace feel via letter-spacing on
                              //   tabular numerals; no mono on disk).
} as const;

// A5 page measured in mm — React-PDF accepts physical units in style values.
// The design specifies `9mm 11mm` insets inside the A5 page (148×210mm).
// In React-PDF we set the page padding directly rather than nesting an
// absolutely-positioned inner frame.
const PAGE_PADDING_TOP = '9mm';
const PAGE_PADDING_BOTTOM = '14mm'; // extra room for the folio
const PAGE_PADDING_SIDE = '11mm';

export const ss = StyleSheet.create({
  page: {
    backgroundColor: SV.paper,
    color: SV.ink,
    fontFamily: SV_FONTS.sans,
    fontSize: 9.5,
    lineHeight: 1.5,
    paddingTop: PAGE_PADDING_TOP,
    paddingBottom: PAGE_PADDING_BOTTOM,
    paddingLeft: PAGE_PADDING_SIDE,
    paddingRight: PAGE_PADDING_SIDE,
  },
  // Eyebrow — uppercase, letter-spaced mono-feel label. Used for №-prefixes,
  // page toppers/folio (running header/footer), section sub-labels, JH band
  // header, etc. This is the one SV text role that's a page header/footer
  // rather than body copy, so it's the one place the Show Experience green
  // rebrand's Hanken Grotesk face is used in the SV documents — the rest of
  // the SV "Sieger Editorial" body (Times/Inter per SV_FONTS above) is
  // deliberately left untouched.
  eyebrow: {
    fontFamily: 'HankenGrotesk',
    fontSize: 7.5,
    color: SV.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1.4, // ~0.18em on 7.5pt
    fontWeight: 'bold',
  },
  // Body atoms ────────────────────────────────────────────────────────────
  body: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8.5,
    color: SV.ink2,
    lineHeight: 1.45,
  },
  bodySmall: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8,
    color: SV.ink3,
    lineHeight: 1.4,
  },
  // Serif display headlines.
  display: {
    fontFamily: SV_FONTS.serif,
    color: SV.ink,
  },
  displayIt: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic',
    color: SV.ink,
  },
  // Hairline rules — full-ink and tinted variants.
  rule: {
    height: 1,
    backgroundColor: SV.ink,
  },
  ruleThin: {
    height: 0.6,
    backgroundColor: SV.rule,
  },
  // Folio strip at the foot of every page (left: section label, right: x/y).
  folio: {
    position: 'absolute',
    bottom: '5mm',
    left: PAGE_PADDING_SIDE,
    right: PAGE_PADDING_SIDE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Standard "page topper" used on pages 2–6 — № N · Page subject.
  topper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  // Section header inside a page body — "Fees ────────".
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionHeaderText: {
    fontFamily: SV_FONTS.serif,
    fontSize: 13,
    color: SV.ink,
  },
  sectionHeaderRule: {
    flex: 1,
    height: 1,
    backgroundColor: SV.rule,
  },
  // Fee/key-date rows on page 2.
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: SV.rule,
  },
  feeRowLabel: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8.5,
    color: SV.ink,
  },
  feeRowValue: {
    fontFamily: SV_FONTS.sans,
    fontSize: 9,
    color: SV.ink,
    fontWeight: 'medium',
  },
  feeRowLabelHi: {
    color: SV.accent,
  },
  feeRowValueHi: {
    color: SV.accent,
    fontWeight: 'bold',
  },
  // Dark inverse panel (health-threshold block, regional-titles block).
  panelInk: {
    backgroundColor: SV.ink,
    color: SV.paperOnInk,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  panelInkEyebrow: {
    color: SV.accentSoft,
    fontFamily: 'HankenGrotesk',
    fontSize: 7.5,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: 700,
    marginBottom: 4,
  },
  panelInkBody: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8.5,
    color: SV.paperOnInk,
    lineHeight: 1.5,
  },
  // Italic pull-quote with oxblood left border.
  pullQuote: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: SV.ink2,
    lineHeight: 1.3,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: SV.accent,
    marginTop: 8,
  },
});
