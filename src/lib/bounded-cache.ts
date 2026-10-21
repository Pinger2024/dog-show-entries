/**
 * A module-level cache that cannot grow without bound.
 *
 * Next.js server processes are long-lived and serve every club, so a plain
 * `new Map()` at module scope is a slow memory leak: it accumulates one entry
 * per distinct key ever seen, for the lifetime of the process, and nothing
 * ever removes them. That is fine for a handful of fixed keys (a font file, a
 * single API token) and not fine for anything keyed by club, show, or URL.
 *
 * Least-recently-used eviction, implemented on Map's insertion order: reading
 * a key moves it to the end, and inserting past `maxEntries` drops the entry
 * at the front.
 */
export class BoundedCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxEntries: number) {
    if (maxEntries < 1) {
      throw new Error(`BoundedCache needs maxEntries >= 1, got ${maxEntries}`);
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    // Re-insert to mark this key as most recently used.
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // Delete first so an overwrite also counts as a use.
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      // Map iteration order is insertion order, so the first key is the LRU.
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}
