/**
 * Plain HTTP fetch helpers for extraction tools (Vercel-safe).
 */
export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  bodyText: string;
  bodyBytes: number;
  elapsedMs: number;
}

const DEFAULT_UA =
  'OpenBrowserMCP/3.0 (+https://github.com/ozvietnam2026-sys/open-browser-mcp-controller; research bot)';

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
  } = {}
): Promise<FetchResult> {
  const target = assertHttpUrl(url);
  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(target.toString(), {
      method: options.method || 'GET',
      redirect: options.followRedirects === false ? 'manual' : 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        ...(options.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const buf = Buffer.from(await res.arrayBuffer());
    const sliced = buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
    const bodyText = sliced.toString('utf8');

    return {
      url: target.toString(),
      finalUrl: res.url || target.toString(),
      status: res.status,
      headers,
      contentType,
      bodyText,
      bodyBytes: sliced.byteLength,
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function truncate(text: string, max = 50_000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`;
}
