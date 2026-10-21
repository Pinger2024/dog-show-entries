/**
 * pdf-kit/fit-text — single- or few-line text that shrinks to fit a width,
 * replacing the pattern of a hand-picked font size (5.5–7.5pt scattered
 * across the catalogue/schedule/prize-card components) chosen once by eye
 * for the longest realistic value and then never revisited when a longer
 * show/club/dog name inevitably turns up.
 *
 * Sizing happens via `measure.ts`'s `fitFontSize` BEFORE render (react-pdf
 * has no measure-after/shrink-to-fit primitive), so the emitted `<Text>`
 * always renders once, already at its final size.
 */
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { fitFontSize, estimateTextHeight, type FontWeight, type FontStyle } from './measure';
import type { PdfKitAnyFamily } from './fonts';

export interface FitTextProps {
  children: string;
  /** Width, in points, this text must fit within. */
  maxWidth: number;
  family: PdfKitAnyFamily;
  weight?: FontWeight;
  fontStyle?: FontStyle;
  /** Defaults to 1 — the common single-line case (a card's dog name, a
   *  cover's show title on one line). */
  maxLines?: number;
  lineHeight?: number;
  /** The floor this text will never shrink past — chosen size stops here
   *  even if the text still overflows at `min` (it renders at `min` and may
   *  still wrap/clip beyond `maxLines`, same as a fixed-size Text would). */
  min: number;
  /** The size tried first — anything that already fits renders at `max`. */
  max: number;
  /** Size decrement per trial, forwarded to `fitFontSize` (default 0.5pt). */
  step?: number;
  /** Merged onto the `Text`; `fontFamily`/`fontWeight`/`fontStyle`/
   *  `fontSize` set by this component can be overridden by including them
   *  here (applied after the computed defaults). */
  style?: Style;
  /** When true, wraps the rendered Text in a View given an explicit
   *  `minHeight` computed via measure.ts's `estimateTextHeight` (the same
   *  fontkit measurement this component's own sizing decision already
   *  relies on) rather than trusting react-pdf's own layout to reserve
   *  enough space for whatever this text renders at.
   *
   *  Found necessary for a real bug (coordinator's review, 2026-09-02): a
   *  Text with no EXPLICIT `lineHeight` of its own (relying on
   *  inheritance from an ancestor) can get a react-pdf-computed box
   *  shorter than its actual rendered glyphs for some family/weight
   *  combinations (confirmed for HankenGrotesk ExtraBold via an isolated
   *  repro with no FitText involved at all) — the very next sibling then
   *  starts before this one's text has finished drawing, a real visual
   *  overlap. Setting `lineHeight` explicitly on the CALLER's own style
   *  (not something FitText can force from here) is the direct fix; this
   *  flag is the defensive backstop for whatever combination hasn't been
   *  found yet — it makes the reserved space authoritative regardless of
   *  what react-pdf's own Text-height computation does for this family/
   *  weight/lineHeight, at the cost of a wrapping View (see
   *  render-with-page-budget usage elsewhere in this kit for why an
   *  extra wrapper is fine here: FitText is never used with
   *  minPresenceAhead — see the file-level limitation in flow.tsx/
   *  section-title.tsx for the one case where a wrapper IS a problem). */
  reserveHeight?: boolean;
}

/**
 * Renders `children` in `family`/`weight`/`fontStyle`, shrunk (in `step`
 * decrements from `max` down to `min`) to the largest size that fits
 * `maxWidth` within `maxLines` lines.
 */
export function FitText({
  children,
  maxWidth,
  family,
  weight,
  fontStyle,
  maxLines = 1,
  lineHeight,
  min,
  max,
  step,
  style,
  reserveHeight,
}: FitTextProps) {
  const size = fitFontSize(children, {
    maxWidth,
    maxLines,
    family,
    weight,
    style: fontStyle,
    lineHeight,
    min,
    max,
    step,
  });

  // Only constrain the rendered Text to maxWidth when shrinking actually
  // happened (size < max). Text that already fits comfortably at `max`
  // renders exactly as an unconstrained <Text> would — no `width` at all —
  // rather than forcing every caller's box to literally maxWidth. Found to
  // matter for a maxLines > 1 caller migrating a real document onto this
  // kit: measure.ts's line-count estimate ran a couple of percent hot for
  // one font/text combination, and setting an explicit `width` (even at
  // the same nominal value the text was already measured against) wrapped
  // a title that already fit on one line at `max` onto two — an
  // unconstrained Text with the same font size did not. Skipping the width
  // whenever no shrinking occurred sidesteps that class of discrepancy
  // entirely for the (most common) case, rather than depending on
  // measure.ts's accuracy being perfect for every family. See
  // fit-text.test.tsx's "matches an unconstrained Text when it already
  // fits at max" case.
  const widthStyle = size < max ? { width: maxWidth } : {};

  const textElement = (
    <Text
      style={[
        {
          fontFamily: family,
          fontWeight: weight,
          fontStyle,
          fontSize: size,
          ...widthStyle,
        },
        style ?? {},
      ]}
    >
      {children}
    </Text>
  );

  if (!reserveHeight) return textElement;

  // Measured against the SAME width the text actually renders at (the
  // full maxWidth when shrinking happened; otherwise its natural
  // intrinsic width, which estimateTextHeight can't know — maxWidth is
  // still a safe over-estimate there, since a shorter intrinsic line
  // wraps to at most as many lines as the full-width estimate).
  const reservedHeight = estimateTextHeight(children, {
    width: maxWidth,
    family,
    weight,
    style: fontStyle,
    size,
    lineHeight,
  });

  return <View style={{ minHeight: reservedHeight }}>{textElement}</View>;
}
