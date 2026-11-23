/**
 * Guard: "what does buying extras on an existing order cost" has ONE owner —
 * `priceOrderExtras` (src/server/services/order-extras-pricing.ts), which
 * mirrors `priceEntryClassChange` for the class-change top-up.
 *
 * This fails if `orders.previewExtras` / `orders.addExtras` stop calling the
 * shared function, if either hand-computes the platform fee itself instead
 * of taking it from `priceOrderExtras`'s return value, or if the extras page
 * sums a total client-side instead of reading the server preview.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const PRICING_OWNER = join(SRC, 'server', 'services', 'order-extras-pricing.ts');
const ORDERS_ROUTER = join(SRC, 'server', 'trpc', 'routers', 'orders.ts');
const EXTRAS_PAGE = join(
  SRC,
  'app',
  '(shows)',
  'shows',
  '[id]',
  'entries',
  '[entryId]',
  'extras',
  'page.tsx',
);

describe('order-extras pricing — one owner', () => {
  it('the pricing rule itself lives in exactly one file', () => {
    const src = readFileSync(PRICING_OWNER, 'utf8');
    expect(src).toContain('export async function priceOrderExtras');
    expect(src).toContain('calculatePlatformFee(');
  });

  it('orders.ts previewExtras/addExtras call the extracted pricing function and never compute the platform fee themselves', () => {
    const src = readFileSync(ORDERS_ROUTER, 'utf8');
    expect(src).toMatch(/import\s*\{\s*priceOrderExtras\s*\}\s*from\s*['"]@\/server\/services\/order-extras-pricing['"]/);

    const previewBody = src.slice(src.indexOf('previewExtras: protectedProcedure'), src.indexOf('addExtras: protectedProcedure'));
    const addBody = src.slice(src.indexOf('addExtras: protectedProcedure'), src.indexOf('list: protectedProcedure'));

    expect(previewBody).toContain('priceOrderExtras(');
    expect(addBody).toContain('priceOrderExtras(');

    // The platform fee for EXTRAS must come from priceOrderExtras' return
    // value (pricing.platformFeePence) — neither procedure may call
    // calculatePlatformFee itself, which would be a second copy of the rule.
    expect(previewBody).not.toContain('calculatePlatformFee(');
    expect(addBody).not.toContain('calculatePlatformFee(');
  });

  it('the extras page does not hand-sum a total client-side — it reads previewExtras', () => {
    const src = readFileSync(EXTRAS_PAGE, 'utf8');
    expect(src).toContain('previewExtras');
    expect(src).not.toMatch(/\.reduce\(\s*\([^)]*\)\s*=>\s*[^,]*\+\s*[^,]*\.?(unitPrice|priceInPence)/);
  });
});
