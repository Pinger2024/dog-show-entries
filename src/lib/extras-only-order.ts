/**
 * Is this order "extras only" — a catalogue, parking pass or other extra
 * bought with NO dog or junior handler entered (Mandy, 15 Oct 2026)?
 *
 * The ONE definition. My Entries (orders.myExtrasOnlyOrders), the secretary's
 * payment report and show-metrics' "awaiting payment" each ask it, so they
 * can't disagree about which orders these are. Which ORDER STATUSES each of
 * them cares about is their own business (My Entries wants paid orders, the
 * payment report paid and pending, show-metrics pending); this only answers
 * "no dog, but something bought".
 *
 * A live entry is one with deletedAt NULL. A withdrawn dog keeps its entry
 * row (status 'withdrawn', deletedAt NULL), so its order is NOT extras only
 * and keeps its normal dog card and report rows.
 */
export function isExtrasOnlyOrder(order: {
  /** Entries on the order whose deletedAt is NULL. */
  liveEntryCount: number;
  /** order_sundry_items rows on the order. */
  sundryLineCount: number;
}): boolean {
  return order.liveEntryCount === 0 && order.sundryLineCount > 0;
}
