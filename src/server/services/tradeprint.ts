/**
 * Tradeprint API service — singleton pattern matching stripe.ts
 *
 * Handles: price fetching, delivery estimates, order validation, order submission.
 * Uses tradeprint-node-sdk (CommonJS).
 */

// Lazy-loaded to avoid pulling the heavy SDK into memory on every server start.
// Only loaded when a Print Shop function is actually called.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: any = null;

function getSDK() {
  if (!_sdk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sdk = require('tradeprint-node-sdk');
    const env = process.env.TRADEPRINT_ENVIRONMENT === 'production'
      ? _sdk.Environments.Production
      : _sdk.Environments.Sandbox;
    _sdk.setEnvironment(env);
    _sdk.setDebugging(false);
    _sdk.setCredentials(
      process.env.TRADEPRINT_API_USERNAME,
      process.env.TRADEPRINT_API_PASSWORD
    );
  }
  return _sdk;
}

// ── Price cache (1 hour TTL) ──

interface CachedPrice {
  prices: Map<number, number>; // quantity → unit price in pence (ex-VAT)
  fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();
const PRICE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function priceCacheKey(productName: string, specs: Record<string, string>): string {
  return `${productName}:${JSON.stringify(specs)}`;
}

/**
 * Fetch trade prices for a product from Tradeprint's price list API.
 * Returns a Map of quantity → unit price in pence (ex-VAT).
 * Results are cached for 1 hour.
 */
export async function getTradePrices(
  productName: string,
  specs: Record<string, string>,
  serviceLevel: string = 'standard'
): Promise<Map<number, number>> {
  const SDK = getSDK();

  const cacheKey = priceCacheKey(productName, specs) + `:${serviceLevel}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return cached.prices;
  }

  const productService = new SDK.ProductService();
  const response = await productService
    .priceListSingleProductRequest(productName)
    .setMarkup(0) // trade cost
    .setFormatCsv()
    .execute();

  // SDK returns { url, productsAvailable, message } — need to fetch CSV from the S3 URL
  let csvText: string;
  if (typeof response === 'string') {
    csvText = response;
  } else if (response?.url) {
    const csvFetch = await fetch(response.url);
    if (!csvFetch.ok) throw new Error(`Failed to fetch price CSV: ${csvFetch.status}`);
    csvText = await csvFetch.text();
  } else {
    console.error('[tradeprint] Unexpected price list response:', JSON.stringify(response).slice(0, 500));
    return new Map();
  }

  const prices = parsePriceCsv(csvText, specs, serviceLevel);

  priceCache.set(cacheKey, { prices, fetchedAt: Date.now() });
  return prices;
}

/**
 * Get trade price for a specific quantity.
 * Returns unit price in pence (ex-VAT), or null if quantity not available.
 */
export async function getTradePrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
  serviceLevel: string = 'standard'
): Promise<number | null> {
  const prices = await getTradePrices(productName, specs, serviceLevel);
  return prices.get(quantity) ?? null;
}

/**
 * Get available quantities for a product using the dedicated quantities API.
 * Much lighter than fetching the full price CSV.
 */
export async function getAvailableQuantities(
  productId: string,
  specs: Record<string, string>,
  serviceLevel: string = 'Standard'
): Promise<number[]> {
  const SDK = getSDK();

  try {
    const productService = new SDK.ProductService();
    const response = await productService
      .productQuantitiesRequest()
      .setProductId(productId)
      .setServiceLevel(serviceLevel)
      .setProductionData(specs)
      .execute();

    // Response is an object with numeric keys: {0: 50, 1: 100, 2: 200, ...}
    // or possibly an array — handle both formats
    const rawValues = Array.isArray(response)
      ? response
      : typeof response === 'object' && response !== null
        ? Object.values(response)
        : [];
    const quantities: number[] = rawValues
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);

    return quantities.sort((a, b) => a - b);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tradeprint] Quantities request failed for ${productId}: ${msg}`);
    return [];
  }
}

/**
 * Get expected delivery date from Tradeprint.
 */
export async function getDeliveryEstimate(
  productId: string,
  serviceLevel: string,
  quantity: number,
  productionData: Record<string, string>,
  postcode: string
): Promise<{ date: string; formattedDate: string } | null> {
  const SDK = getSDK();

  try {
    const productService = new SDK.ProductService();
    const response = await productService
      .getExpectedDeliveryDateRequest()
      .setProductId(productId)
      .setServiceLevel(capitaliseServiceLevel(serviceLevel))
      .setArtworkService('Just Print')
      .setProductionData(productionData)
      .setQuantity(quantity)
      .setDeliveryAddressPostcode(postcode)
      .execute();

    return {
      date: response.expectedDate ?? response.formattedDate,
      formattedDate: response.formattedDate,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tradeprint] Delivery estimate failed: ${msg}`);
    return null;
  }
}

/**
 * Validate an order before submission.
 */
export async function validateOrder(orderData: TradeprintOrderInput): Promise<{ valid: boolean; errors?: string[] }> {
  const SDK = getSDK();

  try {
    const orderService = new SDK.OrderService();
    const request = orderService
      .validateOrderRequest()
      .setOrderReference(orderData.orderReference)
      .setCurrency('GBP')
      .setBillingAddress(orderData.billingAddress);

    for (const item of orderData.items) {
      const orderItem = request
        .addOrderItem()
        .addFileUrl(item.fileUrl)
        .setArtworkService('Just Print')
        .setServiceLevel(capitaliseServiceLevel(item.serviceLevel))
        .setProductId(item.productId)
        .setQuantity(item.quantity)
        .setProductionData(item.productionData)
        .setDeliveryAddress(item.deliveryAddress);
      if (item.partnerContactDetails) {
        orderItem.setPartnerContactDetails(item.partnerContactDetails);
      }
      if (item.extraData) {
        orderItem.setExtraData(item.extraData);
      }
    }

    await request.execute();
    return { valid: true };
  } catch (err: unknown) {
    const message = (err as { errorMessage?: string })?.errorMessage
      ?? (err instanceof Error ? err.message : String(err));
    return { valid: false, errors: [message] };
  }
}

/**
 * Submit an order to Tradeprint.
 */
export async function submitOrder(orderData: TradeprintOrderInput): Promise<{ orderRef: string }> {
  const SDK = getSDK();

  const orderService = new SDK.OrderService();
  const request = orderService
    .submitNewOrderRequest()
    .setOrderReference(orderData.orderReference)
    .setCurrency('GBP')
    .setBillingAddress(orderData.billingAddress);

  for (const item of orderData.items) {
    const orderItem = request
      .addOrderItem()
      .addFileUrl(item.fileUrl)
      .setArtworkService('Just Print')
      .setServiceLevel(capitaliseServiceLevel(item.serviceLevel))
      .setProductId(item.productId)
      .setQuantity(item.quantity)
      .setProductionData(item.productionData)
      .setDeliveryAddress(item.deliveryAddress);
    if (item.partnerContactDetails) {
      orderItem.setPartnerContactDetails(item.partnerContactDetails);
    }
    if (item.extraData) {
      orderItem.setExtraData(item.extraData);
    }
  }

  const response = await request.execute();
  return { orderRef: response.orderReference ?? orderData.orderReference };
}

/**
 * Get order status from Tradeprint.
 */
export async function getOrderStatus(orderRef: string): Promise<TradeprintOrderStatus | null> {
  const SDK = getSDK();

  try {
    const orderService = new SDK.OrderService();
    const response = await orderService
      .getOrderStatusByIdRequest(orderRef)
      .execute();

    return {
      status: response.status?.toLowerCase() ?? 'unknown',
      trackingNumber: response.trackingNumber ?? null,
      trackingUrl: response.trackingUrl ?? null,
      estimatedDeliveryDate: response.expectedDeliveryDate ?? null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tradeprint] Get order status failed: ${msg}`);
    return null;
  }
}

// ── Types ──

export interface TradeprintOrderInput {
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
    extraData?: Record<string, string>;
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

export interface TradeprintOrderStatus {
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryDate: string | null;
}

// ── Helpers ──

export function capitaliseServiceLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

/**
 * Parse Tradeprint CSV price list.
 *
 * Actual CSV format (one row per spec+quantity combination):
 *   "ProductName","ProductID","Quantity","Tax","Paper Type","Size","Sides Printed",
 *   "Lamination","Sets","PriceExpress","Production Days Express","PriceStandard",
 *   "Production Days Standard","PriceSaver","Production Days Saver", ...
 *
 * Prices are TOTAL price in pence for the given quantity.
 * We match rows by spec columns and return Map<quantity, unitPriceInPence>.
 */
function parsePriceCsv(csv: string, specs: Record<string, string>, serviceLevel: string = 'standard'): Map<number, number> {
  const prices = new Map<number, number>();
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return prices;

  const headers = parseCSVLine(lines[0]);

  // Build column index map
  const colIndex = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    colIndex.set(headers[i].trim(), i);
  }

  // Find the price column for the requested service level
  const priceColName = `Price${capitaliseServiceLevel(serviceLevel)}`;
  const priceIdx = colIndex.get(priceColName);
  const qtyIdx = colIndex.get('Quantity');
  if (priceIdx === undefined || qtyIdx === undefined) return prices;

  // Spec columns we need to match against
  const specEntries = Object.entries(specs);

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCSVLine(lines[r]);

    // Check all spec values match
    let matches = true;
    for (const [specName, specValue] of specEntries) {
      const idx = colIndex.get(specName);
      if (idx !== undefined && cols[idx]?.trim() !== specValue) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const qty = parseInt(cols[qtyIdx]?.trim(), 10);
      const totalPrice = parseFloat(cols[priceIdx]?.trim());
      if (!isNaN(qty) && qty > 0 && !isNaN(totalPrice) && totalPrice > 0) {
        // Total price is in pence — convert to unit price in pence
        const unitPrice = Math.round(totalPrice / qty);
        prices.set(qty, unitPrice);
      }
    }
  }

  return prices;
}

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
