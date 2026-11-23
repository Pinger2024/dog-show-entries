# Pre-paid Parking Pass — design brief (2026-08-04)

Requested by Mandy tonight, scope confirmed by her answers:
- Pass shows **name + show details including venue**. NO car registration capture.
- **No stock limits** (per-order cap via existing `maxPerOrder` is enough).
- **No buy-after-entry flow** — it's an optional extra clubs add for future shows; bought at
  entry checkout like every other sundry. Nothing retrofits to already-entered exhibitors.
- Gate check: **both** printed and shown on phone → black-on-white, heavy border, big text.

User experience:
1. Secretary adds "Pre-paid Parking Pass" to a show's Sundry Items (new preset; any sundry whose
   name matches the parking pattern gets pass behaviour).
2. Exhibitor buys it during entry checkout (existing flow, zero change).
3. Pass is downloadable from their account (entries page) immediately after purchase.
4. One week before the show (and for late buyers, on the next hourly tick), they get an email
   with the pass PDF attached — automatic, idempotent, never double-sent.

## Build plan

### 1. `src/lib/parking-utils.ts` (new)
Mirror `src/lib/catalogue-utils.ts` style: `PARKING_NAME_PATTERN` matching e.g. "Pre-paid
Parking Pass", "Parking", "Car Pass" (word-boundary match on `parking` or `car pass`,
case-insensitive) + `isParkingSundry(name: string): boolean`.

### 2. Preset
Add to `COMMON_SUNDRY_PRESETS` in
`src/app/(secretary)/secretary/shows/[id]/_components/sundry-item-manager.tsx`:
name "Pre-paid Parking Pass", description like "Car parking at the venue. Your pass is emailed
a week before the show." Match the existing preset object shape exactly (look at how current
presets set price/maxPerOrder; sensible default price £3.00, maxPerOrder 1 — but copy the
shape, don't invent fields).

### 3. Schema — `orders.parkingPassEmailedAt`
Nullable timestamptz on `src/server/db/schema/orders.ts`, comment mirroring
`catalogueReadyEmailedAt` ("Stamped by the cron the first time…"). Drizzle is push-mode — no
migration files. You may push schema ONLY to the local test DB (whatever
`src/__tests__` setup already does — check helpers/TESTING_MAP.md first; do NOT run db:push
against any remote DB, and never touch `.env`).

### 4. Pass PDF — `src/components/parking-pass/parking-pass-pdf.tsx` (new)
`@react-pdf/renderer`, following the font-registration/embedding conventions used by
`src/server/services/pdf-generation.ts` and the catalogue components (NO unembedded base-14
fonts — the route pipes through `stripUnembeddedBase14Fonts`). A4 portrait, one page per pass
(quantity 2 → 2 pages, "Pass 1 of 2" / "Pass 2 of 2"). Content per page:
- Big "PARKING PASS" heading (serif, consistent with brand), heavy black border.
- Show name + club (organisation) name, show date(s), venue name + full address.
- "Issued to: {exhibitor name}" and "Admits one vehicle".
- Short order reference (first 8 chars of order id, uppercased) + "Remi · remishowmanager.co.uk" footer.
Black on white only — must photocopy/print cleanly and read at arm's length on a phone.

### 5. Download route — `src/app/api/parking-pass/[orderId]/route.ts` (new)
Follow the catalogue route (`src/app/api/catalogue/[showId]/[format]/route.ts`) and
judge-contract route auth patterns: `auth()` session required; permit the order's exhibitor
(`order.exhibitorId === session.user.id`), platform admin, or a member of the show's
organisation (same membership lookup as judge-contract route). Load order → show → venue →
organisation → exhibitor → parking sundry lines (`order_sundry_items` joined `sundry_items`
where `isParkingSundry(name)`; quantity = sum). 404 if the order has no parking sundry.
`renderToBuffer` → `stripUnembeddedBase14Fonts` → `makePdfResponse(buffer, filename)`.
No show-day gating — available immediately after purchase.

### 6. Email — `sendParkingPassEmail(orderId)` in `src/server/services/email.ts`
Follow the 9 existing senders exactly (BRAND, `emailHeader()`/`emailFooter()`/`btn()`, `FROM`,
`APP_URL`). Subject: `Your parking pass — {show name}`. Short plain-English body (audience is
60+ and not tech-confident): the pass is attached, print it or show it on your phone at the
gate; also a button linking where they can download it any time (mirror how the
catalogue-ready email builds its link — reuse that destination pattern, do not invent a new
page). Attach the PDF via Resend's attachments (filename + content buffer) — generate with the
same renderToBuffer path the route uses (extract a shared `generateParkingPassPdf(orderId)`
helper so route and email cannot drift — single source, like the catalogue's two-render-paths
lesson).

### 7. Cron — week-before branch in `src/app/api/cron/route.ts`
Beside the catalogue-ready branch, same shape: gated on the existing `isAfter830London`
wall-clock check; select paid orders where `parkingPassEmailedAt IS NULL`, the order has a
sundry line matching the parking pattern, and the show's `startDate` is between today and
today + 7 days (inclusive; late buyers inside the window get it on the next tick; nothing
sends once `startDate` has passed... except: send on the show morning too — window is
`today <= startDate <= today + 7 days`). Per-order try/catch like the existing branch (one
failure must not kill the tick), stamp `parkingPassEmailedAt` after successful send.

### 8. Exhibitor UI — entries page
`src/app/(dashboard)/entries/page.tsx` (and check `entries/[id]/page.tsx` for whether it
belongs there too — probably not; keep it on the show group). For each show group, if the
exhibitor has a paid order for that show containing parking sundries, render a calm "Extras"
row: car icon (Lucide), "Parking pass" (+ "× 2" if qty > 1), and a Download button
(`min-h-[2.75rem]` touch target) linking to `/api/parking-pass/{orderId}`. Data via a new
small tRPC query (e.g. `orders.myParkingPasses`) scoped to the session user — do NOT widen a
public query; no organisation columns anywhere near this. Mobile first: stacks at 375px, no
new horizontal overflow (respect the guards in `mobile-overflow.test.ts` — no `-mx-`, no
`grid-cols-3`+ without breakpoint, `min-w-0` on flex-1).

### 9. Tests — prove each fails first
Read `TESTING_MAP.md` and `src/__tests__/helpers/` first; use the factories. ONE vitest run at
a time (singleFork). Mock Resend, never the DB. Required:
- Unit: `parking-utils` matcher (positive/negative names, "Sparking Wine" must NOT match).
- Integration: cron branch — paid order + parking sundry + show at T+6d sends once and stamps
  `parkingPassEmailedAt`; second tick does not resend; order without parking sundry never
  sends; show at T+10d doesn't send yet; unpaid order never sends.
- Route: owner gets 200 with `%PDF` magic bytes and one page per quantity; a different
  exhibitor gets 403/404 (match existing route conventions); unauthenticated gets the
  pattern's 401/redirect.
- UI/journey: entries page renders the Extras row with a parking purchase, and no Extras row
  without one.
For each test, demonstrate the failing state first (write test before the code, or break the
code and show red) and note it in your report — an untested-failure test doesn't count.

### Conventions & guard-rails
- Always "RKC", never "KC". shadcn/ui + Tailwind, `font-serif` headings, Lucide icons.
- Conventional commits on `feat/parking-pass`, ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and the session line if configured.
- Commit in logical chunks (schema, lib+preset, pdf+route, email+cron, UI, tests can be
  interleaved as appropriate).
- Never touch `.env`, never run anything against remote databases, never deploy, never send a
  real email (Resend must be mocked in tests; do not execute ad-hoc scripts that import the
  email service against a real key).
- If you hit a genuine ambiguity, choose the option most consistent with existing code and
  record it in your final report rather than stopping.
