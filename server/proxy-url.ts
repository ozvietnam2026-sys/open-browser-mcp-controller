/**
 * URL rewrite helpers for routing page fetch/XHR through /api/browser/proxy.
 * Pure functions are unit-tested; buildFetchRewriteSnippet() embeds the same rules
 * into the MCP bridge IIFE injected into proxied HTML documents.
 *
 * Note: this HTTP proxy does not maintain a cookie jar — logged-in site sessions
 * still will not persist through the proxy in this pass.
 */

export const PROXY_PATH = '/api/browser/proxy';

const NON_HTTP_SCHEMES = new Set(['data:', 'blob:', 'about:', 'javascript:']);

export type ProxyRewriteResult = {
  shouldRewrite: boolean;
  resolvedHref: string;
  proxiedUrl?: string;
};

/**
 * Decide whether a page-initiated request URL should go through the controller proxy.
 * @param url - URL as passed to fetch/XHR (may be relative)
 * @param baseUri - document.baseURI (real site after <base href> injection)
 * @param controllerOrigin - window.location.origin of the iframe (controller host)
 */
export function resolveProxyRewrite(
  url: string,
  baseUri: string,
  controllerOrigin: string
): ProxyRewriteResult {
  let resolved: URL;
  try {
    resolved = new URL(url, baseUri);
  } catch {
    return { shouldRewrite: false, resolvedHref: String(url) };
  }

  const href = resolved.href;
  const protocol = resolved.protocol.toLowerCase();

  if (NON_HTTP_SCHEMES.has(protocol)) {
    return { shouldRewrite: false, resolvedHref: href };
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    return { shouldRewrite: false, resolvedHref: href };
  }

  const isProxyPath =
    resolved.pathname === PROXY_PATH || resolved.pathname.startsWith(`${PROXY_PATH}/`);

  if (isProxyPath) {
    // Already correctly proxied on the controller origin: leave alone.
    if (resolved.origin === controllerOrigin) {
      return { shouldRewrite: false, resolvedHref: href };
    }
    // Mis-resolved against <base href> (e.g. https://www.taobao.com/api/browser/proxy?...):
    // send it back to the controller origin, keeping the existing query.
    const proxiedUrl = `${controllerOrigin}${PROXY_PATH}${resolved.search}`;
    return { shouldRewrite: true, resolvedHref: href, proxiedUrl };
  }

  // Same-origin controller paths (/api/mcp, /api/agent, /api/browser/events, …) stay direct
  if (resolved.origin === controllerOrigin) {
    return { shouldRewrite: false, resolvedHref: href };
  }

  // Must be absolute: a path-absolute URL would resolve against <base href> (the real site).
  const proxiedUrl = `${controllerOrigin}${PROXY_PATH}?url=${encodeURIComponent(href)}`;
  return { shouldRewrite: true, resolvedHref: href, proxiedUrl };
}

/**
 * Build the absolute target URL from the proxy query param for SSRF / fetch.
 */
export function normalizeProxyTargetUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) throw new Error('Missing url');
  const withScheme = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return new URL(withScheme).href;
}

/**
 * Headers that must never be forwarded from the incoming controller request
 * to the upstream target (cookie / auth leakage prevention).
 */
export const PROXY_BLOCKED_REQUEST_HEADERS = new Set([
  'cookie',
  'cookie2',
  'authorization',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'content-length',
  'proxy-authorization',
  'proxy-connection',
  // MCP / controller auth
  'mcp-session-id',
  'x-mcp-token',
]);

const SAFE_FORWARD_HEADERS = new Set(['content-type', 'accept', 'accept-language']);

/**
 * Pick safe outbound headers for an upstream proxy fetch.
 * Forwards Content-Type / Accept / Accept-Language and custom X-* (except blocked).
 * Never forwards Cookie / Authorization / Hop-by-hop / MCP auth headers.
 */
export function buildOutboundProxyHeaders(
  incoming: Record<string, string | string[] | undefined>,
  userAgent: string
): Record<string, string> {
  const out: Record<string, string> = {
    'User-Agent': userAgent,
  };

  for (const [rawKey, rawVal] of Object.entries(incoming)) {
    const key = rawKey.toLowerCase();
    if (PROXY_BLOCKED_REQUEST_HEADERS.has(key)) continue;
    const value = Array.isArray(rawVal) ? rawVal[0] : rawVal;
    if (typeof value !== 'string' || !value) continue;

    if (SAFE_FORWARD_HEADERS.has(key) || key.startsWith('x-')) {
      // Preserve conventional casing for common headers; keep x-* as-is lowercased key is fine for fetch
      if (key === 'content-type') out['Content-Type'] = value;
      else if (key === 'accept') out['Accept'] = value;
      else if (key === 'accept-language') out['Accept-Language'] = value;
      else out[rawKey] = value;
    }
  }

  return out;
}

export const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * JS snippet injected into the bridge IIFE (after __IS_MCP_BROWSER_PAGE__).
 * Mirrors resolveProxyRewrite rules. Does not patch WebSocket.
 */
export function buildFetchRewriteSnippet(): string {
  return `
              // Route cross-origin fetch/XHR through the controller proxy (CORS bypass).
              // WebSockets are intentionally left alone. No cookie jar in this pass.
              (function patchFetchAndXhr() {
                var PROXY_PATH = ${JSON.stringify(PROXY_PATH)};
                var controllerOrigin = window.location.origin;

                function resolveRewrite(url) {
                  try {
                    var resolved = new URL(url, document.baseURI);
                    var protocol = resolved.protocol.toLowerCase();
                    if (protocol === 'data:' || protocol === 'blob:' || protocol === 'about:' || protocol === 'javascript:') {
                      return null;
                    }
                    if (protocol !== 'http:' && protocol !== 'https:') return null;
                    if (resolved.pathname === PROXY_PATH || resolved.pathname.indexOf(PROXY_PATH + '/') === 0) {
                      if (resolved.origin === controllerOrigin) return null;
                      // Mis-resolved against <base href>: send back to controller origin.
                      return controllerOrigin + PROXY_PATH + resolved.search;
                    }
                    if (resolved.origin === controllerOrigin) return null;
                    return controllerOrigin + PROXY_PATH + '?url=' + encodeURIComponent(resolved.href);
                  } catch (e) {
                    return null;
                  }
                }

                if (typeof window.fetch === 'function') {
                  var origFetch = window.fetch.bind(window);
                  window.fetch = function(input, init) {
                    try {
                      var url = typeof input === 'string' ? input : (input && input.url);
                      if (url) {
                        var rewritten = resolveRewrite(url);
                        if (rewritten) {
                          if (typeof input === 'string') {
                            return origFetch(rewritten, init);
                          }
                          try {
                            return origFetch(new Request(rewritten, input), init);
                          } catch (e2) {
                            return origFetch(rewritten, init);
                          }
                        }
                      }
                    } catch (e3) { /* fall through */ }
                    return origFetch(input, init);
                  };
                }

                if (typeof window.XMLHttpRequest === 'function') {
                  var OrigXHR = window.XMLHttpRequest;
                  function PatchedXHR() {
                    var xhr = new OrigXHR();
                    var origOpen = xhr.open;
                    xhr.open = function(method, url) {
                      var args = Array.prototype.slice.call(arguments);
                      if (typeof url === 'string') {
                        var rewritten = resolveRewrite(url);
                        if (rewritten) args[1] = rewritten;
                      }
                      return origOpen.apply(xhr, args);
                    };
                    return xhr;
                  }
                  PatchedXHR.prototype = OrigXHR.prototype;
                  PatchedXHR.UNSENT = OrigXHR.UNSENT;
                  PatchedXHR.OPENED = OrigXHR.OPENED;
                  PatchedXHR.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED;
                  PatchedXHR.LOADING = OrigXHR.LOADING;
                  PatchedXHR.DONE = OrigXHR.DONE;
                  window.XMLHttpRequest = PatchedXHR;
                }
              })();
`;
}
