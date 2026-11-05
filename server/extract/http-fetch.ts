/**
 * Plain HTTP fetch helpers for extraction tools (Vercel-safe).
 * Adds: domain allow/block, UA/proxy env, cache, rate limit, content boundaries
 * (agent-browser / Jina / Firecrawl inspired).
 */
import { getConfig } from '../config.js';
import { cacheGet, cacheSet } from '../infra/cache.js';
import { rateLimitAllow } from '../infra/rate-limit.js';
import { assertDomainAllowed } from '../infra/domain-policy.js';

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  bodyText: string;
  bodyBytes: number;
  elapsedMs: number;
  fromCache?: boolean;
}

export function assertHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Only http/https URLs are allowed, got: ${u.protocol}`);
  }
  return u;
}

export async function fetchUrl(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    maxBytes?: number;
    timeoutMs?: number;
    followRedirects?: boolean;
    ignoreCache?: boolean;
    cacheTtlSec?: number;
  } = {}
): Promise<FetchResult> {
  const cfg = getConfig();
  const target = assertHttpUrl(url);
  assertDomainAllowed(target.toString(), cfg.allowedDomains, cfg.blockedDomains);

  const rl = rateLimitAllow(`fetch:${target.hostname}`, cfg.rateLimitPerMin);
  if (!rl.ok) {
    throw new Error(`Rate limit exceeded for ${target.hostname}. Retry after ${rl.retryAfterSec}s`);
  }

  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `http:${method}:${target.toString()}`;
  if (method === 'GET' && cfg.cacheEnabled && !options.ignoreCache) {
    const hit = cacheGet<FetchResult>(cacheKey);
    if (hit) return { ...hit, fromCache: true };
  }

  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const headers: Record<string, string> = {
      'User-Agent': cfg.stealthish
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        : cfg.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      ...(options.headers || {}),
    };

    // Note: Node fetch does not honor HTTP_PROXY natively without undici ProxyAgent.
    // We surface proxyUrl in metadata; long-running hosts can set global agent separately.
    const res = await fetch(target.toString(), {
      method,
      redirect: options.followRedirects === false ? 'manual' : 'follow',
      signal: controller.signal,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });

    const buf = Buffer.from(await res.arrayBuffer());
    const sliced = buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
    let bodyText = sliced.toString('utf8');
    if (cfg.contentBoundaries) {
      bodyText = `<obmc-content url="${res.url || target.toString()}">\n${bodyText}\n</obmc-content>`;
    }

    const result: FetchResult = {
      url: target.toString(),
      finalUrl: res.url || target.toString(),
      status: res.status,
      headers: outHeaders,
      contentType,
      bodyText,
      bodyBytes: sliced.byteLength,
      elapsedMs: Date.now() - started,
    };

    if (method === 'GET' && cfg.cacheEnabled && res.status >= 200 && res.status < 400) {
      cacheSet(cacheKey, result, options.cacheTtlSec ?? cfg.cacheTtlSec);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function truncate(text: string, max?: number): string {
  const cfg = getConfig();
  const limit = max ?? cfg.maxOutputChars;
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n…[truncated ${text.length - limit} chars]`;
}
