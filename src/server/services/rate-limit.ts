/**
 * A small in-memory sliding-window limiter for the public endpoints that
 * create things for someone who isn't signed in.
 *
 * In memory is enough here: prod runs ONE web instance on the Node runtime
 * (Render srv-d6g578a4d50c73dj4rpg), so one process sees every request. A
 * restart forgets the counts, which is fine for a brake on abuse; it is not a
 * record of anything.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const fresh = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (fresh.length > 0) this.hits.set(key, fresh);
    else this.hits.delete(key);
    return fresh;
  }

  /** Would one more attempt for `key` stay within the limit? Records nothing. */
  allows(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length < this.limit;
  }

  /** Count one attempt for `key`. */
  record(key: string, now = Date.now()): void {
    const fresh = this.recent(key, now);
    fresh.push(now);
    this.hits.set(key, fresh);
    if (this.hits.size > 5_000) {
      for (const k of [...this.hits.keys()]) this.recent(k, now);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

const MINUTE = 60_000;

/**
 * Buying extras without signing in (Mandy, 15 Oct 2026) creates a person and
 * opens a Stripe payment for whoever asks, so it is limited per address, per
 * email and overall. Far above what a real show sees (a handful of no-dog
 * buyers a day); low enough to stop a script.
 */
const guestCheckoutLimits = {
  perIp: new SlidingWindowLimiter(10, 10 * MINUTE),
  perEmail: new SlidingWindowLimiter(5, 60 * MINUTE),
  overall: new SlidingWindowLimiter(60, MINUTE),
};

/**
 * One guest checkout attempt: true (and counted) when every limit allows it,
 * false (and not counted) when any is full. `ip` is null when the request
 * carried no address; those share one bucket.
 */
export function takeGuestCheckoutAttempt(who: { ip: string | null; email: string }, now = Date.now()): boolean {
  const ipKey = who.ip ?? 'unknown';
  const { perIp, perEmail, overall } = guestCheckoutLimits;
  if (!perIp.allows(ipKey, now) || !perEmail.allows(who.email, now) || !overall.allows('all', now)) {
    return false;
  }
  perIp.record(ipKey, now);
  perEmail.record(who.email, now);
  overall.record('all', now);
  return true;
}

/** Tests only: forget every count. */
export function resetGuestCheckoutLimits(): void {
  for (const limiter of Object.values(guestCheckoutLimits)) limiter.clear();
}

/**
 * The caller's address. Cloudflare sits in front of prod and sets
 * cf-connecting-ip; otherwise the first x-forwarded-for hop. A request sent
 * straight to the origin can claim any address, which is why the per-email
 * and overall limits also apply.
 */
export function clientIpFrom(headers: Headers): string | null {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get('x-real-ip')?.trim() || null;
}
