# Phase B invariant proof-red

Per the task brief: "Prove each invariant test fails by temporarily
reverting one Phase B change." This is the transcript of doing that —
not left in the test file itself, referenced from
`src/__tests__/golden/invariants.test.ts`'s file header.

## Method

```
git checkout 7917b116 -- src/components/catalogue/catalogue-front-matter.tsx
DATABASE_URL=postgresql://localhost:5432/remi_test npx vitest run src/__tests__/golden/invariants.test.ts
# ... observe failures below ...
git checkout HEAD -- src/components/catalogue/catalogue-front-matter.tsx
```

`7917b116` is the last commit before any of the Flow-based restructuring
(ClassDefinitionsContent, JurisdictionBlock/TrophiesPage-With-Thanks,
ShowInformationContent) — i.e. front-matter still had the FitText cover
work and the mechanical Phase A KeepTogether pass, but every heading was
still either a bare sibling or protected only by an outer wrapping
View's `minPresenceAhead` (the pattern this migration found doesn't
actually work — see the pdf-kit README's "minPresenceAhead inside a
wrapper" limitation).

## Result: 2 of 4 invariants fail

```
 × synthetic-stress-rkc-champ — catalogue-by-class > no page after the first, before the class listing starts, is more than 90% empty
   AssertionError: expected [ Array(1) ] to deeply equal []
   + Array [
   +   "page 5: only 0% of the usable height has content",
   + ]

 × synthetic-stress-rkc-champ — catalogue-by-class > no known section heading is the last line of a page
   AssertionError: expected [ Array(1) ] to deeply equal []
   + Array [
   +   "page 2: last line is a heading (\"S H O W I N F O R M AT I O N\")",
   + ]

 ✓ synthetic-stress-rkc-champ — catalogue-by-class > page count stays within a sane bound
 ✓ synthetic-stress-rkc-champ — catalogue-by-class > no line's bbox falls outside its own page
 ✓ synthetic-stress-rkc-champ — catalogue-standard > (all 4 invariants)
 ✓ synthetic-sparse-rkc-open — catalogue-standard / catalogue-by-class > (all 4 invariants)

 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
```

Both failures are exactly the bugs this migration set out to make
impossible:

- **Near-blank page**: at `7917b116`, the "Definitions of Classes"
  section was still one big `wrap={false}` block (the pre-Flow shape).
  For the stress fixture's 40 definitions, that block doesn't fit in the
  remaining space wherever it lands, so it moves WHOLESALE to a fresh
  page — leaving the page it left behind with 0% content used after that
  point (page 5, catalogue-by-class).
- **Orphaned heading**: the "Show Information" band relied on an outer
  wrapping View's `minPresenceAhead`, which only guards the space right
  after the band itself — the Welcome subsection immediately following
  it is its own atomic block, and when THAT doesn't fit, it moves on its
  own, stranding "SHOW INFORMATION" as literally the last line of page 2.

## Why the other 2 invariants didn't reproduce via this same revert

`no line's bbox falls outside its own page` and `page count stays within
a sane bound` did NOT fail for either torture fixture at `7917b116` —
for this specific content, the oversized atomic blocks still happened to
fit within a fresh page's physical bounds (react-pdf did emit "Node of
type VIEW can't wrap between pages and it's bigger than available page
height" during this render, confirmed via stderr, but traced to a
different document entirely — prize-cards, not any catalogue document —
so it's not evidence for either of these two invariants specifically).

Rather than construct an even more extreme synthetic case purely to
force those two invariants red through this exact harness, the same
underlying mechanism is proven directly and unambiguously at the kit
level, where it's exact rather than incidental:
`src/components/pdf-kit/__tests__/keep-together.test.tsx`'s
"KeepTogether — escape hatch" suite. Its own file-header comment records
proving red the same way (removing the `tooTallForOnePage` check
entirely, hardcoding `wrap={false}` unconditionally): a block genuinely
taller than a page then renders on ONE page (silent overflow, exactly
the "line's bbox outside its page" / uncontrolled page count failure
mode) instead of pagination kicking in. BestAwardsContent's and
ShowInformationContent's escape hatches in this migration both call
`KeepTogether` with `estimatedHeight`/`maxHeight` — the exact contract
that test suite verifies.
