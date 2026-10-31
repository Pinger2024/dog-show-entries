/**
 * pdf-kit/section-title — a heading with keep-with-next protection
 * (`minPresenceAhead`), generalising the near-identical `SectionTitle`
 * hand-rolled in `src/components/catalogue/sv-front-matter.tsx:51` and
 * `src/components/schedule/sv-show-schedule.tsx:126` (same title-text +
 * thin-rule shape, same `minPresenceAhead={28}` comment, duplicated because
 * one lives in the catalogue component tree and the other in the schedule's
 * — see also `TwoColSectionHeader` in `schedule/shared/elements.tsx`, whose
 * own doc comment calls out "same pattern").
 *
 * `variant` gives each of the three RKC print families (catalogue,
 * schedule, judges book) plus the SV/WUSV shared design its own look, so a
 * later migration of those hand-rolled headings is a prop swap rather than
 * a rewrite — see this folder's README for the migration note and the
 * caveat that these variant styles are a faithful approximation pending a
 * golden-test comparison against each real document, not a guaranteed
 * pixel match.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

export type SectionTitleVariant = 'catalogue' | 'schedule' | 'judgesBook' | 'sv';

interface VariantStyle {
  container: Style;
  text: Style;
  denseText: Style;
  rule?: Style;
}

// Font choices here are deliberately restricted to Times / Inter /
// LibreBaskerville (pdf-kit/fonts.ts's PDF_KIT_FAMILIES) — NOT HankenGrotesk
// — because the RKC catalogue/schedule/Judge's Book document families this
// mirrors were specifically reverted away from Hanken Grotesk headings to
// avoid the >3-family corruption bug (see src/lib/pdf-fonts.ts). The 'sv'
// variant mirrors sv-styles.ts's SV_FONTS.serif ('Times') + SV palette
// exactly, since it directly generalises the two real duplicated
// implementations named above.
const VARIANTS: Record<SectionTitleVariant, VariantStyle> = {
  sv: {
    container: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    text: { fontFamily: 'Times', fontSize: 13, color: '#161512' },
    denseText: { fontSize: 12 },
    rule: { flex: 1, height: 1, backgroundColor: '#d8cfb8' },
  },
  catalogue: {
    container: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    text: {
      fontFamily: 'Times',
      fontSize: 12,
      fontWeight: 'bold',
      color: '#2D5F3F',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    denseText: { fontSize: 10.5 },
    rule: { flex: 1, height: 1, backgroundColor: '#B8963E' },
  },
  schedule: {
    container: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    text: {
      fontFamily: 'Inter',
      fontSize: 11,
      fontWeight: 'bold',
      color: '#123C34',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    denseText: { fontSize: 9.5 },
    rule: { flex: 1, height: 1, backgroundColor: '#DF8E63' },
  },
  judgesBook: {
    container: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
    text: {
      fontFamily: 'Times',
      fontSize: 11,
      fontWeight: 'bold',
      color: '#1A1A1A',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    denseText: { fontSize: 10 },
    rule: { flex: 1, height: 0.75, backgroundColor: '#1A1A1A' },
  },
};

/** Matches every existing hand-rolled SectionTitle's own `minPresenceAhead`
 *  value (sv-front-matter.tsx, sv-show-schedule.tsx both use 28). */
export const DEFAULT_SECTION_TITLE_MIN_PRESENCE_AHEAD = 28;

export interface SectionTitleProps {
  title: string;
  variant?: SectionTitleVariant;
  /** Points of following content that must stay with this heading before a
   *  page break is allowed between them. Defaults to 28 (see above); pass
   *  0 to disable keep-with-next entirely. */
  minPresenceAhead?: number;
  /** Compact density — smaller text, tighter margin (used by fit-and-retry
   *  renders like `renderWithPageBudget`'s compact pass). */
  dense?: boolean;
  /** Merged onto the outer row container. */
  style?: Style;
  /** Merged onto the title `Text` itself. */
  textStyle?: Style;
}

export function SectionTitle({
  title,
  variant = 'sv',
  minPresenceAhead = DEFAULT_SECTION_TITLE_MIN_PRESENCE_AHEAD,
  dense,
  style,
  textStyle,
}: SectionTitleProps) {
  const v = VARIANTS[variant];
  return (
    <View
      style={[v.container, dense ? { marginBottom: 3 } : {}, style ?? {}]}
      minPresenceAhead={minPresenceAhead}
      wrap={false}
    >
      <Text style={[v.text, dense ? v.denseText : {}, textStyle ?? {}]}>{title}</Text>
      {v.rule && <View style={v.rule} />}
    </View>
  );
}
