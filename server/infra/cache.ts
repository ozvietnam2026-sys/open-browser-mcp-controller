/** Simple in-memory TTL cache (Firecrawl ignoreCache / Jina X-Cache-Tolerance inspired). */
type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const MAX = 500;

export function cacheGet<T = unknown>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlSec: number) {
  if (ttlSec <= 0) return;
  if (store.size >= MAX) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export function cacheClear() {
  store.clear();
}

export function cacheStats() {
  return { size: store.size, max: MAX };
}
