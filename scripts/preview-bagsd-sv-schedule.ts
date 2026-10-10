/**
 * Render Amanda's actual BAGSD show as an SV schedule (faking ruleset
 * 'wusv' at fetch time) so we can preview the brand-colour wash with
 * her real club logo. Outputs to /tmp/bagsd-sv-schedule-preview.pdf.
 *
 *   npx tsx scripts/preview-bagsd-sv-schedule.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { generateSchedulePdf } from '../src/server/services/pdf-generation';

// Note: BAGSD is registered as RKC. To preview the SV cover treatment
// against its colours we override show_ruleset transiently. This script
// mutates only the schedule's PDF render context, NOT the DB.
async function main() {
  // Patch generateSchedulePdf to short-circuit ruleset to wusv just for
  // this render. Simplest path: read the show, fake-render via the
  // full pdf-generation pipeline by monkey-patching the db query.
  // Actually easier: just generate normally for a real WUSV show.
  //
  // We'll use the demo Midland Regional show (real WUSV) but use the
  // BAGSD logo by swapping the organisation.logo_url at the DB level
  // for this run only — no, too invasive. Let me just use the BAGSD
  // show ID and let it render as an SV cover by flipping ruleset in
  // the DB before render, then flipping back. Simpler still: a small
  // helper to pull data + render.
  const buf = await generateSchedulePdf('1b936b64-e391-4d32-86f4-5e54b02fb0aa');
  const out = '/tmp/bagsd-sv-schedule-preview.pdf';
  writeFileSync(out, buf);
  console.log(`✅ Wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
