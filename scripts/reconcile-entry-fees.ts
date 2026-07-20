/**
 * Fee reconciliation guard — catches silently-mispriced entries in live data.
 *
 * The Special Award Class overcharge (Mandy 2026-07-19) sat in the database for
 * days because nothing ever re-checked stored fees. This script is that missing
 * check. It is READ-ONLY (SELECT only) and deliberately does NOT re-run the fee
 * engine — it validates the *internal consistency* of the stored rows, so it
 * can't share a bug with the engine that wrote them:
 *
 *   A. Every Special Award Class row must be charged that class's OWN fee
 *      (show_classes.entry_fee) — never the first/subsequent tier. This is the
 *      exact bug; it would have flagged Kathryn / Denise / Miss G on day one.
 *   B. Every entry's per-class breakdown must sum to entries.total_fee, so the
 *      financial "Entries by Class" report reconciles with order revenue.
 *
 * Usage (defaults to $DATABASE_URL):
 *   npx tsx scripts/reconcile-entry-fees.ts
 *   DATABASE_URL=<prod-connection> npx tsx scripts/reconcile-entry-fees.ts
 *
 * Exit code 0 = clean, 1 = discrepancies found (safe to wire into CI/cron).
 * Point it at prod read-only any time you want reassurance the books are sound.
 */
import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }
  const sql = postgres(url);
  let problems = 0;

  try {
    // ── Check A — Special Award Classes must be charged their own fee ────────
    const specialMispriced = await sql`
      SELECT s.name AS show, u.name AS exhibitor, cd.name AS class,
             sc.entry_fee AS should_be, ec.fee AS charged, e.id AS entry_id
      FROM entry_classes ec
      JOIN show_classes sc      ON sc.id = ec.show_class_id
      JOIN class_definitions cd ON cd.id = sc.class_definition_id
      JOIN entries e            ON e.id = ec.entry_id
      JOIN shows s              ON s.id = e.show_id
      JOIN users u             ON u.id = e.exhibitor_id
      WHERE cd.type = 'special'
        AND e.deleted_at IS NULL
        AND ec.fee IS DISTINCT FROM sc.entry_fee
      ORDER BY s.name, u.name
    `;

    console.log('── A. Special Award Class pricing ──');
    if (specialMispriced.length === 0) {
      console.log('   ✓ every special class charged its own fee\n');
    } else {
      problems += specialMispriced.length;
      console.log(`   ✗ ${specialMispriced.length} special-class row(s) mispriced:`);
      for (const r of specialMispriced) {
        console.log(
          `     • ${r.show} — ${r.exhibitor} — "${r.class}": charged ${money(r.charged)}, should be ${money(r.should_be)} (entry ${r.entry_id})`,
        );
      }
      console.log('');
    }

    // ── Check B — per-class breakdown must reconcile to the entry total ──────
    // INNER JOIN on entry_classes so NFC entries with zero classes (which
    // legitimately carry a fee but no rows) are excluded, not false-flagged.
    const unreconciled = await sql`
      SELECT e.id AS entry_id, e.total_fee,
             SUM(COALESCE(ec.fee, 0)) AS rows_sum,
             COUNT(ec.id) AS n_rows,
             s.name AS show, u.name AS exhibitor
      FROM entries e
      JOIN entry_classes ec ON ec.entry_id = e.id
      JOIN shows s          ON s.id = e.show_id
      JOIN users u         ON u.id = e.exhibitor_id
      WHERE e.deleted_at IS NULL
      GROUP BY e.id, e.total_fee, s.name, u.name
      HAVING SUM(COALESCE(ec.fee, 0)) <> e.total_fee
      ORDER BY s.name, u.name
    `;

    console.log('── B. Per-class breakdown reconciles to entry total ──');
    if (unreconciled.length === 0) {
      console.log('   ✓ every entry total equals the sum of its class fees\n');
    } else {
      problems += unreconciled.length;
      console.log(`   ✗ ${unreconciled.length} entr(y/ies) whose class fees don't sum to the total:`);
      for (const r of unreconciled) {
        console.log(
          `     • ${r.show} — ${r.exhibitor}: total ${money(r.total_fee)} vs class-sum ${money(r.rows_sum)} across ${r.n_rows} class(es) (entry ${r.entry_id})`,
        );
      }
      console.log('   (legacy entries predating per-class fees may show class-sum 0 — verify before acting)\n');
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    if (problems === 0) {
      console.log('✅ Books reconcile — no fee discrepancies found.');
    } else {
      console.log(`❌ ${problems} discrepanc(y/ies) found — investigate above.`);
    }
    process.exitCode = problems === 0 ? 0 : 1;
  } finally {
    await sql.end();
  }
}

function money(pence: number | null): string {
  if (pence == null) return '£—';
  return `£${(pence / 100).toFixed(2)}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
