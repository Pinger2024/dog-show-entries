# Add extras to an existing entry — design (2026-09-21)

**Trigger:** Mandy, 21 Sept. An exhibitor entered Midland "Regional Show" weeks ago and phoned to pay Class Sponsorship (£15, a sundry on that show). Today sundries are only buyable at checkout (`orders.checkout`, `entries.min(1)`); no add-after-entry path for exhibitor or secretary.

**Mandy's decisions (18:52):** build it; it stops when entries close.

## Journey (exhibitor, 60+, on a phone)

1. Dashboard → my entry → **"Add extras"** button (next to Edit Classes / Withdraw). Shown only when: entry `confirmed`, entry has an `orderId`, the entry window is open (one owner, below), and the show has ≥1 enabled sundry.
2. `/shows/[id]/entries/[entryId]/extras` — list of the show's enabled sundries. Each shows name, description, price. Items already on the order are shown as "Already added ×N" (checkbox items with `maxPerOrder=1` are ticked+disabled; quantity items show remaining allowance). Live total from the server (`orders.previewExtras`), never summed client-side. Booking fee line shown separately, as checkout does.
3. "Pay £X" → Stripe `PaymentForm` (existing component) → success → back to the entry page: "Extras added — you'll get an email receipt." The entry page shows an **Extras** section (order's sundries).
4. Email: an "Extras added" receipt to the exhibitor (new small template, same sender/reply-to conventions as `sendEntryConfirmationEmail`).
5. Failure modes: window closed → button hidden and server refuses ("Entries for this show have closed"); entry has no order (legacy) → no button, and the page copy says to contact the secretary; over cap → server violation surfaced as plain English.

## Data / ownership

- **Extras live on the entry's existing order.** Insert `order_sundry_items {orderId, sundryItemId, quantity, unitPrice}`, bump `orders.totalAmount += subtotal` and `orders.platformFeePence += fee` — the same pattern the class top-up uses (`webhooks/stripe/route.ts` adjustment branch). Everything downstream (payment report grouped by order, `statusFromEntries`, show-metrics, sundry report, receipt) keeps working with no second order.
  - ⚠️ CHECK: the existing class-change top-up bumps `orders.totalAmount` but does it bump `orders.platformFeePence`? If not, that is a reconciliation bug in the same owner — fix it there too and add it to the register.
- **Pricing owner:** `src/server/services/order-extras-pricing.ts` → `priceOrderExtras(db, { orderId, userId, items })` (read-only, mirrors `entry-change-pricing.ts`): loads order+show+existing sundries, checks ownership (`order.exhibitorId === userId`), window open, order status `paid` (or `pending_payment` with a succeeded payment? — keep to `paid`), runs `validateSundrySelection` with `alreadyOnOrder`, returns `{ order, lines: [{sundryItemId, name, quantity, unitPrice}], subtotalPence, platformFeePence: calculatePlatformFee(subtotal), grossPence, requiresPayment }`. Uses `calculatePlatformFee` from `lib/fee-calc.ts` — booking fee on the difference, as class top-ups do.
- **Cap:** `validateSundrySelection` gains optional `alreadyOnOrder: Map<sundryItemId, quantity>`; `over_max` is judged on existing + requested. Existing callers unchanged.
- **Window owner:** NEW `entryWindowOpen(show: {status, entryCloseDate}, now = new Date()): boolean` in `src/lib/show-status.ts` (next to `effectiveShowStatus`). Rule = `status === 'entries_open' && (!entryCloseDate || closeDate >= now)`. Replace the inline copies in `orders.checkout`, `entries.create`, `priceEntryClassChange`, and use it for the Edit Classes / Add extras buttons on the entry page. `secretary.createManualEntry` keeps its deliberately broader set (documented) — do NOT change it. Guard test: fails if `status !== 'entries_open'`/`status === 'entries_open'` comparisons appear outside `show-status.ts`, `secretary.ts` (manual entry) and tests.
- **Mutations (`orders` router):**
  - `orders.previewExtras({ orderId, items })` → pricing only.
  - `orders.addExtras({ orderId, items })` →
    - gross 0 (all free items): apply immediately (insert rows, bump order), audit, email; return `{ requiresPayment: false }`.
    - else: create platform-mode PaymentIntent (`createPaymentIntent`) with metadata `{ type: 'extras', orderId, showId, exhibitorId, entryId (the entry the user came from, for the audit row), platformFeePence, subtotalPence, pendingExtras: 'sundryItemId:qty:unitPrice,…' }`; guard the 500-char metadata limit as `entries.update` does; insert `payments { orderId, entryId, stripePaymentId, amount: gross, status: 'pending', type: 'adjustment' }`; return `{ requiresPayment: true, clientSecret }`. NO rows applied until the webhook.
- **Webhook:** new branch `metadata.type === 'extras'` — MUST be checked BEFORE the generic `orderId` branch (which would otherwise "confirm" the order's entries again). Idempotent via the payment row's status (apply only if not already `succeeded`, same guard as the adjustment branch). Applies the rows, bumps the order, marks payment succeeded, `captureStripeFeeDetails`, writes `entry_audit_log` action `'extras_added'` `{ items, subtotalPence, platformFeePence, via: 'extras_payment' }`, sends the extras receipt email.
- **Read path:** `entries.getById` gains `order: { with: { orderSundryItems: { with: { sundryItem } } } }` so the entry page can show Extras. Public-org columns rule: never `organisation: true` — not needed here.

## Explicitly NOT in v1 (say so in the report)

- Secretary-recorded cash/BACS extras. Reason: show-metrics keys "offline" by `orders.stripePaymentIntentId IS NULL`, per ORDER; adding offline extras to a card-paid order would count club cash as Stripe revenue in settlement. Needs offline-ness keyed per PAYMENT first. Mandy's phone caller can pay by card themselves.
- Removing/refunding extras (secretary refund flow already exists for money; rows stay).
- Buying anything with no entry at all (separate scoped item: advert/sponsor purchase, 14 Aug).

## Tests (write first, prove failing)

- Journey: confirmed paid entry + show with Catalogue(£5, max 1), Sponsorship(£15, unlimited), Donation(£1) → `previewExtras` matches `addExtras` → fake webhook `payment_intent.succeeded` with the metadata → rows exist, `orders.totalAmount`/`platformFeePence` bumped by exactly subtotal / `calculatePlatformFee(subtotal)`, payment succeeded, audit row, email called once. Replay the event → nothing doubles.
- Cap: catalogue already on the order → requesting another → `over_max`.
- Window: `entryCloseDate` yesterday with stale `status='entries_open'` → refused (this is the gap the class-change path has today; cover class-change too).
- Wrong owner → FORBIDDEN. Order without entries / entry without order → clear error.
- Free-only extras → applied immediately, no Stripe call.
- Existing suites that must stay green: `entry-change-*`, `sundry-*`, `stripe-webhook.test.ts`, `show-metrics`/settlement tests, `fee-path-parity`.
- Guard tests: window owner; "no second copy of extras pricing" (grep for `calculatePlatformFee(` outside the owning modules).

## UI rules
- Mobile first (400px), big tap targets, one screen, no jargon. "Extras" not "sundries" in exhibitor copy. Show what they already have so nobody buys a second catalogue by accident.
- Match the enter page's sundry list styling (`enter/page.tsx` ~line 2077) — reuse its item row if it can be lifted into a component without touching checkout behaviour.
