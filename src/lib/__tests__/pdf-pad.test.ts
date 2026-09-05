import { describe, it, expect } from 'vitest';
import { PDFDocument, Duplex } from 'pdf-lib';
import { setSimplexViewerPreference, padPdfToMultiple } from '../pdf-pad';

/**
 * Scotland 30 Aug 2026 (memory project_prize_cards_duplex_incident_2026-08-30):
 * the 71-card prize-cards PDF was printed duplex at home — no per-document
 * hint told the home printer to go single-sided — and 36 sheets came out
 * unusable (adjacent cards printed back-to-back on one sheet). Setting the
 * PDF's own ViewerPreferences /Duplex /Simplex tells a compliant print
 * dialog to default to single-sided, so the mistake can't repeat by default.
 */

async function buildTinyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([420, 595]);
  return doc.save();
}

describe('setSimplexViewerPreference', () => {
  it('sets /Duplex /Simplex in the saved PDF, readable back via pdf-lib', async () => {
    const raw = await buildTinyPdf();
    const out = await setSimplexViewerPreference(raw);

    const reloaded = await PDFDocument.load(out);
    const prefs = reloaded.catalog.getOrCreateViewerPreferences();
    expect(prefs.getDuplex()).toBe(Duplex.Simplex);
  });

  it('does not change the page count or content', async () => {
    const raw = await buildTinyPdf();
    const before = (await PDFDocument.load(raw)).getPageCount();
    const out = await setSimplexViewerPreference(raw);
    const after = (await PDFDocument.load(out)).getPageCount();
    expect(after).toBe(before);
  });
});

describe('padPdfToMultiple — booklet documents stay untouched by the duplex hint', () => {
  it('a padded booklet PDF has NO /Duplex viewer preference set', async () => {
    const raw = await buildTinyPdf(); // 1 page → pads to 4
    const padded = await padPdfToMultiple(raw, 4);
    const reloaded = await PDFDocument.load(padded);
    expect(reloaded.getPageCount()).toBe(4);
    const prefs = reloaded.catalog.getOrCreateViewerPreferences();
    expect(prefs.getDuplex()).toBeUndefined();
  });
});
