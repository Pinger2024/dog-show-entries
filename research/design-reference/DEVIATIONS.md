# Deliberate deviations from the design source

The `*.original.jsx` files are the AUTHORITATIVE design spec — every px, hex,
weight, tracking, radius, shadow and structural order in them is the contract.
The implementation must match them EXACTLY except for the items below, which
are agreed product decisions. An audit must NOT flag these:

1. ~~Touch targets~~ REVOKED (Michael 2026-07-09): buttons follow the design
   exactly — sm = 42px, default = 52px. A 44px sm button is a DEFECT.
2. **Data-gated content** — "Est. {year} · {edition} year" eyebrow, judge
   quotes, and the photo drop-slots don't exist in our schema yet and are
   omitted (phase 2/3). The layout must still match the design's no-photo
   ("type-led") variants.
3. **Kept functionality the design doesn't show** — sponsor logo row in the
   hero, RKC-registered badge, live-results banners, sticky action bar,
   reassurance strip, "From the organisers", "Save the date", footer CTA,
   mobile slide-up widget, share-event tracking, results/closed CTA states,
   search + selects + near-me controls on Browse. These stay, styled in the
   theme's language.
4. **Honest copy** — the confirmation "What happens next" rows carry no
   promised running-order date; the cheque trust bullet renders only when
   `acceptsPostalEntries`; no post-checkout catalogue upsell card.
4b. **Confirmation extras (kept functionality)** — a third share button
   (Facebook, with its mobile clipboard fallback + tracking) alongside the
   design's WhatsApp/Copy pair; an order-reference/recap card retained but
   placed BELOW the design's hero → what-happens-next → ring-mates flow.
   Enter flow: the sticky CTA reads "Update" (not "Review entry") when
   editing an existing cart entry.
5. **Class rows in Enter** — achievement classes stay selectable with the
   advisory badge (only age/sex/coat-certain ineligibility uses the design's
   locked-row treatment); RKC regulation description text remains under class
   names (existing information, design shows names only).
6. **Payment step** — untouched by design (wrapped `font-sans`, outside the
   theme).
7. **QR share button** — omitted (no QR dependency in phase 1).
8. **Step count** — the Enter progress bar derives from the real wizard
   (up to 6 steps), not the mock's fixed "Step 2 of 4".

9. **Show-page content beyond the mock (kept/data-driven)** — judge cards
   keep the JEP-level/RKC-number badges and breed list (real credibility
   data); entry-fee rows keep their explanatory sub-lines and the
   card-processing-fee disclosure; "The day" omits the Best in Show cell (no
   schema field); "Getting there" renders real directions/what3words/map
   instead of the mock's placeholder travel bullets; the desktop "At the
   show" card is strictly real-data (catering/weather only — no invented
   Unbenched/Vet/Parking flags); the desktop rail reuses ShareKitCard in
   place of the QR card; the global site Footer (nav links/copyright)
   remains below the design's page-footer wordmark block.

9c. **Crest-side line + variety row** — the hero/banner text beside the club
   crest shows `venue.name` (no structured town/area columns exist); the
   desktop classification card omits the design's trailing "variety"
   disclaimer row (no schema field carries that copy).
10. **Accepted rendering equivalences (audit-verified, zero visual delta)** —
   `Wordmark` takes color via `className` override merged through
   tailwind-merge (idiomatic equivalent of the design's `color` prop);
   `SecLabel`'s 3px dash uses `rounded-full` (clamps identically to the
   design's radius 2); `Pulse`'s inner dot is normal-flow rather than
   `absolute inset-0` (identical geometry). Audits should not re-flag these.

Everything NOT listed here that differs from the `.original.jsx` values is a
defect to be fixed. (The hero's share icon-button, previously in the top row,
is NOT a deviation — it gets removed; sharing lives in the sticky bar and the
Spread-the-word section.)
