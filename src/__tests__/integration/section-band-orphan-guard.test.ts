/**
 * Mandy, 22 Sept 2026, on the Midland regional catalogue: "the junior
 * handling class have orphaned" — the JUNIOR HANDLING band and its judge
 * sat alone at the foot of a page, the classes overleaf.
 *
 * Why a source guard rather than a rendered fixture: the orphan only
 * appears when the space left on a page falls in a narrow window — enough
 * for the band's own `minPresenceAhead`, not enough for the class block
 * that follows (on a regional that block carries a sponsor banner of up to
 * 142pt, so the window moves with the artwork). A fixture tuned to land in
 * that window would stop exercising anything the first time a layout
 * change shifted it, and would still pass. The guarantee we actually want
 * is structural: the band is INSIDE the first class's atomic
 * `wrap={false}` block, so the two cannot be separated at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'src/components/catalogue/catalogue-by-class.tsx');

describe('catalogue section bands cannot orphan', () => {
  const src = readFileSync(FILE, 'utf8');

  it('renders ClassSectionBand inside the atomic wrap={false} class block, not before it', () => {
    const atomic = src.indexOf('<View wrap={false}>');
    expect(atomic).toBeGreaterThan(-1);
    const classContainer = src.indexOf('wrap={!keepTogether}');
    expect(classContainer).toBeGreaterThan(-1);

    for (const m of src.matchAll(/<ClassSectionBand\b/g)) {
      // Every use sits after the atomic block opens — i.e. within it —
      // never between the Fragment and the class container.
      expect(m.index!).toBeGreaterThan(atomic);
      expect(m.index!).toBeGreaterThan(classContainer);
    }
    expect([...src.matchAll(/<ClassSectionBand\b/g)]).toHaveLength(2); // Special Awards + Junior Handling
  });

  it('does not rely on minPresenceAhead to keep the band with its class', () => {
    // react-pdf honours minPresenceAhead only as "leave N points free", and
    // ignores it entirely on a wrapping View. Neither expresses "as much
    // room as the next atomic block needs", which is the actual rule.
    const band = src.slice(src.indexOf('function ClassSectionBand'), src.indexOf('function ClassSectionBand') + 900);
    expect(band).not.toMatch(/minPresenceAhead\s*=\s*\{/); // the prop itself, not prose about it
  });

  it('the standard (ringside) catalogue keeps its section band with the first class too', () => {
    const ring = readFileSync(
      join(process.cwd(), 'src/components/catalogue/catalogue-ringside.tsx'),
      'utf8',
    );
    // The band must not stand as its own look-ahead-guarded sibling before
    // the class list — that is the shape that orphaned on by-class.
    expect(ring).not.toMatch(/<View minPresenceAhead=\{80\}>\s*<Text style=\{s\.sexBand\}/);
    // It renders inside the atomic header block, for the first class only.
    const atomic = ring.indexOf('<View wrap={false} minPresenceAhead={keepAtomic');
    const band = ring.indexOf('<Text style={s.sexBand}>');
    expect(atomic).toBeGreaterThan(-1);
    expect(band).toBeGreaterThan(atomic);
  });
});
