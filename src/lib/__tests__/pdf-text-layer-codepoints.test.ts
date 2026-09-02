/**
 * Root-cause proof for the "one render in six loses letters from the PDF
 * TEXT LAYER" bug (2026-09-02).
 *
 * Mechanism (see research/evidence-fontkit-codepoints-2026-09-02/README.md
 * for the full writeup):
 *
 *  - fontkit 2.0.4 caches Glyph objects per Font in `_glyphs[gid]`. A
 *    glyph's `codePoints` are fixed at FIRST creation
 *    (`getGlyph(glyph, characters = [])` / `_getBaseGlyph(...)`,
 *    node_modules/fontkit/dist/main.cjs ~12693/~12708).
 *  - @react-pdf/pdfkit's TTF subsetter walks composite glyphs' components
 *    when embedding a font at the END of a document
 *    (`_addGlyph(gid)` -> `this.font.getGlyph(gid)` with NO characters,
 *    node_modules/fontkit/dist/main.cjs ~12180). 'ä' is a composite of
 *    'a' + dieresis in Inter (and Times / Libre Baskerville). If plain 'a'
 *    has not yet been laid out in that font object when 'ä' is embedded,
 *    the cached 'a' glyph is created with `codePoints = []`.
 *  - react-pdf caches the loaded fontkit Font for the life of the process
 *    (@react-pdf/font FontSource.data). Every LATER document that lays out
 *    'a' in the SAME family gets the cached empty-codePoints glyph.
 *    pdfkit builds ToUnicode from `glyph.codePoints`
 *    (node_modules/@react-pdf/pdfkit/lib/pdfkit.js ~36451-36452), so the
 *    ToUnicode entry for 'a' is empty and `pdftotext` silently drops it.
 *
 * Because layout precedes subsetting within a single document, the FIRST
 * document rendered in a process is always clean — the bug only shows up
 * once a second document reuses the same (now-contaminated) cached Font.
 *
 * This test reproduces it in-process with a throwaway font family name so
 * it doesn't depend on (or contaminate) any other test's font cache.
 */
import { describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import React from 'react';
import { Document, Font, Page, Text, renderToBuffer } from '@react-pdf/renderer';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
const interPath = path.join(fontsDir, 'inter-regular.ttf');

function pdftotextRaw(buffer: Buffer): string {
  const tmpFile = path.join(os.tmpdir(), `codepoints-test-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    return execFileSync('pdftotext', ['-raw', tmpFile, '-'], { encoding: 'utf8' });
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function pdffontsList(buffer: Buffer): string {
  const tmpFile = path.join(os.tmpdir(), `codepoints-test-fonts-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    return execFileSync('pdffonts', [tmpFile], { encoding: 'utf8' });
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

describe('fontkit glyph codePoints cache contamination (text-layer letter loss)', () => {
  it('does not drop letters from a LATER document sharing a font family with an earlier composite-glyph document', async () => {
    // Fresh, never-before-used family name so this test is independent of
    // any other test's / any other document's font cache state.
    const family = `TestInter-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    Font.register({
      family,
      fonts: [{ src: interPath }],
    });

    // Document A: lays out ONLY 'ä' (a composite glyph: 'a' + combining
    // dieresis in Inter) in this family. Plain 'a' is never laid out here,
    // so if the bug is present, embedding this document caches a
    // codePoints=[] Glyph object for 'a' in the shared fontkit Font.
    const docA = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: { fontFamily: family } },
        React.createElement(Text, null, 'ä'),
      ),
    );
    await renderToBuffer(docA as any);

    // Document B: a later, independent document in the SAME process that
    // reuses the SAME family and lays out plain letters, including ones
    // that also appear as components of composite glyphs ('a', 'c', 'z').
    const docB = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: { fontFamily: family } },
        React.createElement(Text, null, 'friday a c z'),
      ),
    );
    const bufferB = await renderToBuffer(docB as any);

    // pdffonts reports the underlying font name (e.g. "Inter-Regular"), not
    // the react-pdf family alias -- just confirm the font is genuinely
    // embedded (emb/sub/uni columns), which rules out "no text layer at
    // all" as the explanation for any missing letters below.
    const fontsReport = pdffontsList(bufferB);
    expect(fontsReport).toMatch(/Inter-Regular/);
    expect(fontsReport).toMatch(/yes\s+yes\s+yes/); // emb sub uni all yes

    const text = pdftotextRaw(bufferB);

    // This is the actual bug: pdftotext (the text layer, used for search /
    // copy-paste / accessibility) drops 'a' from "friday", producing
    // "fridy" -- even though the DRAWN glyphs on the page are correct.
    expect(text).toContain('friday');
  }, 30000);
});
