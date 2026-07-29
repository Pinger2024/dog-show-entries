import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  entries,
  entryClasses,
  showClasses,
  classDefinitions,
  orders,
  orderSundryItems,
  payments,
  sundryItems,
} from '@/server/db/schema';
import type { Database } from '@/server/db';
import type { SettlementLine, SettlementSection, SettlementSnapshot } from '@/server/db/schema/invoices';

/**
 * Builds the full club SETTLEMENT statement for a show — the itemised
 * breakdown behind `admin-invoices.issue`. Lives beside `show-metrics.ts`
 * on purpose: show-metrics answers "how much has this show made", this
 * answers "what does the SETTLEMENT DOCUMENT say" — a different, much more
 * itemised question (per price-point entry lines, sundry-by-name lines,
 * order-level discount reconciliation, refund lines) that show-metrics'
 * headline totals don't carry.
 *
 * Reference layout: the hand-built South Western GSD settlement,
 * INV-SWGSD-0004 — SETTLEMENT header, "Money collected by Remi (online card
 * payments)" / "Paid direct to the club (postal / manual entries)" /
 * "Entries taken free of charge" + a total-entries line / "Less Remi
 * costs" / "Net to credit the club".
 */

export type SettlementDiscountInput = {
  mode: 'perTransaction' | 'percent' | 'fixed';
  /** perTransaction: pence per fee-bearing card payment. percent: whole-number percent off the card fee total. fixed: flat pence, once. */
  value: number;
  label: string;
};

export type SettlementItemisation = SettlementSnapshot & {
  cardFeeTotalPence: number;
  feeBearingChargeCount: number;
  captureGapCount: number;
  discountMode: SettlementDiscountInput['mode'];
  discountValue: number;
  discountLabel: string;
  /** Positive pence — the amount actually deducted off the card fee in the costs section. */
  discountAmountPence: number;
  netToClubPence: number;
};

function money(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ChannelKey = 'viaRemi' | 'direct';

type OrderRow = {
  id: string;
  totalAmount: number;
  donationPence: number;
  channel: ChannelKey;
};

type ConfirmedEntryRow = {
  id: string;
  orderId: string | null;
  totalFee: number;
  isNfc: boolean;
  entryType: 'standard' | 'junior_handler';
};

type SundryRow = {
  orderId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
};

/** Fee-bearing entry, tagged with whether ALL of its classes are JH/special-award classes. */
type TaggedEntry = ConfirmedEntryRow & { jhOrSacOnly: boolean; hasClasses: boolean };

function isDonationName(name: string): boolean {
  return name.toLowerCase().includes('donation');
}

function buildEntryLines(entriesInChannel: TaggedEntry[]): SettlementLine[] {
  const lines: SettlementLine[] = [];

  const regular = entriesInChannel.filter((e) => !e.jhOrSacOnly && e.totalFee > 0);
  const jhOrSac = entriesInChannel.filter((e) => e.jhOrSacOnly && e.totalFee > 0);

  if (regular.length > 0) {
    const byPrice = new Map<number, number>(); // price -> count
    for (const e of regular) byPrice.set(e.totalFee, (byPrice.get(e.totalFee) ?? 0) + 1);
    const distinctPrices = [...byPrice.keys()].sort((a, b) => a - b);
    const total = regular.reduce((sum, e) => sum + e.totalFee, 0);
    const count = regular.length;

    if (distinctPrices.length <= 3) {
      for (const price of distinctPrices) {
        const n = byPrice.get(price)!;
        lines.push({ label: 'Entries', sub: `${n} @ ${money(price)}`, amountPence: n * price });
      }
    } else {
      const min = distinctPrices[0]!;
      const max = distinctPrices[distinctPrices.length - 1]!;
      lines.push({
        label: 'Entries',
        sub: `${count} entries @ ${money(min)}–${money(max)}`,
        amountPence: total,
      });
    }
  }

  if (jhOrSac.length > 0) {
    const byPrice = new Map<number, number>();
    for (const e of jhOrSac) byPrice.set(e.totalFee, (byPrice.get(e.totalFee) ?? 0) + 1);
    const distinctPrices = [...byPrice.keys()];
    const total = jhOrSac.reduce((sum, e) => sum + e.totalFee, 0);
    const sub =
      distinctPrices.length === 1
        ? `${jhOrSac.length} @ ${money(distinctPrices[0]!)}`
        : `${jhOrSac.length} @ ${money(Math.min(...distinctPrices))}–${money(Math.max(...distinctPrices))}`;
    lines.push({ label: 'Junior handling & special award classes', sub, amountPence: total });
  }

  return lines;
}

/** Group sundry lines by item name; donation-named items are pulled out separately by the caller. */
function buildSundryLines(sundries: SundryRow[]): SettlementLine[] {
  const byName = new Map<string, { qty: number; total: number; unitPrice: number }>();
  for (const s of sundries) {
    const existing = byName.get(s.itemName) ?? { qty: 0, total: 0, unitPrice: s.unitPrice };
    existing.qty += s.quantity;
    existing.total += s.quantity * s.unitPrice;
    byName.set(s.itemName, existing);
  }
  const lines: SettlementLine[] = [];
  for (const [name, g] of byName) {
    lines.push({ label: name, sub: `${g.qty} @ ${money(g.unitPrice)}`, amountPence: g.total });
  }
  return lines;
}

export async function computeSettlementItemisation(
  db: Database,
  showId: string,
  opts: {
    packageFeePence: number;
    packageFeeDescription: string;
    discount: SettlementDiscountInput;
  },
): Promise<SettlementItemisation> {
  const paidOrderRows = await db
    .select({
      id: orders.id,
      totalAmount: orders.totalAmount,
      donationPence: orders.donationPence,
      stripePaymentIntentId: orders.stripePaymentIntentId,
    })
    .from(orders)
    .where(and(eq(orders.showId, showId), eq(orders.status, 'paid')));

  const orderRows: OrderRow[] = paidOrderRows.map((o) => ({
    id: o.id,
    totalAmount: o.totalAmount,
    donationPence: o.donationPence,
    channel: o.stripePaymentIntentId ? 'viaRemi' : 'direct',
  }));
  const orderById = new Map(orderRows.map((o) => [o.id, o]));
  const paidOrderIds = orderRows.map((o) => o.id);

  // Confirmed entries — both those on a paid order AND fully orderless
  // (NFC dogs / manual additions never linked to a Remi order at all).
  const confirmedRows = await db
    .select({
      id: entries.id,
      orderId: entries.orderId,
      totalFee: entries.totalFee,
      isNfc: entries.isNfc,
      entryType: entries.entryType,
    })
    .from(entries)
    .where(
      and(
        eq(entries.showId, showId),
        eq(entries.status, 'confirmed'),
        isNull(entries.deletedAt),
        or(
          isNull(entries.orderId),
          inArray(entries.orderId, paidOrderIds.length ? paidOrderIds : ['00000000-0000-0000-0000-000000000000']),
        ),
      ),
    );

  const entryIds = confirmedRows.map((e) => e.id);
  const classTypeRows =
    entryIds.length === 0
      ? []
      : await db
          .select({ entryId: entryClasses.entryId, classType: classDefinitions.type })
          .from(entryClasses)
          .leftJoin(showClasses, eq(showClasses.id, entryClasses.showClassId))
          .leftJoin(classDefinitions, eq(classDefinitions.id, showClasses.classDefinitionId))
          .where(inArray(entryClasses.entryId, entryIds));

  const classTypesByEntry = new Map<string, string[]>();
  for (const r of classTypeRows) {
    const list = classTypesByEntry.get(r.entryId) ?? [];
    list.push(r.classType ?? '');
    classTypesByEntry.set(r.entryId, list);
  }

  const taggedEntries: TaggedEntry[] = confirmedRows.map((e) => {
    const types = classTypesByEntry.get(e.id) ?? [];
    const jhOrSacOnly = types.length > 0 && types.every((t) => t === 'junior_handler' || t === 'special');
    return { ...e, jhOrSacOnly, hasClasses: types.length > 0 };
  });

  const sundryRows =
    paidOrderIds.length === 0
      ? []
      : await db
          .select({
            orderId: orderSundryItems.orderId,
            itemName: sundryItems.name,
            quantity: orderSundryItems.quantity,
            unitPrice: orderSundryItems.unitPrice,
          })
          .from(orderSundryItems)
          .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
          .where(inArray(orderSundryItems.orderId, paidOrderIds));

  // ── Real Stripe card fees (same reconciliation query as before). ──
  const [feeRow] = paidOrderIds.length
    ? await db
        .select({
          feeTotal: sql<number>`COALESCE(SUM(${payments.feePence}), 0)::int`,
          feeCount: sql<number>`COUNT(*) FILTER (WHERE ${payments.feePence} IS NOT NULL)::int`,
          captureGap: sql<number>`COUNT(*) FILTER (WHERE ${payments.feePence} IS NULL AND ${payments.status} IN ('succeeded', 'partially_refunded'))::int`,
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(and(eq(orders.showId, showId), sql`${payments.status} != 'refunded'`))
    : [{ feeTotal: 0, feeCount: 0, captureGap: 0 }];

  const cardFeeTotalPence = feeRow?.feeTotal ?? 0;
  const feeBearingChargeCount = feeRow?.feeCount ?? 0;
  const captureGapCount = feeRow?.captureGap ?? 0;

  // ── Refund rows — explicit type='refund' payment rows, NOT the running
  // refundAmount column on the original charge (see stripe-refunds.ts). ──
  const [refundRow] = paidOrderIds.length
    ? await db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int` })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(and(eq(orders.showId, showId), eq(payments.type, 'refund')))
    : [{ total: 0 }];
  const refundTotalPence = refundRow?.total ?? 0;

  // ── Per-channel assembly ──
  function buildChannel(channel: ChannelKey, title: string, totalLabel: string): SettlementSection {
    const channelOrderIds = new Set(orderRows.filter((o) => o.channel === channel).map((o) => o.id));
    const channelEntries = taggedEntries.filter((e) => e.orderId && channelOrderIds.has(e.orderId));
    const channelSundries = sundryRows.filter((s) => channelOrderIds.has(s.orderId));

    const lines: SettlementLine[] = [...buildEntryLines(channelEntries)];

    const donationSundries = channelSundries.filter((s) => isDonationName(s.itemName));
    const otherSundries = channelSundries.filter((s) => !isDonationName(s.itemName));
    lines.push(...buildSundryLines(otherSundries));

    const donationSundryTotal = donationSundries.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
    const donationSundryCount = donationSundries.reduce((s, r) => s + r.quantity, 0);
    let donationOrderCount = 0;
    let donationOrderTotal = 0;
    for (const id of channelOrderIds) {
      const o = orderById.get(id);
      if (o && o.donationPence > 0) {
        donationOrderCount += 1;
        donationOrderTotal += o.donationPence;
      }
    }
    const donationTotal = donationSundryTotal + donationOrderTotal;
    const donationCount = donationSundryCount + donationOrderCount;
    if (donationTotal > 0) {
      lines.push({
        label: 'Donations',
        sub: `${donationCount} donation${donationCount === 1 ? '' : 's'}`,
        amountPence: donationTotal,
      });
    }

    // Order-level discount — the gap between what the components sum to
    // and what the order actually charged (multi-dog package discounts,
    // member-rate reductions applied at checkout).
    let discountTotal = 0;
    for (const id of channelOrderIds) {
      const order = orderById.get(id);
      if (!order) continue;
      const entryComponent = taggedEntries
        .filter((e) => e.orderId === id)
        .reduce((s, e) => s + e.totalFee, 0);
      const sundryComponent = channelSundries.filter((s) => s.orderId === id).reduce((s, r) => s + r.quantity * r.unitPrice, 0);
      const componentSum = entryComponent + sundryComponent + order.donationPence;
      const gap = componentSum - order.totalAmount;
      if (gap > 0) discountTotal += gap;
    }
    if (discountTotal > 0) {
      lines.push({ label: 'Multi-dog package discount', amountPence: -discountTotal, isCredit: true });
    }

    let refundLine = 0;
    if (channel === 'viaRemi' && refundTotalPence > 0) {
      refundLine = refundTotalPence;
      lines.push({ label: 'Refunds to exhibitors', amountPence: -refundLine, isCredit: true });
    }

    const totalPence = lines.reduce((s, l) => s + l.amountPence, 0);
    return { title, lines, totalLabel, totalPence };
  }

  const viaRemi = buildChannel('viaRemi', 'Money collected by Remi (online card payments)', 'Total collected via Remi');
  const direct = buildChannel('direct', 'Paid direct to the club (postal / manual entries)', 'Total paid direct to club');

  // ── Free entries — confirmed, total_fee = 0, split NFC vs free JH. ──
  const freeEntries = taggedEntries.filter((e) => e.totalFee === 0);
  const freeNfc = freeEntries.filter((e) => e.isNfc);
  const freeJh = freeEntries.filter((e) => !e.isNfc && e.entryType === 'junior_handler');
  const freeLines: SettlementLine[] = [];
  if (freeNfc.length > 0) {
    freeLines.push({ label: 'Not for competition', sub: `${freeNfc.length} @ £0.00`, amountPence: 0 });
  }
  if (freeJh.length > 0) {
    freeLines.push({ label: 'Junior handling (free entry)', sub: `${freeJh.length} @ £0.00`, amountPence: 0 });
  }
  const free: SettlementSection = {
    title: 'Entries taken free of charge',
    lines: freeLines,
    totalLabel: 'Free entries',
    totalPence: 0,
  };

  // ── Total-entries line ──
  const viaRemiEntryCount = taggedEntries.filter((e) => e.orderId && orderById.get(e.orderId)?.channel === 'viaRemi').length;
  const orderlessEntryCount = taggedEntries.filter((e) => !e.orderId).length;
  const directEntryCount =
    taggedEntries.filter((e) => e.orderId && orderById.get(e.orderId)?.channel === 'direct').length + orderlessEntryCount;
  const totalConfirmed = viaRemiEntryCount + directEntryCount;
  const jhCount = taggedEntries.filter((e) => e.entryType === 'junior_handler').length;
  const nfcCount = taggedEntries.filter((e) => e.isNfc).length;
  const totalEntriesLine = `${viaRemiEntryCount} via Remi + ${directEntryCount} direct = ${totalConfirmed} (including ${jhCount} junior handler${jhCount === 1 ? '' : 's'} and ${nfcCount} not-for-competition)`;

  // ── Costs section ──
  let discountAmount: number;
  if (opts.discount.mode === 'percent') {
    discountAmount = Math.round((cardFeeTotalPence * opts.discount.value) / 100);
  } else if (opts.discount.mode === 'fixed') {
    discountAmount = opts.discount.value;
  } else {
    discountAmount = opts.discount.value * feeBearingChargeCount;
  }
  discountAmount = Math.max(0, Math.min(discountAmount, cardFeeTotalPence));

  const costsLines: SettlementLine[] = [
    { label: opts.packageFeeDescription, amountPence: opts.packageFeePence },
    {
      label: 'Card processing (merchant) fee',
      sub: `Actual fees charged by Stripe on ${feeBearingChargeCount} card payment${feeBearingChargeCount === 1 ? '' : 's'}, already collected by Stripe`,
      amountPence: cardFeeTotalPence,
    },
  ];
  if (discountAmount > 0) {
    costsLines.push({ label: opts.discount.label, sub: 'off card processing fees', amountPence: -discountAmount, isCredit: true });
  }
  const costsTotalPence = opts.packageFeePence + cardFeeTotalPence - discountAmount;
  const costs: SettlementSection = {
    title: 'Less Remi costs',
    lines: costsLines,
    totalLabel: 'Total costs',
    totalPence: costsTotalPence,
  };

  const netToClubPence = viaRemi.totalPence - costsTotalPence;

  return {
    viaRemi,
    direct,
    free,
    totalEntriesLine,
    costs,
    cardFeeTotalPence,
    feeBearingChargeCount,
    captureGapCount,
    discountMode: opts.discount.mode,
    discountValue: opts.discount.value,
    discountLabel: opts.discount.label,
    discountAmountPence: discountAmount,
    netToClubPence,
  };
}
