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

/** Suggested quantity for documents distributed per-attendee (catalogues, schedules) */
function suggestPerAttendeeCopies(stats: ShowStats): number {
  return roundUp10(stats.confirmedEntries + stats.catalogueOrders + Math.ceil(stats.confirmedEntries * 0.1));
}

// ── Products ──

export const PRINT_PRODUCTS: PrintProduct[] = [
  {
    documentType: 'catalogue',
    label: 'Catalogues',
    description: 'Perfect bound booklets — the official show catalogue',
    tradeprintProductName: 'Perfect Bound Booklets',
    tradeprintProductId: 'PRD-HKSRILFY',
    defaultSpecs: {
      'Size': 'A5 Portrait',
      'Print Process': 'Digital',
      'Cover Material': '250gsm Art Paper Silk Finish',
      'Paper Type': '130gsm Art Paper Silk Finish',
      'Lamination': 'None',
      'Custom Size': 'N/A',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: '130gsm silk pages, 250gsm silk cover',
        tier: 'standard',
        specs: {
          'Size': 'A5 Portrait',
          'Print Process': 'Digital',
          'Cover Material': '250gsm Art Paper Silk Finish',
          'Paper Type': '130gsm Art Paper Silk Finish',
          'Lamination': 'None',
          'Custom Size': 'N/A',
        },
      },
      {
        id: 'premium',
        label: 'Premium',
        description: '170gsm silk pages, 300gsm cover, matt laminated',
        tier: 'premium',
        specs: {
          'Size': 'A5 Portrait',
          'Print Process': 'Digital',
          'Cover Material': '300gsm Art Paper Silk Finish',
          'Paper Type': '170gsm Art Paper Silk Finish',
          'Lamination': 'Matt Lamination',
          'Custom Size': 'N/A',
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
  },
  {
    documentType: 'prize_cards',
    label: 'Prize Cards',
    description: 'Sturdy cards, double-sided — one per placement',
    tradeprintProductName: 'Flyers',
    tradeprintProductId: 'PRD-WLPVQMTE',
    defaultSpecs: {
      'Size': 'A6',
      'Sides Printed': 'Double Sided',
      'Paper Type': '300gsm Art Board Coated',
      'Lamination': 'None',
      'Sets': '1',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: '300gsm coated card, no lamination',
        tier: 'standard',
        specs: {
          'Size': 'A6',
          'Sides Printed': 'Double Sided',
          'Paper Type': '300gsm Art Board Coated',
          'Lamination': 'None',
          'Sets': '1',
        },
      },
      {
        id: 'premium',
        label: 'Premium',
        description: '350gsm coated card, matt laminated',
        tier: 'premium',
        specs: {
          'Size': 'A6',
          'Sides Printed': 'Double Sided',
          'Paper Type': '350gsm Art Board Coated',
          'Lamination': 'Matt Lamination',
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
    tradeprintProductId: 'PRD-LBMTK4ZV',
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
  },
  {
    documentType: 'ring_board',
    label: 'Ring Boards',
    description: 'Posters — one per ring showing the running order',
    tradeprintProductName: 'Long Run Posters',
    tradeprintProductId: 'PRD-KAZOQNCF',
    defaultSpecs: {
      'Size': 'A3',
      'Paper Type': '170gsm Art Paper Silk Finish',
      'Sets': '1',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: 'A3 silk poster',
        tier: 'standard',
        specs: {
          'Size': 'A3',
          'Paper Type': '170gsm Art Paper Silk Finish',
          'Sets': '1',
        },
      },
    ],
    configurableSpecs: [
      { key: 'Paper Type', label: 'Paper' },
      { key: 'Size', label: 'Size' },
    ],
    suggestQuantity: (stats) => Math.max(stats.ringCount, 1),
  },
  {
    documentType: 'ring_numbers',
    label: 'Ring Numbers',
    description: 'Sturdy cards, single-sided — one per dog',
    tradeprintProductName: 'Flyers',
    tradeprintProductId: 'PRD-WLPVQMTE',
    defaultSpecs: {
      'Size': 'A6',
      'Sides Printed': 'Single Sided',
      'Paper Type': '300gsm Art Board Coated',
      'Lamination': 'None',
      'Sets': '1',
    },
    presets: [
      {
        id: 'standard',
        label: 'Standard',
        description: '300gsm coated card',
        tier: 'standard',
        specs: {
          'Size': 'A6',
          'Sides Printed': 'Single Sided',
          'Paper Type': '300gsm Art Board Coated',
          'Lamination': 'None',
          'Sets': '1',
        },
      },
    ],
    configurableSpecs: [
      { key: 'Paper Type', label: 'Card Weight' },
    ],
    suggestQuantity: (stats) => roundUp10(stats.confirmedEntries),
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
