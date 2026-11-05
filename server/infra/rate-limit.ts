/** Token-bucket-ish per-key rate limiter. */
const buckets = new Map<string, { count: number; windowStart: number }>();

export function rateLimitAllow(key: string, limitPerMin: number): { ok: boolean; remaining: number; retryAfterSec?: number } {
  if (limitPerMin <= 0) return { ok: true, remaining: Infinity };
  const now = Date.now();
  const windowMs = 60_000;
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  if (b.count >= limitPerMin) {
    const retryAfterSec = Math.ceil((windowMs - (now - b.windowStart)) / 1000);
    return { ok: false, remaining: 0, retryAfterSec };
  }
  b.count += 1;
  return { ok: true, remaining: limitPerMin - b.count };
}
