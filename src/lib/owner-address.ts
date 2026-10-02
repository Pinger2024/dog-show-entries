/**
 * "Same address as Owner 1" for joint owners.
 *
 * Most joint owners are a household — a husband and wife, a parent and child,
 * two people at one kennel — so retyping the same address onto every row is
 * pure friction (Mandy 2026-08-12). The dog form ticks joint owners as sharing
 * the primary owner's address by default; unticking reveals the address field.
 *
 * The tick is NOT stored. `dog_owners.owner_address` keeps a real per-row
 * VALUE, because the catalogue prints each owner row's own address and the
 * withhold-from-publication logic reads it per row — a live reference to
 * another row would break both. The tick is therefore derived on load by
 * comparing addresses, which gives the behaviour people expect for free:
 * rows that share the primary's address stay ticked, so editing the primary's
 * address later carries the household with it on the next save.
 */

export interface OwnerAddressRow {
  ownerAddress: string;
}

/** Trim, collapse runs of whitespace, case-fold — so "1 The Lane,  Shotts"
 *  and "1 the lane, Shotts" count as the same address. */
function normalise(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * True when both addresses are present and the same. A blank address never
 * matches — two empty rows are not a household, they're two rows nobody has
 * filled in yet.
 */
export function addressesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalise(a);
  return left.length > 0 && left === normalise(b);
}

/**
 * Per-row tick state for a saved set of owner rows, in row order.
 *
 * Owner 1 is the primary and is never ticked — it IS the address the others
 * copy. A joint owner is ticked when their saved address already matches the
 * primary's.
 */
export function deriveSameAddressFlags(
  owners: ReadonlyArray<{ ownerAddress: string | null }>,
): boolean[] {
  const primaryAddress = owners[0]?.ownerAddress ?? '';
  return owners.map((owner, index) =>
    index === 0 ? false : addressesMatch(owner.ownerAddress, primaryAddress),
  );
}

/**
 * Resolve the addresses actually written to the database: every ticked joint
 * owner takes the primary's address verbatim.
 *
 * Called at submit time so the saved value never depends on the UI having
 * kept a hidden field in sync.
 *
 * If the primary's address is blank the ticked rows keep whatever they had —
 * clearing Owner 1's address must never silently wipe the joint owners'
 * addresses (and a blank address would fail the server's `min(1)` anyway,
 * on a field the tick has hidden from view).
 */
export function applySameAddress<T extends OwnerAddressRow>(
  owners: ReadonlyArray<T>,
  flags: ReadonlyArray<boolean>,
): T[] {
  const primaryAddress = owners[0]?.ownerAddress ?? '';
  if (!primaryAddress.trim()) return owners.map((o) => ({ ...o }));

  return owners.map((owner, index) =>
    index > 0 && flags[index]
      ? { ...owner, ownerAddress: primaryAddress }
      : { ...owner },
  );
}
