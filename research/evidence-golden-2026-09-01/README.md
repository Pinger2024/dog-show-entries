# Golden-document test — proof it fails (2026-09-01)

This folder is the evidence that `src/__tests__/golden/documents.golden.test.ts`
actually catches a layout regression, per the "prove the test fails" rule.

## What was changed

One temporary, one-line edit to
`src/components/catalogue/catalogue-front-matter.tsx`: the `showInfoStyles.sectionTitle`
style's `fontSize` was bumped from `9` to `22` (the green-banded subsection
heading used on the catalogue's "show info" page — welcome note, officers,
guarantors, first aiders, custom statements). The edit was reverted
immediately after capturing `proof-red.log`; `git diff --stat` on that file
is clean (see the final commit — this folder contains only logs/diffs, no
source change).

## proof-red.log

`DATABASE_URL=postgresql://localhost:5432/remi_test npm run golden`, run
with the font-size change in place. **3 of 17 tests failed**, and — this is
the important part — they named the exact documents and exact pages:

- `catalogue-standard` — pages 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 19 changed (the front-matter page appears once near the front, and
  the whole booklet reflows because `padPdfToMultiple` re-pads for the
  standard/by-class formats)
- `catalogue-by-class` — page 3 changed
- `catalogue-marked` — page 2 changed

The other 14 — `catalogue-judging`, `catalogue-absentees`, `schedule`,
`judges-book`, `prize-cards`, both `ring-numbers` formats, `ring-board`, all
four `report-*` PDFs, and `invoice` — correctly stayed green, because none
of them render `catalogue-front-matter.tsx`'s show-info page. The test
doesn't just detect *a* regression, it correctly scopes which documents it
actually touched.

## sample-diffs/

Copies of three of the `golden-output/.../diff.md` files the failing run
wrote (that directory is gitignored and regenerated on every failing run,
so these are pulled out here as a permanent record), plus one rendered page
PNG (`catalogue-by-class-page-03.png`) showing the actual visual break: at
the larger font size, the uppercase heading text ("WELCOME", "PRACTICAL
INFORMATION", "REGULATIONS") wraps letter-by-letter instead of word-by-word
— exactly the kind of layout break this test exists to catch, and exactly
why the diff is reported as dozens of single-letter "words" removed/added
rather than a clean "heading moved" line.

## proof-green.log

The same command, same fixture, immediately after reverting the font-size
change. **17/17 passed**, confirming the revert is clean and the baseline
is otherwise untouched.

## Runtime

Both runs: ~7-9s wall clock for the whole `npm run golden` command
(single synthetic fixture, 17 document renders). See the main report for
the caveat about scaling to multiple real fixtures.
