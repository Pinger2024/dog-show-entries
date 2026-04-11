/**
 * Mixam public API service — pricing, order submission, status polling.
 *
 * Switched from Tradeprint to Mixam on 2026-04-11 (backlog #99) after
 * Amanda's like-for-like comparison showed Mixam is ~20% cheaper per
 * catalogue, delivers in 1 working day via DHL Express (vs Tradeprint's
 * 3 working days), and has transparent pricing without requiring a
 * signed-in trade account. See `memory/project_inhouse_print_pricing.md`
 * for the full analysis.
 *
 * API docs: https://mixam.com/documentation/api/public
 * MxJdf4 spec: https://github.com/mixam-platform/MxJdf4
 *
 * This file uses `fetch` directly — Mixam is a plain REST API and
 * doesn't need an SDK (the previous Tradeprint integration used one
 * but it was heavy and lazy-loaded to avoid memory pressure on the
 * 512MB Render instance).
 *
 * Env vars (set in Render dashboard / `.env`):
 *   MIXAM_EMAIL       — account email
 *   MIXAM_PASSWORD    — account password
 *   MIXAM_API_URL     — base URL, default https://mixam.co.uk
 *
 * Missing env vars don't crash at startup — the service logs a warning
 * and each function returns an error on call. That lets the Print Shop
 * boot even if Mixam isn't configured (which is the current state —
 * the integration is shipped behind an env var gate pending production
 * credentials).
 */

// ── Config ────────────────────────────────────────────────────

function getApiUrl(): string {
  return process.env.MIXAM_API_URL ?? 'https://mixam.co.uk';
}

function getCredentials(): { email: string; password: string } | null {
  const email = process.env.MIXAM_EMAIL;
  const password = process.env.MIXAM_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

// ── JWT auth token caching ────────────────────────────────────
//
// Mixam's public API uses JWT bearer tokens. The token is fetched
// once via Basic Auth and reused until it fails with 401 (which
// invalidates the cache and triggers a refetch on the next call).

interface CachedToken {
  token: string;
  fetchedAt: number;
}

// JWT lifetime from Mixam isn't documented precisely; we assume
// ~23 hours and refresh proactively to avoid a 401 race.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

let cachedToken: CachedToken | null = null;

async function getAuthToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }

  const creds = getCredentials();
  if (!creds) {
    throw new Error(
      '[mixam] MIXAM_EMAIL / MIXAM_PASSWORD env vars not set — cannot authenticate',
    );
  }

  // btoa() is available in both Node 18+ and browser, so this module
  // stays client-bundle-safe (print-products.ts is imported by client
  // components and would otherwise pull Node's Buffer into the bundle).
  const basicAuth = btoa(`${creds.email}:${creds.password}`);
  const res = await fetch(`${getApiUrl()}/api/user/token`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`[mixam] auth failed: ${res.status} ${res.statusText}`);
  }

  // Response shape: either a raw JWT string or { token: "..." }
  const text = await res.text();
  const token = text.startsWith('{') ? JSON.parse(text).token ?? JSON.parse(text).jwt : text.trim();
  if (!token || typeof token !== 'string') {
    throw new Error('[mixam] auth response did not contain a token');
  }

  cachedToken = { token, fetchedAt: Date.now() };
  return token;
}

/**
 * Invalidate the cached auth token. Call this when a request returns
 * 401 so the next call fetches a fresh token.
 */
export function clearAuthTokenCache(): void {
  cachedToken = null;
}

// ── Authenticated fetch helper ────────────────────────────────

async function mixamFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAuthToken();
  const url = path.startsWith('http') ? path : `${getApiUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  // On 401, clear the token cache and retry once with a fresh token.
  if (res.status === 401) {
    clearAuthTokenCache();
    const freshToken = await getAuthToken();
    return fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${freshToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  return res;
}

// ── ItemSpecification types ───────────────────────────────────
//
// The MxJdf4 spec uses an ItemSpecification object with one or more
// components. These types mirror the JSON wire format — field names
// must match exactly. See:
//   https://github.com/mixam-platform/MxJdf4
//   https://mixam.com/documentation/api/public

/** Mixam top-level product types — maps to the `product` field. */
export type MixamProductType =
  | 'BROCHURES'
  | 'FLYERS'
  | 'FOLDED_LEAFLETS'
  | 'POSTERS'
  | 'BUSINESS_CARDS'
  | 'STATIONERY';

/** Mixam format IDs — DIN sizes. */
export const MIXAM_FORMAT = {
  A3: 3,
  A4: 4,
  A5: 5,
  A6: 6,
} as const;

/** Mixam substrate type IDs — paper finish. */
export const MIXAM_SUBSTRATE_TYPE = {
  SILK: 1,
  GLOSS: 2,
  UNCOATED: 3,
} as const;

/** Mixam substrate weight IDs — GSM. */
export const MIXAM_SUBSTRATE_WEIGHT = {
  '90gsm': 0,
  '100gsm': 1,
  '115gsm': 2,
  '130gsm': 3,
  '150gsm': 4,
  '170gsm': 5,
  '250gsm': 7,
  '300gsm': 8,
} as const;

export interface MixamSubstrate {
  typeId: number;
  weightId: number;
}

export interface MixamComponent {
  componentType: 'BOUND' | 'COVER' | 'FOLDED' | 'FLAT';
  format: number;
  standardSize?: string;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  colours: 'PROCESS' | 'GRAYSCALE';
  substrate: MixamSubstrate;
  /** Page count — required for BOUND components. Must be a multiple of 4 for saddle-stitched. */
  pages?: number;
  /** Binding type — required for BOUND components. */
  binding?: { type: 'STAPLED' | 'PERFECT' | 'WIRO' };
  /** Simple fold type — for FOLDED components only. */
  simpleFold?: 'CROSS' | 'HALF' | 'Z' | 'GATE';
  /** Number of printed sides — for FOLDED components. */
  sides?: number;
  lamination?: 'NONE' | 'GLOSS' | 'MATT' | 'SOFT_TOUCH';
  backLamination?: 'NONE' | 'GLOSS' | 'MATT' | 'SOFT_TOUCH';
  backColours?: 'PROCESS' | 'GRAYSCALE' | 'NONE';
}

export interface MixamItemSpecification {
  copies: number;
  product: MixamProductType;
  components: MixamComponent[];
}

// ── Offer (pricing) request/response ─────────────────────────

export interface MixamOffer {
  offerId: string;
  /** Total price in GBP (ex-VAT). */
  price: number;
  productionDays: number;
  pressType?: string;
  bestPrice?: boolean;
}

/**
 * Fetch price offers for a given ItemSpecification.
 * POST /api/public/offers — returns an array of offers.
 *
 * Mixam's pricing model is per-quantity: each /offers call returns
 * offers for the SPECIFIC quantity in the spec. To build a multi-
 * quantity price list, call this multiple times with different
 * `copies` values and collect the results.
 */
export async function getOffers(
  spec: MixamItemSpecification,
): Promise<MixamOffer[]> {
  const res = await mixamFetch('/api/public/offers', {
    method: 'POST',
    body: JSON.stringify({ itemSpecification: spec }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[mixam] getOffers failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`,
    );
  }

  const data = await res.json();
  // Response is typically `{ offers: [...] }` or just `[...]`
  const offers = Array.isArray(data) ? data : (data.offers ?? []);
  return offers.map((o: Record<string, unknown>) => ({
    offerId: String(o.offerId ?? o.id ?? ''),
    price: Number(o.price ?? 0),
    productionDays: Number(o.productionDays ?? 0),
    pressType: o.pressType as string | undefined,
    bestPrice: Boolean(o.bestPrice),
  }));
}

/**
 * Get the cheapest offer for a spec. Convenience wrapper around
 * getOffers that returns just the best-price result.
 */
export async function getBestOffer(
  spec: MixamItemSpecification,
): Promise<MixamOffer | null> {
  const offers = await getOffers(spec);
  if (offers.length === 0) return null;
  // Prefer the offer with bestPrice=true, fall back to the lowest price
  const best = offers.find((o) => o.bestPrice);
  if (best) return best;
  return [...offers].sort((a, b) => a.price - b.price)[0] ?? null;
}

// ── Order submission ──────────────────────────────────────────

export interface MixamOrderItem {
  /** The itemSpecification for this item. */
  itemSpecification: MixamItemSpecification;
  /** An offerId from a previous /offers call — validates the price. */
  offerId?: string;
  /** R2 public URL of the print-ready PDF. */
  artworkUrl: string;
  /** Optional delivery address for direct-ship to a third party. */
  deliveryAddress?: MixamAddress;
}

export interface MixamAddress {
  name: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string; // ISO country code, e.g. "GB"
  phone?: string;
  email?: string;
}

export interface MixamOrderInput {
  /** A reference from your side — appears on the Mixam order for reconciliation. */
  externalReference: string;
  /** The billing address (usually Amanda/Remi). */
  billingAddress: MixamAddress;
  /** One or more items — each can ship to a different address. */
  items: MixamOrderItem[];
}

export interface MixamOrderResult {
  orderId: string;
  /** Mixam's own order reference (for tracking + support). */
  mixamReference?: string;
  /** ISO date string for expected dispatch. */
  expectedDispatchDate?: string;
}

/**
 * Submit a new order to Mixam.
 * POST /api/public/orders — the full order with items + addresses.
 */
export async function submitOrder(
  input: MixamOrderInput,
): Promise<MixamOrderResult> {
  const body = {
    externalReference: input.externalReference,
    billingAddress: addressToMixamJson(input.billingAddress),
    items: input.items.map((item) => ({
      itemSpecification: item.itemSpecification,
      ...(item.offerId ? { offerId: item.offerId } : {}),
      artworkUrl: item.artworkUrl,
      ...(item.deliveryAddress
        ? { deliveryAddress: addressToMixamJson(item.deliveryAddress) }
        : {}),
    })),
  };

  const res = await mixamFetch('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(
      `[mixam] submitOrder failed: ${res.status} ${res.statusText} ${errBody.slice(0, 500)}`,
    );
  }

  const data = await res.json();
  return {
    orderId: String(data.id ?? data.orderId ?? ''),
    mixamReference: data.mixamReference ?? data.reference ?? undefined,
    expectedDispatchDate: data.expectedDispatchDate ?? data.dispatchDate ?? undefined,
  };
}

function addressToMixamJson(addr: MixamAddress): Record<string, string> {
  return {
    name: addr.name,
    ...(addr.company ? { company: addr.company } : {}),
    line1: addr.line1,
    ...(addr.line2 ? { line2: addr.line2 } : {}),
    city: addr.city,
    postcode: addr.postcode,
    country: addr.country,
    ...(addr.phone ? { phone: addr.phone } : {}),
    ...(addr.email ? { email: addr.email } : {}),
  };
}

// ── Order status ─────────────────────────────────────────────

export interface MixamOrderStatus {
  /** Lowercased status string — one of received / in_production / dispatched / delivered / cancelled. */
  status: string;
  /** Free-text status from Mixam (preserved verbatim for display). */
  rawStatus?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryDate?: string | null;
}

/**
 * Fetch the current status of a Mixam order.
 * GET /api/public/orders/{id}
 */
export async function getOrderStatus(
  orderId: string,
): Promise<MixamOrderStatus | null> {
  const res = await mixamFetch(`/api/public/orders/${encodeURIComponent(orderId)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(
      `[mixam] getOrderStatus failed: ${res.status} ${res.statusText}`,
    );
    return null;
  }

  const data = await res.json();
  const rawStatus = (data.status as string | undefined) ?? '';
  return {
    status: normaliseStatus(rawStatus),
    rawStatus,
    trackingNumber: (data.trackingNumber as string | null | undefined) ?? null,
    trackingUrl: (data.trackingUrl as string | null | undefined) ?? null,
    estimatedDeliveryDate:
      (data.expectedDeliveryDate as string | null | undefined) ??
      (data.estimatedDeliveryDate as string | null | undefined) ??
      null,
  };
}

/**
 * Normalise Mixam's free-text status into one of the known states
 * used by the Print Shop UI: submitted / in_production / dispatched /
 * delivered / cancelled.
 */
export function normaliseStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('deliver')) return 'delivered';
  if (lower.includes('dispatch') || lower.includes('shipped')) return 'dispatched';
  if (lower.includes('production') || lower.includes('printing') || lower.includes('press')) {
    return 'in_production';
  }
  if (lower.includes('cancel')) return 'cancelled';
  return 'submitted';
}

// ── Legacy adapter helpers ───────────────────────────────────
//
// These match the function signatures that `print-orders.ts` used to
// import from `tradeprint.ts`, so the switch is a pure import-path
// change on that side. Each adapter translates between the old
// Tradeprint-shaped call and Mixam's per-quantity API.

/** Stub that returns an empty Map — the price-list caching model
 *  doesn't translate to Mixam (which prices per-quantity on demand).
 *  Callers that need a single price should use `getTradePrice`
 *  below, which calls `getOffers` for the specific quantity. */
export async function getTradePrices(
  _productName: string,
  _specs: Record<string, string>,
  _serviceLevel: string = 'standard',
): Promise<Map<number, number>> {
  // The old Tradeprint adapter returned a Map<quantity, unitPence>
  // for an entire product's price list. Mixam doesn't expose a
  // price-list endpoint — each /offers call is per-quantity.
  // Returning an empty map forces callers to fall through to the
  // per-quantity path via getTradePrice below.
  return new Map();
}

/**
 * Get trade price for a specific quantity of a product.
 * Returns unit price in pence (ex-VAT), or null if no offer.
 */
export async function getTradePrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
  _serviceLevel: string = 'standard',
): Promise<number | null> {
  // Translate the Tradeprint-style product name + spec map into a
  // Mixam ItemSpecification via the mapper in print-products.ts.
  const { specsToMixamItemSpecification } = await import('@/lib/print-products');
  const spec = specsToMixamItemSpecification(productName, specs, quantity);
  if (!spec) {
    console.error(
      `[mixam] getTradePrice: no Mixam mapping for product "${productName}"`,
    );
    return null;
  }
  const offer = await getBestOffer(spec);
  if (!offer) return null;
  // offer.price is total GBP ex-VAT → unit price in pence
  return Math.round((offer.price / quantity) * 100);
}

/**
 * Return the quantities Mixam accepts for a given product/spec.
 *
 * Mixam doesn't have a dedicated quantities endpoint — we just
 * return the same canonical list of quantities the Print Shop UI
 * has always surfaced (10, 20, 30, 50, 75, 100, 150, 200, 300, 500).
 * Mixam's /offers endpoint will accept any of these for A5 saddle-
 * stitched booklets; if a specific combination is invalid the
 * caller will see it when getTradePrice returns null.
 */
export async function getAvailableQuantities(
  _productId: string,
  _specs: Record<string, string>,
  _serviceLevel: string = 'Standard',
): Promise<number[]> {
  return [10, 20, 30, 50, 75, 100, 150, 200, 300, 500];
}

/**
 * Get expected delivery date from Mixam.
 *
 * Translates to /offers (which includes productionDays) and adds
 * delivery time heuristically. Mixam's DHL Express is typically
 * 1 working day to UK mainland after dispatch.
 */
export async function getDeliveryEstimate(
  productId: string,
  _serviceLevel: string,
  quantity: number,
  productionData: Record<string, string>,
  _postcode: string,
): Promise<{ date: string; formattedDate: string } | null> {
  const { specsToMixamItemSpecification } = await import('@/lib/print-products');
  const spec = specsToMixamItemSpecification(productId, productionData, quantity);
  if (!spec) return null;

  const offer = await getBestOffer(spec);
  if (!offer) return null;

  // productionDays from Mixam + 1 day DHL Express delivery
  const businessDays = offer.productionDays + 1;
  const deliveryDate = addBusinessDays(new Date(), businessDays);
  const iso = deliveryDate.toISOString().slice(0, 10);
  const formatted = deliveryDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return { date: iso, formattedDate: formatted };
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/**
 * Adapter for the old Tradeprint "validateOrder" call. Mixam doesn't
 * have a separate validation endpoint — submitOrder succeeds or
 * fails with a descriptive error. Returns { valid: true } as a no-op
 * so existing call sites continue to work.
 */
export async function validateOrder(
  _orderData: unknown,
): Promise<{ valid: boolean; errors?: string[] }> {
  return { valid: true };
}

/**
 * Adapter for the old Tradeprint "submitOrder" signature.
 * Translates a Tradeprint-shaped order into a Mixam order and submits.
 *
 * This preserves the legacy call site in stripe/route.ts without
 * forcing an immediate refactor of that webhook. The webhook will be
 * cleaned up in a follow-up alongside the schema column rename.
 */
export async function submitOrderLegacy(
  orderData: LegacyTradeprintOrderInput,
): Promise<{ orderRef: string }> {
  const { legacyTradeprintItemToMixamItem } = await import('@/lib/print-products');

  const items: MixamOrderItem[] = [];
  for (const item of orderData.items) {
    const mixamItem = legacyTradeprintItemToMixamItem(item);
    if (mixamItem) items.push(mixamItem);
  }

  if (items.length === 0) {
    throw new Error('[mixam] submitOrderLegacy: no valid items to submit');
  }

  const result = await submitOrder({
    externalReference: orderData.orderReference,
    billingAddress: {
      name: `${orderData.billingAddress.firstName} ${orderData.billingAddress.lastName}`.trim(),
      line1: orderData.billingAddress.streetName,
      city: orderData.billingAddress.city,
      postcode: orderData.billingAddress.postalCode,
      country: orderData.billingAddress.country,
      phone: orderData.billingAddress.phone,
      email: orderData.billingAddress.email,
    },
    items,
  });

  return { orderRef: result.orderId };
}

export interface LegacyTradeprintOrderInput {
  orderReference: string;
  billingAddress: {
    firstName: string;
    lastName: string;
    streetName: string;
    postalCode: string;
    city: string;
    country: string;
    email: string;
    phone: string;
  };
  items: Array<{
    fileUrl: string;
    serviceLevel: string;
    productId: string;
    quantity: number;
    productionData: Record<string, string>;
    deliveryAddress: {
      firstName: string;
      lastName: string;
      add1: string;
      add2?: string;
      town: string;
      postcode: string;
      country: string;
      contactPhone: string;
    };
    partnerContactDetails?: {
      name: string;
      email: string;
      phone: string;
    };
  }>;
}

/**
 * Back-compat helper from the Tradeprint days — capitalises a
 * service level string. Mixam doesn't use service level strings
 * the same way but we keep the helper exported so existing call
 * sites that import it don't break.
 */
export function capitaliseServiceLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}
