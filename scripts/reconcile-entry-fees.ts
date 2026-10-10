/**
 * Fee reconciliation guard — catches silently-mispriced entries in live data.
 *
 * The Special Award Class overcharge (Mandy 2026-07-19) sat in the database for
 * days because nothing ever re-checked stored fees. This script is that missing
 * check. It is READ-ONLY (SELECT only):
 *
 *   A. Every Special Award Class row must be charged that class's OWN fee
 *      (show_classes.entry_fee) — never the first/subsequent tier. This is the
 *      exact RKC bug; it would have flagged Kathryn / Denise / Miss G on day one.
 *   B. Every entry's per-class breakdown must sum to entries.total_fee, so the
 *      financial "Entries by Class" report reconciles with order revenue.
 *      (A and B are engine-INDEPENDENT internal-consistency checks — they can't
 *      share a bug with the engine that wrote the rows.)
 *   C. Every regional (SV/WUSV) order is RE-PRICED from the regional engine and
 *      compared to the stored entry subtotal. A regional edit that ignored the
 *      tier scale wrote a self-consistent-but-wrong fee (so B can't see it) —
 *      only a fresh recompute catches it.
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
import {
  computeRegionalOrderFees,
  regionalClassFlatFee,
  type RegionalDogEntryInput,
  type RegionalFeeContext,
  type RegionalFeeTier,
} from '../src/lib/regional-fee-calc';

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
    // We compare the GROSS charge on the row against the class's own fee. Entry
    // fees are stored gross on purpose (immutable record of what was charged);
    // a refund is tracked separately at the payment row and netted into the
    // club's receivable by show-metrics. So an overcharge that has ALREADY been
    // refunded is fully remediated — the entry's gross fee is meant to stay put,
    // and rewriting it would double-count the refund in the club's share. We net
    // each entry's refunds against its overcharge and only flag the residual.
    const specialRows = await sql`
      SELECT s.name AS show, u.name AS exhibitor, cd.name AS class,
             sc.entry_fee AS should_be, ec.fee AS charged, e.id AS entry_id,
             o.status AS order_status,
             COALESCE((SELECT SUM(rp.amount) FROM payments rp
                       WHERE rp.entry_id = e.id AND rp.type = 'refund'), 0) AS entry_refunds
      FROM entry_classes ec
      JOIN show_classes sc      ON sc.id = ec.show_class_id
      JOIN class_definitions cd ON cd.id = sc.class_definition_id
      JOIN entries e            ON e.id = ec.entry_id
      JOIN shows s              ON s.id = e.show_id
      JOIN users u             ON u.id = e.exhibitor_id
      LEFT JOIN orders o        ON o.id = e.order_id
      WHERE cd.type = 'special'
        AND e.deleted_at IS NULL
        AND ec.fee IS DISTINCT FROM sc.entry_fee
      ORDER BY s.name, u.name
    `;

    type SpecialAgg = { show: string; exhibitor: string; orderStatus: string | null; refunds: number; overcharge: number; parts: string[] };
    const specialByEntry = new Map<string, SpecialAgg>();
    for (const r of specialRows) {
      let a = specialByEntry.get(r.entry_id);
      if (!a) {
        a = { show: r.show, exhibitor: r.exhibitor, orderStatus: r.order_status, refunds: Number(r.entry_refunds), overcharge: 0, parts: [] };
        specialByEntry.set(r.entry_id, a);
      }
      a.overcharge += r.charged - r.should_be;
      a.parts.push(`"${r.class}" ${money(r.charged)}→${money(r.should_be)}`);
    }
    const specialEntries = [...specialByEntry.entries()].map(([id, a]) => ({ id, ...a, residual: a.overcharge - a.refunds }));
    const unremediated = specialEntries.filter((a) => a.residual > 0);
    const remediated = specialEntries.length - unremediated.length;
    // Only PAID orders with a residual overcharge are real money owed; unpaid
    // (stale pending) rows are data hygiene, not a shortfall — list, don't fail.
    const realMoney = unremediated.filter((a) => a.orderStatus === 'paid');

    console.log('── A. Special Award Class pricing ──');
    if (specialEntries.length === 0) {
      console.log('   ✓ every special class charged its own fee\n');
    } else if (unremediated.length === 0) {
      console.log(`   ✓ ${specialEntries.length} historical overcharge(s) found — ALL already remediated by a refund\n`);
    } else {
      problems += realMoney.length;
      console.log(
        `   ${realMoney.length ? '✗' : '·'} ${unremediated.length} unremediated special overcharge(s)` +
        ` (${realMoney.length} on PAID orders — real money owed${remediated ? `; ${remediated} already refunded` : ''}):`,
      );
      for (const a of unremediated) {
        const tag = a.orderStatus === 'paid' ? 'REAL — paid, still owed' : `harmless — order ${a.orderStatus ?? 'none'}`;
        const refundNote = a.refunds ? ` (less ${money(a.refunds)} already refunded)` : '';
        console.log(`     • ${a.show} — ${a.exhibitor}: owed ${money(a.residual)}${refundNote} [${tag}] — ${a.parts.join(', ')} (entry ${a.id})`);
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

    // ── Check C — regional orders re-priced from the engine ─────────────────
    // One row per (regional entry, its first class). Regional dogs sit in one
    // class; NFC regional entries can carry more, so we take the first (matching
    // checkout's classIds[0]) and dedupe per entry below.
    const regionalRows = await sql`
      SELECT o.id AS order_id, o.regional_membership, o.regional_first_time_exhibitor,
             s.name AS show, s.regional_fee_config, s.junior_handler_fee,
             u.name AS exhibitor,
             e.id AS entry_id, e.entry_type, e.total_fee,
             cd.name AS class_name, cd.type AS class_type, sc.entry_fee AS class_fee
      FROM orders o
      JOIN shows s ON s.id = o.show_id
      JOIN users u ON u.id = o.exhibitor_id
      JOIN entries e ON e.order_id = o.id AND e.deleted_at IS NULL
      LEFT JOIN entry_classes ec ON ec.entry_id = e.id
      LEFT JOIN show_classes sc ON sc.id = ec.show_class_id
      LEFT JOIN class_definitions cd ON cd.id = sc.class_definition_id
      WHERE s.show_ruleset = 'wusv' AND s.regional_fee_config IS NOT NULL
      ORDER BY o.id, e.id
    `;

    type OrderAgg = {
      show: string; exhibitor: string; membership: string | null; firstTime: boolean;
      cfg: { tiers?: RegionalFeeTier[]; memberships?: { label: string; tiers?: RegionalFeeTier[] }[]; firstTimeEnabled?: boolean; firstTimeFeePence?: number | null } | null;
      jhFee: number | null;
      entries: Map<string, { entryType: string; totalFee: number; className: string | null; classType: string | null; classFee: number | null }>;
    };
    const byOrder = new Map<string, OrderAgg>();
    for (const r of regionalRows) {
      let agg = byOrder.get(r.order_id);
      if (!agg) {
        agg = {
          show: r.show, exhibitor: r.exhibitor, membership: r.regional_membership,
          firstTime: !!r.regional_first_time_exhibitor, cfg: r.regional_fee_config,
          jhFee: r.junior_handler_fee, entries: new Map(),
        };
        byOrder.set(r.order_id, agg);
      }
      // First class row wins (regional = one class per dog).
      if (!agg.entries.has(r.entry_id)) {
        agg.entries.set(r.entry_id, {
          entryType: r.entry_type, totalFee: r.total_fee ?? 0,
          className: r.class_name, classType: r.class_type, classFee: r.class_fee,
        });
      }
    }

    const regionalMispriced: { order: string; show: string; exhibitor: string; stored: number; expected: number }[] = [];
    for (const [orderId, agg] of byOrder) {
      const cfg = agg.cfg;
      if (!cfg?.tiers?.length) continue; // no scale configured — nothing to check
      const membershipOptions = cfg.memberships ?? [{ label: 'BRG/League member' }];
      const declared = agg.membership ? membershipOptions.find((m) => m.label === agg.membership) : undefined;
      const ctx: RegionalFeeContext = {
        tiers: declared?.tiers ?? cfg.tiers,
        isMember: !!declared && !declared.tiers,
        firstTimeExhibitor: agg.firstTime && !!cfg.firstTimeEnabled,
        firstTimeFeePence: cfg.firstTimeFeePence ?? 0,
        juniorHandlerFeePence: agg.jhFee ?? 0,
      };
      const engineEntries: RegionalDogEntryInput[] = [...agg.entries.values()].map((e, i) => ({
        key: String(i),
        kind: e.entryType === 'junior_handler' ? 'junior_handler' : 'standard',
        flatFeePence: regionalClassFlatFee(
          { className: e.className, classType: e.classType, entryFee: e.classFee },
          cfg.tiers!,
        ),
      }));
      const expected = computeRegionalOrderFees(engineEntries, ctx).entriesTotal;
      const stored = [...agg.entries.values()].reduce((s, e) => s + e.totalFee, 0);
      if (expected !== stored) {
        regionalMispriced.push({ order: orderId, show: agg.show, exhibitor: agg.exhibitor, stored, expected });
      }
    }

    console.log('── C. Regional (SV/WUSV) orders re-priced from the engine ──');
    if (byOrder.size === 0) {
      console.log('   · no regional orders to check\n');
    } else if (regionalMispriced.length === 0) {
      console.log(`   ✓ all ${byOrder.size} regional order(s) match the tier scale\n`);
    } else {
      problems += regionalMispriced.length;
      console.log(`   ✗ ${regionalMispriced.length} regional order(s) diverge from the scale:`);
      for (const r of regionalMispriced) {
        console.log(`     • ${r.show} — ${r.exhibitor}: stored ${money(r.stored)} vs engine ${money(r.expected)} (order ${r.order})`);
      }
      console.log('   (a pending, unpaid class upgrade can look like this — verify before acting)\n');
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
