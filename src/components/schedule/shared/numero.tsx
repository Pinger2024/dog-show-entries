import { Text } from '@react-pdf/renderer';

/**
 * The "№" (numero sign) glyph isn't in Hanken Grotesk's latin subset — this
 * renders it in Inter instead, nested inside the caller's own eyebrow/label
 * `<Text>` so only this one character switches font (2026-07-10). Shared
 * across the SV/WUSV schedule and catalogue front-matter, which all hit the
 * same glyph gap.
 */
export function Numero() {
  return <Text style={{ fontFamily: 'Inter' }}>№</Text>;
}
