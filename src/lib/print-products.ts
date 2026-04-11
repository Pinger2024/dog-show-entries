/**
 * Print Shop — Product configuration
 *
 * Maps document types to Tradeprint product specs.
 * Product IDs and print specs are static config (rarely change),
 * but prices are fetched from the local price cache (refreshed daily).
 */

// ── Types ──

export interface PrintProduct {
  documentType: string;
  label: string;
  description: string;
  tradeprintProductName: string;
  tradeprintProductId: string;
  defaultSpecs: Record<string, string>;
  /** Presets offer quick quality tiers without spec-level customisation */
  presets: ProductPreset[];
  /** Spec keys the user can customise (in display order) */
  configurableSpecs: SpecConfig[];
  /** Suggest quantity based on show data */
  suggestQuantity: (stats: ShowStats) => number;
  /** Generate show-aware quantity options (snapped to Tradeprint available quantities) */
  getQuantityOptions?: (stats: ShowStats, tradeprintQuantities: number[]) => number[];
  /** Whether this is download-only (no printing available) */
  downloadOnly?: boolean;
}

export interface ProductPreset {
  id: string;
  label: string;
  description: string;
  specs: Record<string, string>;
  /** Visual indicator — helps users understand the tier */
  tier: 'budget' | 'standard' | 'premium';
}

export interface SpecConfig {
  /** The key as it appears in the Tradeprint CSV / JSONB specs */
  key: string;
  /** Human-friendly label */
  label: string;
  /** Optional tooltip/description */
  description?: string;
}

export interface ShowStats {
  confirmedEntries: number;
  totalClasses: number;
  catalogueOrders: number;
  ringCount: number;
  placementsPerClass: number;
}

// ── Helpers ──

/** Round up to nearest 10 */
function roundUp10(n: number): number {
  return Math.ceil(n / 10) * 10;
}

/** Round up to nearest 5 */
function roundUp5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

/** Snap a value to the nearest available Tradeprint quantity (always rounds up) */
function snapToAvailable(value: number, available: number[]): number {
  if (available.length === 0) return value;
  return available.find((q) => q >= value) ?? available[available.length - 1];
}

/** Generate a range of quantities snapped to Tradeprint options */
function generateSnappedOptions(
  values: number[],
  available: number[]
): number[] {
  const snapped = [...new Set(values.map((v) => snapToAvailable(v, available)))];
  return snapped.sort((a, b) => a - b);
}

/** Suggested quantity for documents distributed per-attendee (catalogues, schedules) */
function suggestPerAttendeeCopies(stats: ShowStats): number {
  return roundUp10(stats.confirmedEntries + stats.catalogueOrders + Math.ceil(stats.confirmedEntries * 0.1));
}

// ── Products ──

export const PRINT_PRODUCTS: PrintProduct[] = [
  {
    documentType: 'catalogue',
    label: 'Catalogues',
    // "Saddle Stitched Booklets" is the correct Tradeprint product for
    // the show-catalogue use case (50-500 copies, A5, 16-32 pages).
    // Perfect Bound Booklets — the previous value — has a minimum order
    // quantity of 1000+ which doesn't match any realistic dog show.
    description: 'Saddle-stitched A5 booklets — the official show catalogue',
    tradeprintProductName: 'Saddle Stitched Booklets',
    // TODO(print-shop): this product ID was set to 'PRD-SRDTEO0K' when
    // the product name was Perfect Bound Booklets, but that ID doesn't
    // match the Tradeprint sandbox catalogue (sandbox Perfect Bound is
    // actually PRD-HKSRILFY as of 2026-04-11). Saddle Stitched Booklets
    // is not in the sandbox at all, so the correct production ID
    // cannot be verified from here — it needs to be fetched from the
    // production Tradeprint account dashboard before the Print Shop
    // can submit real orders. See
    // `memory/project_inhouse_print_pricing.md` for context.
    tradeprintProductId: 'PRD-TODO-SADDLE-STITCHED-BOOKLETS',
    defaultSpecs: {
      'Size': 'A5 Portrait',
      'Cover Material': '250gsm Art Paper Silk Finish',
      'Paper Type': '100gsm Art Paper Silk Finish',
      'Lamination': 'None',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: '100gsm silk pages, 250gsm silk cover — matches industry standard',
        tier: 'standard',
        specs: {
          'Size': 'A5 Portrait',
          'Cover Material': '250gsm Art Paper Silk Finish',
          'Paper Type': '100gsm Art Paper Silk Finish',
          'Lamination': 'None',
        },
      },
      {
        id: 'premium',
        label: 'Premium',
        description: '170gsm silk pages, 300gsm cover, matt laminated',
        tier: 'premium',
        specs: {
          'Size': 'A5 Portrait',
          'Cover Material': '300gsm Art Paper Silk Finish',
          'Paper Type': '170gsm Art Paper Silk Finish',
          'Lamination': 'One Side (Matt)',
        },
      },
    ],
    configurableSpecs: [
      { key: 'Paper Type', label: 'Paper', description: 'Interior page weight and finish' },
      { key: 'Cover Material', label: 'Cover', description: 'Cover stock weight and finish' },
      { key: 'Lamination', label: 'Lamination', description: 'Protective coating on the cover' },
      { key: 'Size', label: 'Size', description: 'Booklet dimensions' },
    ],
    suggestQuantity: suggestPerAttendeeCopies,
    getQuantityOptions: (stats, tpQty) => {
      // Catalogues: start from pre-orders, offer increments of 5 up
      const base = Math.max(stats.catalogueOrders, 10);
      const options = [];
      for (let i = 0; i < 8; i++) options.push(roundUp5(base + i * 5));
      // Also add the suggested quantity
      options.push(roundUp5(suggestPerAttendeeCopies(stats)));
      return generateSnappedOptions(options, tpQty);
    },
  },
  {
    documentType: 'prize_cards',
    label: 'Prize Cards',
    description: 'Sturdy cards, double-sided — one per placement',
    tradeprintProductName: 'Flyers',
    tradeprintProductId: 'PRD-CMHPUMSF',
    defaultSpecs: {
      'Size': 'A5',
      'Sides Printed': 'Double Sided',
      'Paper Type': '250gsm Art Paper Silk Finish',
      'Lamination': 'None',
      'Sets': '1',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: 'A5, 250gsm silk card — industry standard quality',
        tier: 'standard',
        specs: {
          'Size': 'A5',
          'Sides Printed': 'Double Sided',
          'Paper Type': '250gsm Art Paper Silk Finish',
          'Lamination': 'None',
          'Sets': '1',
        },
      },
      {
        id: 'premium',
        label: 'Premium',
        description: 'A5, 350gsm silk card, matt laminated',
        tier: 'premium',
        specs: {
          'Size': 'A5',
          'Sides Printed': 'Double Sided',
          'Paper Type': '350gsm Art Board Silk Finish',
          'Lamination': 'Both Sides (Matt)',
          'Sets': '1',
        },
      },
    ],
    configurableSpecs: [
      { key: 'Paper Type', label: 'Card Weight', description: 'Heavier card feels more premium' },
      { key: 'Lamination', label: 'Lamination', description: 'Matt gives a premium feel, gloss is vibrant' },
      { key: 'Size', label: 'Size' },
    ],
    suggestQuantity: (stats) =>
      roundUp10(stats.totalClasses * stats.placementsPerClass),
  },
  {
    documentType: 'schedule',
    label: 'Schedules',
    description: 'Folded leaflets — show schedule and class list',
    tradeprintProductName: 'Folded Leaflets',
    tradeprintProductId: 'PRD-IS1KJC6U',
    defaultSpecs: {
      'Size': 'A5 Landscape',
      'Paper Type': '130gsm Art Paper Silk Finish',
      'Sides Printed': 'Double Sided',
      'Folding': 'Folded to 4pp A6',
      'Sets': '1',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: '130gsm silk paper, folded',
        tier: 'standard',
        specs: {
          'Size': 'A5 Landscape',
          'Paper Type': '130gsm Art Paper Silk Finish',
          'Sides Printed': 'Double Sided',
          'Folding': 'Folded to 4pp A6',
          'Sets': '1',
        },
      },
      {
        id: 'premium',
        label: 'Premium',
        description: '170gsm silk paper, folded',
        tier: 'premium',
        specs: {
          'Size': 'A5 Landscape',
          'Paper Type': '170gsm Art Paper Silk Finish',
          'Sides Printed': 'Double Sided',
          'Folding': 'Folded to 4pp A6',
          'Sets': '1',
        },
      },
    ],
    configurableSpecs: [
      { key: 'Paper Type', label: 'Paper', description: 'Heavier paper feels more substantial' },
      { key: 'Size', label: 'Size' },
    ],
    suggestQuantity: suggestPerAttendeeCopies,
    getQuantityOptions: (stats, tpQty) => {
      // Schedules: min 5, increments of 10
      const options = [];
      for (let i = 0; i < 8; i++) options.push(Math.max(5, (i + 1) * 10));
      options.push(roundUp10(suggestPerAttendeeCopies(stats)));
      return generateSnappedOptions(options, tpQty);
    },
  },
  {
    documentType: 'ring_board',
    label: 'Ring Boards',
    description: 'Posters — one per ring. Download and print at home.',
    tradeprintProductName: '',
    tradeprintProductId: '',
    defaultSpecs: {},
    presets: [],
    configurableSpecs: [],
    suggestQuantity: (stats) => Math.max(stats.ringCount, 1),
    downloadOnly: true,
  },
  {
    documentType: 'ring_numbers',
    label: 'Ring Numbers',
    description: 'Numbered cards — one per dog. Download and print at home.',
    tradeprintProductName: '',
    tradeprintProductId: '',
    defaultSpecs: {},
    presets: [],
    configurableSpecs: [],
    suggestQuantity: (stats) => stats.confirmedEntries,
    downloadOnly: true,
  },
  {
    documentType: 'judges_books',
    label: 'Judges Books',
    description: 'Unique per judge — download only, not cost-effective to print individually',
    tradeprintProductName: '',
    tradeprintProductId: '',
    defaultSpecs: {},
    presets: [],
    configurableSpecs: [],
    suggestQuantity: () => 0,
    downloadOnly: true,
  },
];

// ── Accessors ──

/** Get printable products only (excludes download-only items) */
export function getPrintableProducts(): PrintProduct[] {
  return PRINT_PRODUCTS.filter((p) => !p.downloadOnly);
}

/** Find a product by document type */
export function getProductByType(documentType: string): PrintProduct | undefined {
  return PRINT_PRODUCTS.find((p) => p.documentType === documentType);
}

/** Get the active specs for a product given a preset ID (or default if no match) */
export function getPresetSpecs(product: PrintProduct, presetId: string): Record<string, string> {
  const preset = product.presets.find((p) => p.id === presetId);
  return preset?.specs ?? product.defaultSpecs;
}

// ── Pricing ──

/** Default markup multiplier (e.g., 1.4 = 40% margin on cost inc VAT) */
export function getMarkupMultiplier(): number {
  const pct = parseInt(process.env.PRINT_MARKUP_PERCENT ?? '40', 10);
  return 1 + pct / 100;
}

/** Calculate selling price from trade cost (ex-VAT pence) — total for the batch */
export function calculateSellingPrice(tradeCostExVatPence: number): number {
  // True cost = trade price + 20% VAT (we can't reclaim it)
  const costIncVat = tradeCostExVatPence * 1.2;
  // Selling price = cost × markup
  const sellingPrice = costIncVat * getMarkupMultiplier();
  return Math.ceil(sellingPrice);
}

/** Calculate per-unit selling price — single ceil after division to avoid double rounding */
export function calculateUnitSellingPrice(totalTradeCostExVatPence: number, quantity: number): number {
  const costIncVat = totalTradeCostExVatPence * 1.2;
  const unitSellingPrice = (costIncVat * getMarkupMultiplier()) / quantity;
  return Math.ceil(unitSellingPrice);
}

// ── Order helpers ──

/** Statuses where an order can be cancelled */
export const CANCELLABLE_STATUSES = ['draft', 'awaiting_payment'] as const;

/** Statuses where an order is in-flight and can be polled for updates */
export const PENDING_STATUSES = ['submitted', 'in_production'] as const;

/** Format a print order ID for display */
export function formatOrderRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Print order status display config — shared across all UI surfaces */
export const PRINT_ORDER_STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  awaiting_payment: { label: 'Awaiting Payment', variant: 'outline' },
  paid: { label: 'Paid', variant: 'secondary' },
  submitted: { label: 'With Printer', variant: 'secondary' },
  in_production: { label: 'Printing', variant: 'default' },
  dispatched: { label: 'Dispatched', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
};

// ── Mixam spec translation ────────────────────────────────────

import type {
  MixamItemSpecification,
  MixamOrderItem,
  LegacyTradeprintOrderInput,
} from '@/server/services/mixam';
import {
  MIXAM_FORMAT,
  MIXAM_SUBSTRATE_TYPE,
  MIXAM_SUBSTRATE_WEIGHT,
} from '@/server/services/mixam';

/** Parse "100gsm Art Paper Silk Finish" → Mixam weight ID. */
function paperWeightToMixamId(paperSpec: string): number | null {
  const m = paperSpec.match(/^(\d+)gsm/i);
  if (!m) return null;
  const gsm = `${m[1]}gsm` as keyof typeof MIXAM_SUBSTRATE_WEIGHT;
  return MIXAM_SUBSTRATE_WEIGHT[gsm] ?? null;
}

/** Parse "… Silk Finish" → Mixam substrate type (silk/gloss/uncoated). */
function paperTypeToMixamId(paperSpec: string): number {
  const lower = paperSpec.toLowerCase();
  if (lower.includes('silk')) return MIXAM_SUBSTRATE_TYPE.SILK;
  if (lower.includes('gloss')) return MIXAM_SUBSTRATE_TYPE.GLOSS;
  if (lower.includes('uncoated')) return MIXAM_SUBSTRATE_TYPE.UNCOATED;
  return MIXAM_SUBSTRATE_TYPE.SILK;
}

/** Parse "A4 Portrait" / "A5 Landscape" → Mixam format + orientation. */
function sizeToMixamFormat(size: string): {
  format: number;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
} {
  const lower = size.toLowerCase();
  const orientation: 'PORTRAIT' | 'LANDSCAPE' = lower.includes('landscape')
    ? 'LANDSCAPE'
    : 'PORTRAIT';
  if (lower.includes('a3')) return { format: MIXAM_FORMAT.A3, orientation };
  if (lower.includes('a4')) return { format: MIXAM_FORMAT.A4, orientation };
  if (lower.includes('a6')) return { format: MIXAM_FORMAT.A6, orientation };
  return { format: MIXAM_FORMAT.A5, orientation };
}

/**
 * Translate a Tradeprint-style product name + spec map into a Mixam
 * ItemSpecification for use with getOffers / submitOrder. Returns null
 * when the product isn't (yet) mapped to a Mixam equivalent.
 */
export function specsToMixamItemSpecification(
  productNameOrId: string,
  specs: Record<string, string>,
  quantity: number,
): MixamItemSpecification | null {
  // Find the product by either name or ID — callers pass whichever
  // they have in scope (getTradePrice takes the name, getDeliveryEstimate
  // takes the ID).
  const product = PRINT_PRODUCTS.find(
    (p) =>
      p.tradeprintProductName === productNameOrId ||
      p.tradeprintProductId === productNameOrId,
  );
  if (!product) return null;

  const paperSpec = specs['Paper Type'] ?? product.defaultSpecs['Paper Type'] ?? '';
  const coverSpec = specs['Cover Material'] ?? product.defaultSpecs['Cover Material'] ?? paperSpec;
  const sizeSpec = specs['Size'] ?? product.defaultSpecs['Size'] ?? 'A5 Portrait';
  const pagesSpec = specs['Pages'] ?? specs['Page Count'] ?? '';

  const { format, orientation } = sizeToMixamFormat(sizeSpec);
  const paperWeight = paperWeightToMixamId(paperSpec) ?? MIXAM_SUBSTRATE_WEIGHT['100gsm'];
  const paperType = paperTypeToMixamId(paperSpec);
  const coverWeight = paperWeightToMixamId(coverSpec) ?? MIXAM_SUBSTRATE_WEIGHT['250gsm'];
  const coverType = paperTypeToMixamId(coverSpec);

  switch (product.documentType) {
    case 'catalogue': {
      // Saddle-stitched booklet — BROCHURES product with a BOUND
      // component. Page count must be a multiple of 4.
      const pages = Math.max(8, roundUpToMultipleOf4(parseInt(pagesSpec || '24', 10)));
      return {
        copies: quantity,
        product: 'BROCHURES',
        components: [
          {
            componentType: 'BOUND',
            format,
            standardSize: 'NONE',
            orientation,
            colours: 'PROCESS',
            substrate: { typeId: paperType, weightId: paperWeight },
            pages,
            binding: { type: 'STAPLED' },
          },
          // Separate cover component when the cover stock differs
          // from the body stock. Mixam treats this as an override on
          // the outer sheet.
          ...(coverWeight !== paperWeight || coverType !== paperType
            ? [
                {
                  componentType: 'COVER' as const,
                  format,
                  standardSize: 'NONE',
                  orientation,
                  colours: 'PROCESS' as const,
                  substrate: { typeId: coverType, weightId: coverWeight },
                  lamination: 'NONE' as const,
                },
              ]
            : []),
        ],
      };
    }

    case 'prize_cards': {
      // Prize cards — FLYERS product, single flat component, heavy
      // substrate, double sided, A5 landscape.
      return {
        copies: quantity,
        product: 'FLYERS',
        components: [
          {
            componentType: 'FLAT',
            format,
            standardSize: 'NONE',
            orientation,
            colours: 'PROCESS',
            substrate: { typeId: paperType, weightId: paperWeight },
            backColours: 'PROCESS',
          },
        ],
      };
    }

    default:
      // Schedules, ring numbers, ring boards, judges book — not yet
      // mapped to Mixam. Caller will log a "no mapping" error and
      // fall through gracefully.
      return null;
  }
}

function roundUpToMultipleOf4(n: number): number {
  return Math.ceil(n / 4) * 4;
}

/**
 * Translate a legacy Tradeprint-shaped order item (used by the Stripe
 * webhook submission path) into a Mixam order item. Returns null when
 * the product isn't mapped.
 */
export function legacyTradeprintItemToMixamItem(
  item: LegacyTradeprintOrderInput['items'][number],
): MixamOrderItem | null {
  const spec = specsToMixamItemSpecification(
    item.productId,
    item.productionData,
    item.quantity,
  );
  if (!spec) return null;

  return {
    itemSpecification: spec,
    artworkUrl: item.fileUrl,
    deliveryAddress: {
      name: `${item.deliveryAddress.firstName} ${item.deliveryAddress.lastName}`.trim(),
      line1: item.deliveryAddress.add1,
      line2: item.deliveryAddress.add2,
      city: item.deliveryAddress.town,
      postcode: item.deliveryAddress.postcode,
      country: item.deliveryAddress.country,
      phone: item.deliveryAddress.contactPhone,
      email: item.partnerContactDetails?.email,
    },
  };
}
