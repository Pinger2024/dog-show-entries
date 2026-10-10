/**
 * generateCataloguePdf / generateAndUploadForPrint used to build their OWN
 * show/entries query and their OWN component map, entirely separate from the
 * canonical snapshot-based pipeline (catalogue-snapshot.ts's
 * buildCatalogueSnapshot/renderCatalogueFromSnapshot — the path the
 * document-render worker and the /api/catalogue route actually use). Two
 * silent-substitution bugs fell out of that duplication:
 *
 *   (a) on a wusv show, the legacy path forced EVERY format to 'by-class' —
 *       asking it for 'judge-copy' silently rendered the plain catalogue with
 *       no results filled in, with no error. This is exactly what a stale
 *       render worker did on demo (2026-09-07), cached by snapshot hash.
 *   (b) on an RKC show, an unknown format made `formatComponents[fmt]`
 *       undefined and React threw an opaque "element type is invalid" error
 *       instead of a clear, typed one.
 *
 * generateCataloguePdf is now a thin wrapper over the canonical pipeline, so
 * these tests exercise it (and generateAndUploadForPrint's format
 * validation) against a real test-DB-backed show/entries/results — the same
 * kind of fixture the canonical renderer is already proven against.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from '@/server/db';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeUser,
} from '../helpers/factories';
import { generateCataloguePdf, generateAndUploadForPrint } from '@/server/services/pdf-generation';
import { buildCatalogueSnapshot, renderCatalogueFromSnapshot } from '@/server/services/catalogue-snapshot';
import { UnsupportedCatalogueFormatError } from '@/server/services/catalogue-jobs';
import { extractDocumentGeometry } from '../golden/lib/pdf-inspect';

vi.mock('@/server/services/storage', () => ({
  uploadToR2: vi.fn(async () => {}),
  getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function extractRawText(pdf: Buffer): string {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'catalogue-one-renderer-'));
  try {
    const pdfPath = path.join(tmpDir, 'doc.pdf');
    writeFileSync(pdfPath, pdf);
    return execFileSync('pdftotext', ['-raw', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Build a wusv (SV/regional) show with one class, one confirmed entry, and
 *  a published result carrying an SV grade — the minimum fixture the
 *  'judge-copy' format's fill-in grid needs. */
async function makeWusvShowWithGradedResult() {
  const { org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_closed',
  });
  const classDef = await makeClassDef({ name: 'SV Working Class', type: 'age' });
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: breed.id,
    sex: 'dog',
    classNumber: 1,
    sortOrder: 1,
  });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Regional Grade Dog' });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  await makeResult({ entryClassId: entryClass.id, placement: 1, svGrade: 'sg' });
  return { show, showClass, entry };
}

/** Build a plain RKC (non-wusv) show with one class and one confirmed entry —
 *  enough for a 'standard'/'by-class'/'judging' render, and the fixture the
 *  unknown-format tests use to reveal the legacy path's opaque React crash. */
async function makeRkcShowWithEntry() {
  const { org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_closed',
  });
  const classDef = await makeClassDef({ name: 'Open Dog', type: 'age' });
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: breed.id,
    sex: 'dog',
    classNumber: 1,
    sortOrder: 1,
  });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'RKC Fixture Dog' });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { show, showClass, entry };
}

/** Build a single-breed RKC show with 3 breed classes + 1 Junior Handling
 *  class + one confirmed entry — the minimum fixture for the cover's
 *  "N Breed Classes" count (Mandy 2026-09-08), which must exclude JH. */
async function makeRkcShowWithBreedAndJhClasses() {
  const { org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_closed',
  });
  const breedClassDefs = await Promise.all(
    [1, 2, 3].map((i) => makeClassDef({ name: `Breed Class ${i}`, type: 'age' })),
  );
  const breedShowClasses = await Promise.all(
    breedClassDefs.map((classDef, i) =>
      makeShowClass({
        showId: show.id,
        classDefinitionId: classDef.id,
        breedId: breed.id,
        sex: 'dog',
        classNumber: i + 1,
        sortOrder: i + 1,
      }),
    ),
  );
  const jhClassDef = await makeClassDef({ name: 'Junior Handling', type: 'junior_handler' });
  await makeShowClass({
    showId: show.id,
    classDefinitionId: jhClassDef.id,
    sex: null,
    classNumber: null,
    sortOrder: 99,
  });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Breed Count Fixture Dog' });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  await makeEntryClass({ entryId: entry.id, showClassId: breedShowClasses[0]!.id });
  return { show };
}

describe('buildCatalogueSnapshot — totalClasses excludes Junior Handling (Mandy 2026-09-08)', () => {
  it('single-breed RKC show: totalClasses counts only breed classes, and the standard catalogue cover reads "3 Breed Classes"', async () => {
    const { show } = await makeRkcShowWithBreedAndJhClasses();

    const snapshot = await buildCatalogueSnapshot(db, show.id);
    expect(snapshot.showInfoBase.totalClasses).toBe(3);

    const buf = await renderCatalogueFromSnapshot(snapshot, 'standard');
    const text = extractRawText(buf);
    expect(text).toMatch(/3\s*Breed Class\s*es/);
  });
});

describe('generateCataloguePdf — one renderer (RED TEST 1: judge-copy on wusv)', () => {
  it('fills the judge-copy results grid with the real SV grade, never the silently-substituted plain catalogue', async () => {
    const { show } = await makeWusvShowWithGradedResult();

    const buf = await generateCataloguePdf(show.id, 'judge-copy');
    const text = extractRawText(buf);

    // The legacy path forced every wusv format to 'by-class' regardless of
    // what was asked for — before the fix this assertion fails because the
    // grid never gets filled in at all (no grade appears anywhere).
    expect(text).toMatch(/\bSG\b/);
  });
});

describe('generateAndUploadForPrint — one renderer (RED TEST 2: unchecked cast)', () => {
  it('rejects an unrecognised format with UnsupportedCatalogueFormatError, not an opaque React crash or a silently-produced PDF', async () => {
    const { show } = await makeRkcShowWithEntry();

    await expect(
      generateAndUploadForPrint(show.id, 'catalogue', 'not-a-format'),
    ).rejects.toBeInstanceOf(UnsupportedCatalogueFormatError);
  });
});

describe('generateCataloguePdf — one renderer (RED TEST 3: stale "alphabetical" format)', () => {
  it('rejects the never-implemented "alphabetical" format with the typed error', async () => {
    const { show } = await makeRkcShowWithEntry();

    await expect(
      generateCataloguePdf(show.id, 'alphabetical' as unknown as Parameters<typeof generateCataloguePdf>[1]),
    ).rejects.toBeInstanceOf(UnsupportedCatalogueFormatError);
  });
});

describe('generateCataloguePdf — byte/geometry equality guard against the canonical renderer', () => {
  it('RKC show: standard/by-class/judging render identically (page count + text) to renderCatalogueFromSnapshot', async () => {
    const { show } = await makeRkcShowWithEntry();

    for (const fmt of ['standard', 'by-class', 'judging'] as const) {
      const viaWrapper = await generateCataloguePdf(show.id, fmt);
      const snapshot = await buildCatalogueSnapshot(db, show.id);
      const viaCanonical = await renderCatalogueFromSnapshot(snapshot, fmt);

      // Not a raw byte comparison — react-pdf/pdf-lib embed a fresh
      // CreationDate/ModDate on every render, so two back-to-back renders
      // of identical content are never byte-identical. Page count + folded
      // per-page text (same normalisation the golden suite uses) is the
      // content-equality signal that actually matters here.
      const geoWrapper = await extractDocumentGeometry(viaWrapper);
      const geoCanonical = await extractDocumentGeometry(viaCanonical);
      expect(geoWrapper.pageCount, `format ${fmt}: page count`).toBe(geoCanonical.pageCount);
      expect(geoWrapper.pages, `format ${fmt}: page text`).toEqual(geoCanonical.pages);
    }
  });

  it('wusv show: standard/by-class/judging render identically (page count + text) to renderCatalogueFromSnapshot', async () => {
    const { show } = await makeWusvShowWithGradedResult();

    for (const fmt of ['standard', 'by-class', 'judging'] as const) {
      const viaWrapper = await generateCataloguePdf(show.id, fmt);
      const snapshot = await buildCatalogueSnapshot(db, show.id);
      const viaCanonical = await renderCatalogueFromSnapshot(snapshot, fmt);

      const geoWrapper = await extractDocumentGeometry(viaWrapper);
      const geoCanonical = await extractDocumentGeometry(viaCanonical);
      expect(geoWrapper.pageCount, `format ${fmt}: page count`).toBe(geoCanonical.pageCount);
      expect(geoWrapper.pages, `format ${fmt}: page text`).toEqual(geoCanonical.pages);
    }
  });
});
