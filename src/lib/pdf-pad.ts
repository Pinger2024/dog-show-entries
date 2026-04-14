import { PDFDocument } from 'pdf-lib';

/**
 * Pad a PDF buffer so its page count is a multiple of the given
 * modulus. Saddle-stitched booklets (Mixam et al.) fold A4 sheets
 * in half → 4 pages per physical sheet, so the PDF's page count
 * MUST be a multiple of 4 or the printer will reject it.
 *
 * Blank pages are appended at the end, matching the size of the
 * last page in the document so the booklet binds cleanly.
 *
 * Returns a new Uint8Array; the input is not mutated.
 */
export async function padPdfToMultiple(
  input: Uint8Array | Buffer,
  modulus = 4,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  const currentPages = doc.getPageCount();
  const target = Math.ceil(currentPages / modulus) * modulus;
  const pagesToAdd = target - currentPages;

  if (pagesToAdd === 0) {
    return doc.save();
  }

  // Mirror the size of the final page so the blanks match the
  // booklet trim. pdf-lib's addPage accepts [width, height] in pts.
  const lastPage = doc.getPage(currentPages - 1);
  const { width, height } = lastPage.getSize();
  for (let i = 0; i < pagesToAdd; i++) {
    doc.addPage([width, height]);
  }

  return doc.save();
}
