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
import { Text } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { fitFontSize, type FontWeight, type FontStyle } from './measure';
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

  return (
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
}
