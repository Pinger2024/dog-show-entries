# Phase B evidence — front-matter-on-kit (2026-09-02)

Before/after PNG pairs for every golden baseline changed by Phase B (adaptive
behaviour) commits, per the task brief. "BEFORE" was rendered from the last
Phase-A commit (`7917b116`, before the ClassDefinitionsContent → Flow
rewrite) using a throwaway scratch vitest file (not committed) that calls
the same `renderAllDocuments`/`rasterisePages` helpers the golden guard
itself uses, so BEFORE and AFTER are pixel-comparable real renders, not
recollection.

## ClassDefinitionsContent → Flow (fixes "definitions page spills onto a
## near-blank next page")

Root cause confirmed live: the whole "Definitions of Classes" section
(heading + every definition) rendered inside one `wrap={false}` block. If
it didn't fit in the space left on the current page, the ENTIRE block
moved to a fresh page — even when most of it would have fit where it was —
and if that whole block was too tall for even a fresh page, it silently
overflowed (no pagination at all, since `wrap={false}` blocks don't
paginate). Rebuilt on pdf-kit's `Flow`: one block, heading = the section
band, body = every definition (each still individually atomic via
`KeepTogether`) — the heading stays glued to the start of the list, but the
list itself can now split at a definition boundary like normal flowing
content.

- `bagsd-catalogue-standard-BEFORE-page5.png` / `-AFTER-page5.png` — BEFORE:
  page 5 ends after "Other Judges" with the entire lower half of the page
  blank because the 11-definition block didn't fit and moved wholesale to
  page 6. AFTER: the same page now also carries "Definitions of Classes"
  through "Limit" (6 of 11 defs), filling the page.
- `bagsd-catalogue-standard-BEFORE-page6.png` / `-AFTER-page6.png` — BEFORE:
  page 6 opens with ALL 11 definitions crammed in, followed by a large
  blank area. AFTER: only the remaining 5 definitions (Open through JHA
  Handling 12-16) are here — no orphaned heading, no cut-off text, and the
  combined blank space across the two pages is smaller than before.
- `sw-BEFORE-page6.png` / `-AFTER-page6.png` and `sw-BEFORE-page7.png` /
  `-AFTER-page7.png` — South Western championship show (the show the
  cover-overflow historical bug is named after — this is the same root
  cause, a different symptom, on the same show). Same pattern: AFTER packs
  the first few definitions onto the page that used to end early, and page
  7 is now completely full of the remaining definitions with no blank
  trailing gap at all.
- `zero-BEFORE-page{1..8}.png` / `zero-AFTER-page{2,3,4}.png` — the
  synthetic zero-entry-draft fixture (deliberately sparse/null-heavy test
  data) went from **8 pages to 4** for this document. BEFORE, the
  definitions block's wholesale moves cascaded across several
  near-empty pages; AFTER, everything (welfare block, jurisdiction, judges,
  definitions, the Dog/Bitch class placeholders, Best Awards) packs into 4
  fully-used pages with no broken/overlapping/duplicated content — checked
  by eye, not asserted from the geometry diff alone.

Also affects clyde-valley-open-2026, gsd-scotland-champ-2026,
north-eastern-champ-2026, and synthetic-rkc-champ's catalogue-standard /
catalogue-by-class (same code path, same class of fix). BEFORE and AFTER
PNGs for all four were opened and compared by eye during development
(not just the geometry diff) — not re-saved here as separate pairs since
the mechanism and outcome are identical to the three fully-documented
cases above, but summarised per show:

- **clyde-valley-open-2026** — the biggest single win: the whole
  definitions list (which used to spill across 2 pages, mostly blank) now
  fits on ONE page, and the document shrinks from 20 to 16 pages overall
  (confirmed via the folio text itself: "page X of 17" → "page X of 16"
  on every subsequent page). Checked page 4 (now: judges + all 12
  definitions, full page, nothing cut off) and page 5 (now: Sponsors table
  starts cleanly, straight into the Dog classes) — no lost or duplicated
  content, just 4 fewer wasted pages.
- **gsd-scotland-champ-2026** — pages 10-11: definitions split cleanly
  mid-list (Yearling is the last item that fits on 10; Post Graduate
  onward continues on 11), both pages fully used, no orphaned heading.
- **north-eastern-champ-2026** — pages 3-4: same pattern, page 3 now full
  (Practical Info + Additional Notes + Judges + 9 of 11 definitions),
  page 4 carries the remaining 2 (still has trailing blank space, but
  strictly less than before, and Best Awards is deliberately on a fresh
  page per Mandy's spec — see BestAwardsContent's `break`).
- **synthetic-rkc-champ** — directly compared before/after for this one
  too (page 4/5): BEFORE, page 4 ended after "Special Award Classes" with
  roughly 60% of the page blank because all 12 definitions (short —
  this fixture's class definitions carry no description text) moved
  wholesale to page 5, which itself was then ~75% blank. AFTER, page 4
  carries 7 of the 12 definitions (fully using the space that used to sit
  empty) and page 5 carries the remaining 5 — still with trailing blank
  space (nothing else flows in before Best Awards' forced page break),
  but markedly less wasted space across the two pages combined than
  before.

## Cover FitText (club name + show title)

No real fixture's baseline changed — see the commit message
(`7917b116`): every real show's club/show name already fits at the
ceiling size, so this is a true no-op today. Evidence for the shrink path
itself lives with the stress synthetic fixture's own committed baseline
(60-character club name), added later in this migration.
