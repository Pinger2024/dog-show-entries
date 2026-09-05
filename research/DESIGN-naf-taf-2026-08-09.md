# NAF / TAF / CNAF registration flags — design brief (2026-08-09)

Requested by Mandy: an exhibitor has just bought a dog and needs NAF/TAF on their entry.

## Domain (RKC, verified — royalkennelclub.com June 2021 guidance)

- **NAF** = Name Applied For — registration applied for, not confirmed by the entry closing
  date. Dog entered under the first-choice name, with `NAF` after it.
- **TAF** = Transfer Applied For — ownership transfer applied for, not yet confirmed.
- **CNAF** = Change of Name Applied For.
- **Any combination may apply** — the RKC explicitly says "write NAF or TAF or both after it".
- Assessed **as at the entry closing date**.

## Mandy's decision — PER ENTRY, NOT PER DOG

She overruled the dog-profile idea for a good reason: exhibitors will never go back and untick
it, so it would haunt catalogues for years. It is a per-show fact, which also matches the RKC's
"as at the closing date" wording.

⚠️ `dogs.registrationStatus` (`text('registration_status')`, comment
`// null=registered, 'naf', 'taf', 'cnaf'`) is a DEAD, NEVER-WIRED stub, NULL on all 205 prod
dogs. **Do NOT build on it.** Leave the column in place (dropping is riskier than it's worth)
but REPLACE its comment with a pointer saying the live implementation is per-entry on
`entries`, so the next reader doesn't repeat the mistake.

## Build

### 1. Schema — three booleans on `entries`
`src/server/db/schema/entries.ts`. Copy the shape of the existing `withholdFromPublication`
(line ~46) / `catalogueRequested` (line ~42) precedent exactly:
```ts
naf: boolean('naf').notNull().default(false),
taf: boolean('taf').notNull().default(false),
cnaf: boolean('cnaf').notNull().default(false),
```
Three booleans rather than an enum/array: matches precedent, allows any combination, and
avoids the pgEnum re-export trap that breaks `db:push`.

Add an idempotent startup migration in `src/server/db/startup-migrations.ts` (append at the
end, follow the existing style and comment format):
```sql
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS naf BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS taf BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cnaf BOOLEAN NOT NULL DEFAULT FALSE;
```

### 2. ONE shared formatting helper — `src/lib/registration-flags.ts` (new)
Every print site must go through this; no site may hand-roll the suffix.
```ts
export type RegistrationFlags = { naf?: boolean | null; taf?: boolean | null; cnaf?: boolean | null };
/** " NAF TAF" — leading space included, or '' when no flags. Order: NAF, TAF, CNAF. */
export function registrationFlagSuffix(flags: RegistrationFlags | null | undefined): string;
/** appendRegistrationFlags("CH FOO", {naf:true}) === "CH FOO NAF" */
export function appendRegistrationFlags(name: string, flags: RegistrationFlags | null | undefined): string;
```
Fixed order NAF → TAF → CNAF. Any combination permitted (do not block NAF+CNAF; Mandy hasn't
been asked whether that's nonsense, so allow it and we can tighten later).
`appendRegistrationFlags` must be null/empty-safe (empty or null name in → unchanged out).

### 3. Entry journey (exhibitor)
- `src/app/(shows)/shows/[id]/enter/use-entry-cart.ts` — add `naf?: boolean; taf?: boolean;
  cnaf?: boolean` to the `CartEntry` interface (~lines 6-20) and whatever reducer action is
  needed to toggle them per cart entry (follow the existing action style).
- `src/app/(shows)/shows/[id]/enter/page.tsx` — the cart-review card per entry (~1953-2016).
  **Progressive disclosure, this is the 60+ audience:** default hidden behind a small plain-
  English toggle/link on each dog's card, something like "Waiting on RKC paperwork?" which
  reveals three checkboxes labelled in full — "Name applied for (NAF)", "Transfer applied for
  (TAF)", "Change of name applied for (CNAF)". Touch targets ≥44px (`min-h-[2.75rem]`), stacks
  at 375px, no new horizontal overflow. Once any flag is set, show it as a small summary on the
  card so it isn't invisible after collapsing.
- `handleProceedToPayment` (~857-885) maps cart→payload **field by field, no spread** — add the
  three fields explicitly or they are silently dropped.
- `src/server/trpc/routers/orders.ts` — `cartEntrySchema` (~50-59) gains the three optional
  booleans; the `.insert(entries).values({...})` (~807-821) writes them from the per-entry input
  (note: `catalogueRequested`/`withholdFromPublication` there come from the TOP-LEVEL input —
  these are per-entry, read them off the entry item).
- `src/server/trpc/routers/entries.ts` `create` (~50-60): no live callers but keep consistent.

### 4. Secretary paths
- `secretary.createManualEntry` (`secretary.ts` ~3341-3606): input schema ~3342-3354 and the
  entries insert ~3529-3541. Add the flags, and expose them in `AddEntryDialog`
  (`secretary/shows/[id]/entries/page.tsx` ~657-1165) in the same progressive-disclosure style.
- **New mutation for fixing after the fact** (people ring up after entering) —
  `secretary.updateEntryRegistrationFlags({ entryId, naf, taf, cnaf })`. Use the same show-access
  guard the neighbouring secretary entry mutations use. Surface it on the entries page from the
  entry row. `EditDogDialog` (~510-655) is opened from an entry row but writes DOG-level fields
  — if you put the control there, label that section unmistakably as applying to **this show
  only**, since everything else in that dialog is permanent. A separate small dialog is
  acceptable and may be clearer; your call, but it must be obvious which is which.

### 5. Where it PRINTS (Mandy's scope: catalogue + results paperwork)
- **Catalogue — the two choke points.** `src/app/api/catalogue/[showId]/[format]/route.ts`
  (~232-236) and `src/server/services/pdf-generation.ts` (~203-207) each build
  `dogName: entry.dog ? (useKCFormat ? formatDogNameForCatalogue(entry.dog) : formatDogName(entry.dog)) : null`.
  Wrap with `appendRegistrationFlags(..., entry)`. Both sites must be changed identically —
  this is the documented "two render paths must agree" trap. Downstream components
  (`catalogue-ringside`, `by-breed`, `by-class`, `marked`, `absentees`, `judging`) consume
  `dogName` as an opaque string and need NO changes; confirm that by reading them, don't assume.
  Note `catalogue-ringside.tsx` applies `uppercaseName()` on top (~line 335) — check the flags
  still read correctly through that (uppercase NAF is fine, but verify nothing mangles it).
- **Secretary catalogue preview** — `secretary.getCatalogueData` (`secretary.ts` ~800-846) plus
  `secretary/shows/[id]/catalogue/page.tsx` (~213, 239) currently print bare
  `entry.dog?.registeredName`, bypassing `formatDogName` entirely. Make it consistent with the
  printed catalogue (titles + flags), so what she previews matches what prints.
- **Reports / exports that list dog names** — `src/lib/report-rows.ts` builders
  (`buildCatalogueOrderRows` ~32-57, `buildAbsenteeRow` ~119-137,
  `buildFinancialStatementRow` ~158-171): extend the input shapes to carry the entry flags and
  append via the helper. Consumers: `src/app/api/reports/[showId]/[type]/route.ts`,
  `src/app/api/absentee-report/[showId]/route.ts`,
  `secretary/shows/[id]/documents/page.tsx` (`exportEntryReportCsv` ~273-289).
  Also the entries-page CSV (`secretary/shows/[id]/entries/page.tsx` `exportCsv` ~163-201,
  dog name at ~179) — and note that file imports `formatDogName` but never calls it (dead
  import); make the CSV and the on-screen table (~337, 420) consistent with everything else.

### 6. Explicitly OUT of scope — do not touch, but confirm each in your report
- **Judge's Book** — never prints dog names (writes against catalogue numbers only). The API's
  `dogName` field is dead. Leave it.
- **Prize cards / overprint / ring board / ring numbers / award board** — no dog names at all.
- **RKC SH01** — aggregate breed counts, no dog names.
- **SV/WUSV regional results export** (`src/lib/sv-results*.ts`) — non-RKC ruleset; NAF/TAF is
  an RKC concept.
- **Public + secretary results WEB pages** and `steward.getLiveResults` — deliberately excluded.
  Rationale to keep: the catalogue is a point-in-time document (correctly frozen with NAF), but
  the results page is a living page that would show a stale NAF forever once the paperwork
  clears. Also `achievements` has no `entryId` (only dogId+showId), so flagging award winners
  would need a join that doesn't exist. Mandy will be told this and can ask for it.

### 7. Tests — prove each fails first
Read `TESTING_MAP.md` and `src/__tests__/helpers/` first. ONE vitest run at a time
(singleFork). Mock external services, never the DB.
- `makeEntry` (`factories.ts` ~204-228) takes an **explicit typed opts object and an explicit
  values block with no spread** — add the three flags to BOTH or they'll be silently ignored.
- Unit (`src/__tests__/` alongside `utils.test.ts` style): `registrationFlagSuffix` /
  `appendRegistrationFlags` — none, each single flag, all combinations, correct order,
  null-safe, doesn't mangle an empty name.
- Integration, catalogue: an entry with naf+taf renders `"<NAME> NAF TAF"` — assert against
  **both** render paths (route.ts and pdf-generation.ts), since agreeing is the whole point.
  A no-flag entry must render exactly as before (no trailing space).
- Integration, checkout: flags set in the cart payload persist onto the `entries` rows;
  unset defaults to false.
- Integration, secretary: `updateEntryRegistrationFlags` sets/clears flags and is refused for a
  user with no access to that show.
- Report rows: an absentee/catalogue-order row for a flagged entry carries the suffix.
For each test, demonstrate the failing state first and record how in your report.

### Conventions & guard-rails
- Always "RKC", never "KC". shadcn/ui + Tailwind, `font-serif` headings, Lucide icons.
- Conventional commits on `feat/naf-taf`, each ending with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Never touch `.env`, never connect to remote/prod/demo databases, never deploy, never send
  real email. Schema pushes only to the LOCAL test DB.
- If a genuine ambiguity appears, choose the option most consistent with existing code and
  record it in your final report rather than stopping.
