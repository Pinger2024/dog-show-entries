# Mandy's live demo feedback — 2026-06-12 (feat/front-door-reimagined)

Captured during her real-time test of a 22-class GSD Championship show + Junior Handling.

| # | Item | Area | Status |
|---|------|------|--------|
| A | Can't select two classifications at once (Champ classes + Junior Handling) — template picker is single-select | Class setup (BulkClassCreator) | ✅ fixed (755f8ab) — "Also include Junior Handling?" add-ons |
| B | Class setup pre-ticked all 226 breeds → 4,972 classes; single-breed club shouldn't see the breed list at all | Class setup | ✅ fixed (0a66181) |
| C | JH per-class fee not carrying through when JH class added separately | Fees (money) | ✅ fixed + tested (6be83ff) — fee flows to show.juniorHandlerFee |
| D | Junior Handling judge not showing on the schedule | Judge + schedule | ✅ fixed (6be83ff) — JH judge shown / "TBC" |
| E | Entry closing date should be a calendar **picker** | Fees & Setup form | ✅ fixed (1924b13) — calendar + time dropdown |

All five resolved + verified on demo. Bonus from the Big Five: 3-question show creation (adea10e), safe status badge + app-wide serif (adea10e/0a66181).

Still on the Big Five (not from Mandy's testing): one readiness system (#3, risky), seven-door nav (#4), broader plain-English pass (#5).

Theme: Junior Handling is a second-class citizen across class selection, fees, and judges. Worth a holistic pass, not just point fixes.
