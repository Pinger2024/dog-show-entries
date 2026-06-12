# Mandy's live demo feedback — 2026-06-12 (feat/front-door-reimagined)

Captured during her real-time test of a 22-class GSD Championship show + Junior Handling.

| # | Item | Area | Status |
|---|------|------|--------|
| A | Can't select two classifications at once (Champ classes + Junior Handling) — template picker is single-select | Class setup (BulkClassCreator) | open |
| B | Class setup pre-ticked all 226 breeds → 4,972 classes; single-breed club shouldn't see the breed list at all | Class setup | ✅ fixed (commit 0a66181) |
| C | JH per-class fee not carrying through when JH class added separately | Fees (money — careful) | investigating; clarifying Q sent |
| D | Junior Handling judge not showing on the schedule (JUNIOR HANDLING section has no judge name) | Judge assignment + schedule render | open |
| E | Entry closing date should be a calendar **picker**, not a type-the-date field | Fees & Setup form | open (reuse Calendar) |

Theme: Junior Handling is a second-class citizen across class selection, fees, and judges. Worth a holistic pass, not just point fixes.
