/**
 * Print Shop — Product configuration
 *
 * Maps document types to Tradeprint product specs.
 * Product IDs and print specs are static config (rarely change),
 * but prices are always fetched live from the Tradeprint API.
 */

export interface PrintProduct {
  documentType: string;
  label: string;
  description: string;
  tradeprintProductName: string;
  tradeprintProductId: string;
  defaultSpecs: Record<string, string>;
  /** Suggest quantity based on show data */
  suggestQuantity: (stats: ShowStats) => number;
  /** Whether this is download-only (no printing available) */
  downloadOnly?: boolean;
}

export interface ShowStats {
  confirmedEntries: number;
  totalClasses: number;
  catalogueOrders: number;
  ringCount: number;
  placementsPerClass: number;
}

/** Round up to nearest 10 */
function roundUp10(n: number): number {
  return Math.ceil(n / 10) * 10;
}

export const PRINT_PRODUCTS: PrintProduct[] = [
  {
    documentType: 'catalogue',
    label: 'Catalogues',
    description: 'A5 perfect bound booklets — the official show catalogue',
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
    suggestQuantity: (stats) =>
      roundUp10(stats.confirmedEntries + stats.catalogueOrders + Math.ceil(stats.confirmedEntries * 0.1)),
  },
  {
    documentType: 'prize_cards',
    label: 'Prize Cards',
    description: 'A6 cards, double-sided — one per placement',
    tradeprintProductName: 'Flyers',
    tradeprintProductId: 'PRD-WLPVQMTE',
    defaultSpecs: {
      'Size': 'A6',
      'Sides Printed': 'Double Sided',
      'Paper Type': '300gsm Art Board Coated',
      'Lamination': 'None',
      'Sets': '1',
    },
    suggestQuantity: (stats) =>
      roundUp10(stats.totalClasses * stats.placementsPerClass),
  },
  {
    documentType: 'schedule',
    label: 'Schedules',
    description: 'A5 folded leaflets — show schedule & class list',
    tradeprintProductName: 'Folded Leaflets',
    tradeprintProductId: 'PRD-LBMTK4ZV',
    defaultSpecs: {
      'Size': 'A5',
      'Paper Type': '130gsm Art Paper Silk Finish',
      'Lamination': 'None',
    },
    suggestQuantity: (stats) =>
      roundUp10(stats.confirmedEntries + stats.catalogueOrders + Math.ceil(stats.confirmedEntries * 0.1)),
  },
  {
    documentType: 'ring_board',
    label: 'Ring Boards',
    description: 'A3 posters — one per ring showing running order',
    tradeprintProductName: 'Long Run Posters',
    tradeprintProductId: 'PRD-KAZOQNCF',
    defaultSpecs: {
      'Size': 'A3',
      'Paper Type': '170gsm Art Paper Silk Finish',
      'Sets': '1',
    },
    suggestQuantity: (stats) => Math.max(stats.ringCount, 1),
  },
  {
    documentType: 'ring_numbers',
    label: 'Ring Numbers',
    description: 'A6 cards, single-sided — one per dog',
    tradeprintProductName: 'Flyers',
    tradeprintProductId: 'PRD-WLPVQMTE',
    defaultSpecs: {
      'Size': 'A6',
      'Sides Printed': 'Single Sided',
      'Paper Type': '300gsm Art Board Coated',
      'Lamination': 'None',
      'Sets': '1',
    },
    suggestQuantity: (stats) => roundUp10(stats.confirmedEntries),
  },
  {
    documentType: 'judges_books',
    label: 'Judges Books',
    description: 'Unique per judge — download only, not cost-effective to print individually',
    tradeprintProductName: '',
    tradeprintProductId: '',
    defaultSpecs: {},
    suggestQuantity: () => 0,
    downloadOnly: true,
  },
];

/** Get printable products only (excludes download-only items) */
export function getPrintableProducts(): PrintProduct[] {
  return PRINT_PRODUCTS.filter((p) => !p.downloadOnly);
}

/** Find a product by document type */
export function getProductByType(documentType: string): PrintProduct | undefined {
  return PRINT_PRODUCTS.find((p) => p.documentType === documentType);
}

/** Default markup multiplier (e.g., 1.4 = 40% margin on cost inc VAT) */
export function getMarkupMultiplier(): number {
  const pct = parseInt(process.env.PRINT_MARKUP_PERCENT ?? '40', 10);
  return 1 + pct / 100;
}

/** Calculate selling price from trade cost (ex-VAT pence) */
export function calculateSellingPrice(tradeCostExVatPence: number): number {
  // True cost = trade price + 20% VAT (we can't reclaim it)
  const costIncVat = tradeCostExVatPence * 1.2;
  // Selling price = cost × markup
  const sellingPrice = costIncVat * getMarkupMultiplier();
  return Math.ceil(sellingPrice);
}
