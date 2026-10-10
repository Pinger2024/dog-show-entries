import { View, Text } from '@react-pdf/renderer';
import React from 'react';
import { s, CSv } from './styles';

/**
 * Small reusable rendering primitives shared by both the single-breed and
 * multi-breed schedule renderers. Pure and stateless — style refs the
 * shared StyleSheet so visual identity stays in lockstep.
 *
 * Each primitive accepts an optional `variant` prop: 'rkc' (default) uses
 * Remi green + gold, 'sv' uses the BRG red + blue + orange palette so
 * SV regional shows visually differentiate themselves (Amanda 2026-05-20).
 */

type Variant = 'rkc' | 'sv';

/** Above this many rows, an InfoCard list (Judges, Officers & Committee)
 *  can plausibly outgrow a whole blank A5 page — pass `wrap` at the call
 *  site once the list is this long. Every real-show golden fixture tops
 *  out at 3 judges / 12 officers; this only engages for the pathological
 *  case (the 30-officer stress fixture), never for a real club. See
 *  InfoCard's `wrap` prop doc comment for why this can't just default on. */
export const INFO_CARD_LIST_WRAP_THRESHOLD = 20;

export function SectionBand({ title, variant = 'rkc' }: { title: string; variant?: Variant }) {
  return (
    <View style={[s.sectionBand, variant === 'sv' && { backgroundColor: CSv.primary }]}>
      <Text style={s.sectionBandText}>{title}</Text>
    </View>
  );
}

export function InfoCard({
  title,
  children,
  variant = 'rkc',
  // Most InfoCards hold a short, fixed amount of text (fees, dates, a
  // single officer's name) and should never be split mid-card by a page
  // break — hence wrap={false} by default: react-pdf moves the WHOLE card
  // to the next page as one unit when it doesn't fit in what's left,
  // exactly what you want for a small card.
  //
  // But a card whose content is an unbounded LIST (Judges, Officers &
  // Committee) can legitimately outgrow a full, blank page on a show with
  // a big panel or committee — with wrap={false} react-pdf can't split
  // something that doesn't even fit on its own page, so it warns "Node of
  // type VIEW can't wrap between pages and it's bigger than available page
  // height" AND keeps rendering it as one unsplittable block that spills
  // past the page edge: real content silently lost off the bottom of the
  // page, not just a noisy warning (caught by the 30-officer stress
  // fixture, 2026-09-03 — 4 of 30 officers were rendered but invisible,
  // past the printable area).
  //
  // Pass wrap={true} at a call site ONLY when it has already checked the
  // list is long enough to realistically hit that ceiling (see the
  // `judges.length > ...` / `sd.officers.length > ...` guards in
  // show-schedule.tsx / show-schedule-multibreed.tsx) — every real-show
  // golden fixture has well under that many judges or officers, so this
  // never changes their pagination; wrap only turns on for the pathological
  // case, where the trade-off is a card that can split (and very
  // occasionally show its title alone at a page foot) instead of one that
  // silently eats its own tail.
  wrap = false,
}: {
  title?: string;
  children: React.ReactNode;
  variant?: Variant;
  wrap?: boolean;
}) {
  return (
    <View
      style={[s.infoCard, variant === 'sv' && { borderLeftColor: CSv.primary }]}
      wrap={wrap}
    >
      {title && (
        <Text style={[s.infoCardTitle, variant === 'sv' && { color: CSv.primary }]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

/** A formal, scannable home for secretary-selected show-specific notices. */
export function ImportantShowNotices({
  statements,
  variant = 'rkc',
}: {
  statements: string[];
  variant?: Variant;
}) {
  if (statements.length === 0) return null;

  return (
    <View style={s.noticesSection}>
      <View wrap={false} minPresenceAhead={35}>
        <Text style={[
          s.noticesHeading,
          variant === 'sv' ? { color: CSv.primary, borderBottomColor: CSv.streak } : {},
        ]}>
          Important Show Notices
        </Text>
      </View>
      {statements.map((statement, index) => (
        <View
          key={`${statement}-${index}`}
          wrap={false}
          style={[
            s.noticeItem,
            variant === 'sv' ? {
              backgroundColor: CSv.cardBg,
              borderColor: CSv.cardBorder,
              borderLeftColor: CSv.primary,
            } : {},
          ]}
        >
          <Text style={s.noticeItemText}>{statement}</Text>
        </View>
      ))}
    </View>
  );
}

/** Two-column classification sub-heading ("Mixed", "Junior Handling",
 *  "Special Award Classes", per-group headings). minPresenceAhead keeps the
 *  heading with its first class row — never stranded at a page foot — and
 *  the value lives here once so the single- and multi-breed renderers can't
 *  drift (same pattern as SectionTitle in sv-show-schedule.tsx). */
export function TwoColSectionHeader({ title }: { title: string }) {
  return (
    <View style={s.twoColMixedHeader} wrap={false} minPresenceAhead={22}>
      <Text style={s.twoColHeaderText}>{title}</Text>
    </View>
  );
}

export function GoldRule({ variant = 'rkc' }: { variant?: Variant } = {}) {
  return (
    <View style={[s.coverGoldRule, variant === 'sv' && { backgroundColor: CSv.streak }]} />
  );
}

export function Rule({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>{num}.</Text> {children}
    </Text>
  );
}
