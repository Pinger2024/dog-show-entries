/**
 * REGRESSION — a real, previously-shipping visual bug found by the
 * coordinator's review (2026-09-02): CatalogueHeader's title
 * ("Test Stress Championship Show 2030") overlapped the show-type
 * subtitle ("Championship Show") directly beneath it. Confirmed already
 * present, unnoticed, in real committed catalogue-absentees output
 * before this fix — bagsd-champ-2026's golden baseline literally
 * interleaves "Championship Show" characters into the show-name title's
 * own poppler line ("19classsinglebchampionship" / "reedcshow" /
 * "hampionshipshow" — "breed" and "championship" from two DIFFERENT
 * source strings merged into the same line groups).
 *
 * Root cause: headerTitle (HankenGrotesk ExtraBold) had no explicit
 * `lineHeight` of its own, relying on inheriting styles.page's 1.3 — for
 * this family/weight, react-pdf's own layout ended up reserving less
 * vertical space for the title than its glyphs actually need, so the
 * very next sibling (headerShowType) started drawing before the title
 * finished. Confirmed via an isolated repro with no CatalogueHeader
 * logic involved at all (a bare sequence of Text siblings, same fonts/
 * sizes/lineHeight-omission) — this is a real react-pdf layout quirk,
 * not something specific to this component's JSX.
 *
 * Fixed two ways: (1) headerTitle now sets lineHeight explicitly
 * (catalogue-styles.ts) — the direct fix; (2) the title itself is now
 * FitText with reserveHeight (see pdf-kit/fit-text.tsx's own
 * "reserveHeight" test for that mechanism in isolation) — the defensive
 * backstop for whatever OTHER family/weight combination hasn't been
 * found yet.
 *
 * PROVING THIS TEST FAILS (brief requirement — noted here, not left in
 * the tree): reverted styles.headerTitle to omit lineHeight AND passed
 * reserveHeight={false} to the FitText call — this test failed with the
 * subtitle's yMin (50.3ish before the fix's spacing changes shifted
 * things) starting before the title's own yMax, a real overlap
 * reproduced end-to-end through the real component. Restored both
 * before committing.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { styles } from '../catalogue-styles';
import { CatalogueHeader } from '../catalogue-header';

interface Line {
  yMin: number;
  yMax: number;
}

function extractLines(buf: Buffer): Line[] {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'catalogue-header-test-'));
  try {
    const pdfPath = path.join(tmpDir, 'doc.pdf');
    writeFileSync(pdfPath, buf);
    const xml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-']).toString('utf8');
    const lineRe = /<line xMin="[\d.-]+" yMin="([\d.-]+)" xMax="[\d.-]+" yMax="([\d.-]+)">/g;
    const lines: Line[] = [];
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(xml))) {
      lines.push({ yMin: parseFloat(m[1]!), yMax: parseFloat(m[2]!) });
    }
    return lines;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function renderHeader(showName: string) {
  const buf = await renderToBuffer(
    <Document>
      <Page size="A5" style={styles.page} wrap>
        <CatalogueHeader
          showName={showName}
          showType="championship"
          organisationName="The German Shepherd Dog Club Of Greater Testington Districts"
          subtitle="Absentee List"
          date="2030-07-12"
          venue="Test Stress Showground"
          kcLicenceNo="TEST/2030/STRESS"
        />
      </Page>
    </Document>,
  );
  return extractLines(buf);
}

describe('CatalogueHeader — title never overlaps the subtitle beneath it', () => {
  it('a long show name (the real stress-fixture case) renders with no vertical overlap between any two consecutive lines', async () => {
    const lines = await renderHeader('Test Stress Championship Show 2030');
    const sorted = [...lines].sort((a, b) => a.yMin - b.yMin);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      // A tiny (<0.1pt) tolerance for floating-point rounding — not a
      // real overlap.
      expect(cur.yMin).toBeGreaterThanOrEqual(prev.yMax - 0.1);
    }
  });

  it('a short, ordinary show name also renders with no overlap (behaviour-identical for the common case)', async () => {
    const lines = await renderHeader('Test Open Show');
    const sorted = [...lines].sort((a, b) => a.yMin - b.yMin);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.yMin).toBeGreaterThanOrEqual(sorted[i - 1]!.yMax - 0.1);
    }
  });
});
