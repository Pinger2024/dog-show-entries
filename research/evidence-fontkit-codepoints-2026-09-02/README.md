# fontkit glyph-cache text-layer letter loss — root cause, fix, evidence (2026-09-02)

## The bug

Roughly one PDF render in six lost specific letters from the **text layer**
(pdftotext / search / copy-paste) while the drawn glyphs on the page stayed
correct — e.g. "friday" would extract as "fridy". This affected any
document rendered with @react-pdf/renderer 4.3.2 sharing a font family with
another document rendered earlier in the same worker process.

## Mechanism

1. fontkit 2.0.4 (`node_modules/fontkit/dist/main.cjs` and `module.mjs`)
   caches `Glyph` objects per `Font` in `this._glyphs[gid]`. A glyph's
   `codePoints` are fixed at **first creation**:
   `getGlyph(glyph, characters = [])` (~line 12708) and
   `_getBaseGlyph(glyph, characters = [])` (~line 12693) both only create a
   new `Glyph` `if (!this._glyphs[glyph])` — once cached, the object (and
   its `codePoints`) is reused forever for that `Font` instance.

2. @react-pdf/pdfkit's TTF subsetter embeds a font at the **end** of a
   document. Its `_addGlyph(gid)`
   (`node_modules/@react-pdf/pdfkit/lib/pdfkit.js`, via
   `this.font.getGlyph(gid)` into fontkit's `getGlyph` at
   `main.cjs:12180`/`module.mjs`) walks a composite glyph's components with
   **no `characters` argument**:

   ```js
   _addGlyph(gid) {
       let glyph = this.font.getGlyph(gid);   // <-- no characters!
       ...
       for (let component of glyf.components){
           gid = this.includeGlyph(component.glyphID);
           ...
       }
   }
   ```

   'ä' is a composite glyph — 'a' + combining dieresis — in Inter, Times New
   Roman, and Libre Baskerville (all three faces this codebase embeds). If
   a document only ever lays out 'ä' (never plain 'a') in a given `Font`
   object, then when that font is embedded/subsetted at the end of the
   document, walking 'ä'`s components calls `getGlyph(aGid)` with no
   characters — caching a `Glyph` for plain 'a' with `codePoints = []`.

3. react-pdf caches the loaded fontkit `Font` object for the life of the
   **process** (`@react-pdf/font`'s `FontSource.data`). Every **later**
   document in the same process that reuses that family and lays out plain
   'a' hits the already-cached `Glyph` (`if (!this._glyphs[glyph])` is now
   false), so it silently gets the corrupted `codePoints = []` version.

4. pdfkit builds each glyph's `ToUnicode` CMap entry straight from
   `glyph.codePoints`:

   ```js
   // node_modules/@react-pdf/pdfkit/lib/pdfkit.js ~36451-36452 (and ~36466-36467)
   if (this.unicode[gid] == null) {
     this.unicode[gid] = glyph.codePoints;
   }
   ```

   With `codePoints = []`, the ToUnicode entry for 'a' is empty, so
   `pdftotext`/search/copy-paste/accessibility tooling drops every 'a' in
   that document — even though the drawn outline is completely correct
   (the *glyph id* is right; only the *text-extraction metadata* is wiped).

Because layout happens before subsetting **within** one document, the
first document rendered in a process is always clean. The bug only
surfaces once a second document reuses the same (now-contaminated) cached
`Font` — which explains the "roughly one render in six" symptom in a
long-lived render worker.

## Proof — RED (before the patch)

Test: `src/lib/__tests__/pdf-text-layer-codepoints.test.ts`. It registers a
**fresh** font family pointing at `public/fonts/inter-regular.ttf` (so its
glyph cache starts clean), renders document A containing only "ä" (real
`renderToBuffer`, no mocking), then renders document B in the same process
containing "friday a c z" in the same family, and runs `pdftotext -raw` on
B.

Verbatim failure on unpatched fontkit 2.0.4:

```
 ❯ src/lib/__tests__/pdf-text-layer-codepoints.test.ts (1 test | 1 failed) 214ms
   × fontkit glyph codePoints cache contamination (text-layer letter loss) > does not drop letters
     from a LATER document sharing a font family with an earlier composite-glyph document 211ms
     → expected 'frid y c z\n\f' to contain 'friday'

AssertionError: expected 'frid y c z\n\f' to contain 'friday'

- Expected
+ Received

- frid[7may[27m
+ frid[7m y c z[27m
```

`pdftotext -raw` on document B extracted `"frid y c z"` — the 'a' in
"friday" is gone (leaving a positional gap that reads as a word break), and
the standalone word "a" vanished entirely, while 'c' and 'z' (not
components of the one composite glyph laid out in document A) came through
untouched. This exactly reproduces the reported symptom.

`pdffonts` on the same buffer confirmed the font genuinely was embedded
(`emb=yes sub=yes uni=yes`) — ruling out "no text layer at all" as an
alternative explanation.

## Proof — GREEN (after the patch)

```
 RUN  v3.2.4 ...
 ✓ src/lib/__tests__/pdf-text-layer-codepoints.test.ts (1 test) 171ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## The fix

`patch-package`, patching fontkit 2.0.4 in **both** `dist/main.cjs` and
`dist/module.mjs`. In `getGlyph` and `_getBaseGlyph`, when the glyph is
**already cached** with empty `codePoints` and new, non-empty `characters`
are supplied, backfill the cache entry instead of trusting the stale first
write (and keep `isMark`/`isLigature` consistent, since the `Glyph`
constructor derives them from `codePoints` — see
`node_modules/fontkit/dist/main.cjs:10836-10837`).

Patch file: `patches/fontkit+2.0.4.patch`

```diff
diff --git a/node_modules/fontkit/dist/main.cjs b/node_modules/fontkit/dist/main.cjs
index 851b2d2..4d3d0d6 100644
--- a/node_modules/fontkit/dist/main.cjs
+++ b/node_modules/fontkit/dist/main.cjs
@@ -12694,6 +12694,20 @@ class $0a8ef2660a6ce4b6$export$2e2bcd8739ae039 {
         if (!this._glyphs[glyph]) {
             if (this.directory.tables.glyf) this._glyphs[glyph] = new (0, $f680320fa07ef53d$export$2e2bcd8739ae039)(glyph, characters, this);
             else if (this.directory.tables['CFF '] || this.directory.tables.CFF2) this._glyphs[glyph] = new (0, $7ee0705195f3b047$export$2e2bcd8739ae039)(glyph, characters, this);
+        } else if (characters.length > 0 && this._glyphs[glyph].codePoints.length === 0) {
+            // PATCH (patch-package, fontkit+2.0.4.patch) — see
+            // research/evidence-fontkit-codepoints-2026-09-02/README.md.
+            // A glyph cached earlier with NO characters (e.g. pdfkit's TTF
+            // subsetter walking composite-glyph components via
+            // getGlyph(gid)/_getBaseGlyph(gid) with no `characters` at
+            // font-embed time) would otherwise permanently lose its
+            // codePoints for the life of the process, corrupting every
+            // LATER document's ToUnicode text layer for that glyph
+            // ("friday" extracting as "fridy"). Backfill instead of
+            // trusting the stale empty-codePoints cache entry.
+            this._glyphs[glyph].codePoints = characters;
+            this._glyphs[glyph].isMark = characters.every((0, $elh9A$unicodeproperties.isMark));
+            this._glyphs[glyph].isLigature = characters.length > 1;
         }
         return this._glyphs[glyph] || null;
     }
@@ -12710,6 +12724,13 @@ class $0a8ef2660a6ce4b6$export$2e2bcd8739ae039 {
             if (this.directory.tables.sbix) this._glyphs[glyph] = new (0, $55855d6d316b015e$export$2e2bcd8739ae039)(glyph, characters, this);
             else if (this.directory.tables.COLR && this.directory.tables.CPAL) this._glyphs[glyph] = new (0, $42d9dbd2de9ee2d8$export$2e2bcd8739ae039)(glyph, characters, this);
             else this._getBaseGlyph(glyph, characters);
+        } else if (characters.length > 0 && this._glyphs[glyph].codePoints.length === 0) {
+            // PATCH (patch-package, fontkit+2.0.4.patch) — see
+            // research/evidence-fontkit-codepoints-2026-09-02/README.md.
+            // Same backfill as _getBaseGlyph above, for the sbix/COLR paths.
+            this._glyphs[glyph].codePoints = characters;
+            this._glyphs[glyph].isMark = characters.every((0, $elh9A$unicodeproperties.isMark));
+            this._glyphs[glyph].isLigature = characters.length > 1;
         }
         return this._glyphs[glyph] || null;
     }

(module.mjs gets the identical two hunks, using $52ZIf$isMark — its
destructured import of unicode-properties' isMark — in place of
$elh9A$unicodeproperties.isMark.)
```

Wiring:

- `patch-package` added to `dependencies` (NOT devDependencies) in
  `package.json`, because it must run on Render's production install too.
- `"postinstall": "patch-package"` added to `package.json` scripts —
  npm/`npm ci` run this automatically after every install.
- Verified: `rm -rf node_modules && npm ci` re-applies the patch cleanly
  (`patch-package 8.0.1 ... fontkit@2.0.4 ✔`), and the red-first test is
  GREEN afterwards.

### Docker worker build order (fixed)

`Dockerfile.worker` copies only `package.json`/`package-lock.json` before
running `npm ci` (to cache the install layer across source-only rebuilds).
`npm ci` runs the new `postinstall: patch-package` script — but
**patch-package silently no-ops (no error, no non-zero exit) if
`patches/` isn't present yet**, which would leave the worker image's
fontkit permanently unpatched with no visible build failure. Fixed by
adding `COPY patches ./patches` right after the manifest copy, before
`npm ci`. `.dockerignore` does not exclude `patches/`.

**Not verified**: Docker isn't installed in this sandbox, so the Dockerfile
change could only be verified by inspection (COPY order, .dockerignore
check), not by an actual `docker build`. The lead/deployer should do one
real `docker build -f Dockerfile.worker .` (or watch the next Render
worker deploy log) for the `patch-package ... fontkit@2.0.4 ✔` line before
trusting it in production.

The web service (Render's native Node runtime) clones the full repository
before running `npm install`/`npm ci`, so `patches/` is already present at
install time there — no equivalent fix needed for the web build.

## Regression checks

- `src/components/pdf-kit/__tests__/*` — 66 tests, all green.
- `src/lib/__tests__/catalogue-preflight.test.ts` — 29 tests, all green.

  (Both run together: 95 tests passed, 0 failed.)

## Golden guard drift (before → after)

Ran `npx vitest run src/__tests__/golden/documents.golden.test.ts` once
(remi_test_kit), per instructions — baselines were **not** regenerated.

**39 of 164 golden-document assertions failed** (125 passed). Splitting
those 39 by cause:

- **29 are unrelated date drift**, not the fontkit fix: every affected
  document is a `report-*` PDF whose only diff is
  `generated1september2026` → `generated2september2026` — the session's
  clock rolled from 1 Sept to 2 Sept partway through this task (see the
  `<system-reminder>` mid-conversation), and these reports stamp today's
  date. Confirmed mechanically: every `report-*` diff.md's lines are
  100% `generated...` lines; zero non-date content changed in any of them.

- **10 are genuine text-layer drift from the fix** — all in
  `catalogue-*` documents (never `report-*`), exactly as predicted: several
  committed catalogue baselines were captured while the process's fontkit
  cache was already contaminated, so they encode the *dropped-letter*
  text. Now that extraction is correct, they diff against the *clean* text:

  - `synthetic-zero-entry-draft/catalogue-standard` — **the clearest
    smoking gun**: baseline text `"oentries"` (dropped leading 'n') →
    now correctly `"noentries"`, on 6 lines across pages 3-4.
  - `clyde-valley-open-2026/catalogue-by-class`,
    `clyde-valley-open-2026/catalogue-standard` — synthetic
    anonymised-data strings gaining back dropped `x` characters (e.g.
    `"rlmhvdiut"` → `"rlmhvdxiut"`, `"dob14012026dogsiretsgbizapeldlgsmhsdam..."`
    → `"...tsgbixzapeldlgsmhsdamx..."`), plus two heading lines
    ("Dogs/Bitches…" / "Junior Handling…") swapping Y-position — a
    knock-on layout effect of the corrected (now slightly wider) text.
  - `south-western-champ-2026/catalogue-by-class`,
    `south-western-champ-2026/catalogue-standard`,
    `south-western-champ-2026/catalogue-marked` — the same
    "Dogs/Bitches" ↔ "Junior Handling" Y-position swap, no letter
    changes on these three (this show's data didn't happen to contain
    a dropped `x`/`n`, but the same heading-width knock-on applies).
  - `clyde-valley-open-2026/catalogue-marked`,
    `ne-regional-2026/catalogue-marked`,
    `regional-show-2026/catalogue-marked`,
    `winter-spectacular-2026/catalogue-marked` — a two-word "Dogs" +
    "Bitches" pair that pdftotext previously extracted as two separate
    lines now merges into one `"dogsbitches"` line (the corrected
    ToUnicode/spacing removes whatever gap the dropped codepoints were
    leaving); `ne-regional-2026` and `regional-show-2026` additionally
    show the same `x`-restoration pattern as the clyde-valley/south-western
    catalogues, across many exhibitor-index lines.

Net: after the fix, the guard shows **10 catalogue-document diffs
directly attributable to now-correct text**, down from what would
previously have been silently-wrong-but-passing baselines, with **zero**
non-date, non-fontkit diffs elsewhere. These 10 baselines are the ones the
lead should review and regenerate (`npm run golden:update`) once satisfied
the new text is correct — this task deliberately did not touch them.

## Files

- `src/lib/__tests__/pdf-text-layer-codepoints.test.ts` — red-first proof.
- `patches/fontkit+2.0.4.patch` — the fix.
- `package.json` — `patch-package` dependency + `postinstall` script.
- `Dockerfile.worker` — `COPY patches ./patches` before `npm ci`.
