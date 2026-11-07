/**
 * Web Proxy Engine for Safe Browser Sandboxing
 * Proxies external web URLs (all HTTP methods), injects the browser MCP bridge for DOM
 * inspection and interactive event dispatching, rewrites page fetch/XHR through this
 * proxy to avoid CORS, and handles link rewrites.
 *
 * Cookie jar is intentionally not implemented in this pass — logged-in site sessions
 * still will not persist through the HTTP proxy.
 */

import { Request, Response } from 'express';
import { browserState } from './browser-state.js';
import { validateTargetUrlForSsrf } from './mcp-auth.js';
import {
  buildFetchRewriteSnippet,
  buildOutboundProxyHeaders,
  DESKTOP_CHROME_UA,
  normalizeProxyTargetUrl,
} from './proxy-url.js';

function getOutboundBody(req: Request): BodyInit | undefined {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return undefined;
  if (req.body === undefined || req.body === null || req.body === '') return undefined;
  if (Buffer.isBuffer(req.body)) return new Uint8Array(req.body);
  if (typeof req.body === 'string') return req.body;
  if (typeof req.body === 'object') {
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(req.body as Record<string, string>).toString();
    }
    return JSON.stringify(req.body);
  }
  return undefined;
}

export class ProxyEngine {
  public static async handleProxy(req: Request, res: Response) {
    // CORS preflight for proxied XHR/fetch from the iframe
    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] ||
          'Content-Type, Accept, Accept-Language, X-Requested-With'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).send('Missing "url" parameter');
    }

    let targetHref: string;
    try {
      targetHref = normalizeProxyTargetUrl(rawUrl);
    } catch {
      return res.status(400).send(`Invalid URL: ${rawUrl}`);
    }

    const ssrf = validateTargetUrlForSsrf(targetHref);
    if (!ssrf.valid) {
      return res.status(400).send(`Blocked target URL: ${ssrf.reason || 'SSRF policy'}`);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetHref);
    } catch {
      return res.status(400).send(`Invalid URL: ${rawUrl}`);
    }

    const method = (req.method || 'GET').toUpperCase();
    const startTime = Date.now();
    // Captured from the request, never retag an old response with the newest generation.
    const identity = { tabId: String(req.query.tabId || ''), url: targetUrl.href, navigationId: Number(req.query.navigationId ?? -1) };
    const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

    try {
      const outboundHeaders = buildOutboundProxyHeaders(
        req.headers as Record<string, string | string[] | undefined>,
        DESKTOP_CHROME_UA
      );

      // Document navigations need a navigate-like Accept when the page did not set one
      if (method === 'GET' && !outboundHeaders['Accept']) {
        outboundHeaders['Accept'] =
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
      }
      if (!outboundHeaders['Accept-Language']) {
        outboundHeaders['Accept-Language'] = 'vi,en-US;q=0.9,en;q=0.8';
      }

      const fetchInit: RequestInit = {
        method,
        headers: outboundHeaders,
        redirect: 'follow',
      };

      const body = getOutboundBody(req);
      if (body !== undefined) {
        fetchInit.body = body;
      }

      const response = await fetch(targetUrl.toString(), fetchInit);

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const durationMs = Date.now() - startTime;

      browserState.addNetworkLog({
        tabId: (req.query.tabId as string) || browserState.getActiveTab().id,
        url: targetUrl.toString(),
        method,
        status: response.status,
        durationMs,
        type: contentType.split(';')[0],
      });

      const isHtmlDocument =
        method === 'GET' && contentType.toLowerCase().includes('text/html');

      // Non-HTML (JSON, XHR, assets, etc.) and non-GET: forward status + body
      if (!isHtmlDocument) {
        const buffer = await response.arrayBuffer();
        res.status(response.status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (method === 'GET') {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        } else {
          res.setHeader('Cache-Control', 'no-store');
        }
        // Forward a few safe response headers useful to page JS
        const expose = response.headers.get('x-request-id') || response.headers.get('x-requested-with');
        if (expose) res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
        return res.send(Buffer.from(buffer));
      }

      let html = await response.text();

      // Clean headers that prevent framing
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.status(response.status);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Inject Base tag if not present to resolve relative URLs
      const baseTag = `<base href="${targetUrl.href}">`;
      const fetchRewrite = buildFetchRewriteSnippet();

      // Bridge script injected into the proxied page to report interactive elements
      // and accept click/type commands from the parent browser application
      const bridgeScript = `
        <script id="__mcp_browser_bridge__">
          (function() {
            try {
              window.__IS_MCP_BROWSER_PAGE__ = true;
${fetchRewrite}

              function collectInteractiveElements() {
                var selectors = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
                var nodes = Array.from(document.querySelectorAll(selectors));
                var elements = [];

                var refCounter = 1;
                nodes.forEach(function(node) {
                  // Check if visible
                  var rect = node.getBoundingClientRect();
                  var style = window.getComputedStyle(node);
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
                  if (rect.width === 0 && rect.height === 0) return;

                  var refId = '@ref:' + refCounter;
                  node.setAttribute('data-mcp-ref', refCounter);
                  node.setAttribute('data-mcp-ref-id', refId);

                  var textContent = (node.innerText || node.textContent || '').trim().replace(/\\s+/g, ' ');
                  var tagName = node.tagName.toLowerCase();
                  var isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

                  elements.push({
                    refId: refId,
                    index: refCounter,
                    tagName: tagName,
                    type: node.getAttribute('type') || (tagName === 'textarea' ? 'textarea' : undefined),
                    id: node.id || undefined,
                    name: node.name || undefined,
                    text: textContent.substring(0, 80),
                    value: isInput ? node.value : undefined,
                    placeholder: node.getAttribute('placeholder') || undefined,
                    href: node.getAttribute('href') || undefined,
                    ariaLabel: node.getAttribute('aria-label') || undefined,
                    boundingBox: {
                      x: Math.round(rect.left),
                      y: Math.round(rect.top),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height)
                    },
                    isClickable: true,
                    isInput: isInput,
                    selector: node.id ? '#' + node.id : (node.className ? tagName + '.' + node.className.trim().split(/\\s+/).slice(0, 2).join('.') : tagName)
                  });

                  refCounter++;
                });

                return elements;
              }

              // obmc-deep-read-20261107 v2 — reveal-only toggles, navigation-guarded, re-armed for late render.
              // Lesson from Made-in-China live: some "View More" buttons NAVIGATE (app promos) while the
              // real spec toggle shares the same label. A label match alone is not a safe signal:
              // 1) strongest: [aria-expanded="false"]; 2) label match confirmed by toggle-ish CLASS semantics;
              // 3) every click is navigation-guarded (auto history.back on href change).
              var EXPAND_LABEL_RE = /(view more|show more|show all|read more|see more|expand( all)?|查看更多|展开|显示更多|xem thêm)/i;
              function nodeVisible(n) {
                try {
                  var rect = n.getBoundingClientRect();
                  var style = window.getComputedStyle(n);
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                  return rect.width > 0 || rect.height > 0;
                } catch (e) { return false; }
              }
              function expandCandidates() {
                var seen = new Set();
                // v5: header/nav/footer mega-menu toggles also carry aria-expanded="false" and sit
                // BEFORE body content in DOM order — they burned the whole click budget (see expandLog
                // on MiC: mm-entry/cate-entrance/mm-item/upload-img-camera). Only content-region
                // toggles are expand candidates.
                var EXCLUDED_REGION = 'header, nav, footer, [role=navigation], [role=menu], [role=menubar], [aria-hidden="true"]';
                function inContentRegion(n) {
                  try { return !n.closest(EXCLUDED_REGION); } catch (e) { return false; }
                }
                var strong = Array.from(document.querySelectorAll('[aria-expanded="false"]')).filter(inContentRegion);
                var labeled = Array.from(document.querySelectorAll('button, [role="button"], div, span')).filter(function(n) {
                  if (n.closest('[aria-expanded]')) return false; // inner text of an aria toggle — strong set covers it
                  if (!inContentRegion(n)) return false;
                  var label = ((n.innerText || n.textContent || '') + ' ' + (n.getAttribute('aria-label') || '')).trim();
                  if (!label || label.length > 60) return false;
                  if (!EXPAND_LABEL_RE.test(label)) return false;
                  var cls = (typeof n.className === 'string') ? n.className : '';
                  if (!/toggle|expand|more|attrs/i.test(cls)) return false; // class must confirm reveal semantics
                  if (n.tagName === 'A' && n.getAttribute('href')) return false;
                  if (n.getAttribute('type') === 'submit') return false;
                  return true;
                });
                return labeled.concat(strong).filter(function(n) {
                  if (seen.has(n)) return false;
                  seen.add(n);
                  return nodeVisible(n);
                });
              }
              function nodeSignature(n) {
                return ((typeof n.className === 'string' ? n.className : '') + '|' +
                  (n.innerText || n.textContent || '').trim().substring(0, 40) + '|' + n.tagName);
              }
              function loadBlacklist() {
                try { return JSON.parse(sessionStorage.getItem('__mcp_expand_blacklist__') || '[]'); }
                catch (e) { return []; }
              }
              function isBlacklisted(n) {
                return loadBlacklist().indexOf(nodeSignature(n)) !== -1;
              }
              function blacklist(n) {
                try {
                  var bl = loadBlacklist();
                  bl.push(nodeSignature(n));
                  sessionStorage.setItem('__mcp_expand_blacklist__', JSON.stringify(bl.slice(-40)));
                } catch (e) {}
              }
              var expandBudget = 12;
              // v4: click ONE candidate at a time and verify no navigation happened before the next.
              // A bad sibling (app-promo "View More" that navigates) used to trigger history.back(),
              // which restored the page to its pre-expand state and wasted the whole pass.
              function autoExpandPass() {
                var cands = expandCandidates();
                var i = 0;
                function step() {
                  if (expandBudget <= 0 || i >= cands.length) return;
                  var node = cands[i++];
                  if (!node || !node.isConnected || isBlacklisted(node)) return step();
                  var hrefBefore = location.href;
                  expandBudget--;
                  var sig = ((typeof node.className === 'string' ? node.className : '') + ':' + (node.innerText || '').trim().substring(0, 24));
                  logExpand('click ' + sig);
                  try { node.click(); } catch (e) { logExpand('click failed ' + sig); return step(); }
                  setTimeout(function() {
                    if (location.href !== hrefBefore) {
                      logExpand('NAVIGATED -> blacklist + back: ' + sig + ' (' + hrefBefore + ' -> ' + location.href + ')');
                      blacklist(node);
                      try { history.back(); } catch (e) {}
                      setTimeout(step, 900); // let back() restore the document first
                    } else {
                      logExpand('ok ' + sig);
                      step();
                    }
                  }, 500);
                }
                step();
                return cands.length;
              }

              // obmc-shadow-pierce-20261107 — content hydrated inside shadow roots is visible to a
              // human but invisible to body.innerText/querySelectorAll; append shadow-only text.
              function shadowOnlyText() {
                var parts = [];
                try {
                  Array.from(document.querySelectorAll('*')).forEach(function(el) {
                    if (el.shadowRoot) {
                      var t = (el.shadowRoot.textContent || '').trim();
                      if (t) parts.push(t);
                    }
                  });
                } catch (e) {}
                return parts.join('\\n');
              }
              var expandLog = [];
              function logExpand(msg) {
                expandLog.push(msg);
                if (expandLog.length > 24) expandLog.shift();
                try { console.info('[mcp-expand] ' + msg); } catch (e) {}
              }

              function sendDomSnapshot() {
                var interactive = collectInteractiveElements();
                var bodyText = document.body ? document.body.innerText : '';
                var shadowText = shadowOnlyText();
                var combinedText = shadowText ? bodyText + '\\n' + shadowText : bodyText;
                var collapsed = 0;
                try { collapsed = expandCandidates().length; } catch (e) {}
                var snapshot = {
                  ...${safeJson(identity)},
                  documentUrl: ${safeJson(response.url || targetUrl.href)},
                  title: document.title || 'Untitled Page',
                  interactiveElements: interactive,
                  simplifiedTree: interactive.map(function(el) {
                    return el.refId + ' <' + el.tagName + (el.type ? ' type="' + el.type + '"' : '') + '> ' + (el.text ? '"' + el.text + '"' : '') + (el.placeholder ? ' placeholder="' + el.placeholder + '"' : '');
                  }).join('\\n'),
                  textExcerpt: combinedText.substring(0, 2000),
                  fullText: combinedText.substring(0, 64000),
                  textTotalLength: combinedText.length,
                  collapsedControls: collapsed,
                  hasShadowText: shadowText.length > 0,
                  expandLog: expandLog.slice(),
                  scrollPosition: {
                    x: window.scrollX,
                    y: window.scrollY,
                    maxScrollY: document.documentElement.scrollHeight - window.innerHeight
                  },
                  timestamp: Date.now()
                };

                window.parent.postMessage({
                  type: 'MCP_DOM_SNAPSHOT',
                  snapshot: snapshot
                }, '*');
              }

              // Intercept internal link clicks to route via proxy
              document.addEventListener('click', function(e) {
                var target = e.target.closest('a');
                if (target && target.href && !target.href.startsWith('javascript:') && !target.href.startsWith('#')) {
                  e.preventDefault();
                  window.parent.postMessage({
                    type: 'MCP_NAVIGATE_REQUEST',
                    url: target.href
                  }, '*');
                }
              }, true);

              // Listen for commands from parent window
              window.addEventListener('message', function(evt) {
                var data = evt.data;
                if (!data || !data.type) return;

                if (data.type === 'MCP_EXECUTE_CLICK') {
                  var targetNode = null;
                  if (data.ref) {
                    var num = data.ref.replace('@ref:', '');
                    targetNode = document.querySelector('[data-mcp-ref="' + num + '"]');
                  }
                  if (!targetNode && data.selector) {
                    targetNode = document.querySelector(data.selector);
                  }
                  if (!targetNode && typeof data.x === 'number' && typeof data.y === 'number') {
                    targetNode = document.elementFromPoint(data.x, data.y);
                  }

                  if (targetNode) {
                    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(function() {
                      targetNode.click();
                      if (typeof targetNode.focus === 'function') targetNode.focus();
                      sendDomSnapshot();
                      window.parent.postMessage({
                        type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                        commandId: data.commandId,
                        success: true,
                        elementDesc: targetNode.tagName.toLowerCase() + (targetNode.id ? '#' + targetNode.id : '')
                      }, '*');
                    }, 100);
                  } else {
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: false,
                      error: 'Không tìm thấy phần tử'
                    }, '*');
                  }
                }

                if (data.type === 'MCP_EXECUTE_TYPE') {
                  var inputNode = null;
                  if (data.ref) {
                    var num = data.ref.replace('@ref:', '');
                    inputNode = document.querySelector('[data-mcp-ref="' + num + '"]');
                  }
                  if (!inputNode && data.selector) {
                    inputNode = document.querySelector(data.selector);
                  }
                  if (!inputNode) {
                    inputNode = document.activeElement;
                  }

                  if (inputNode && (inputNode.tagName === 'INPUT' || inputNode.tagName === 'TEXTAREA' || inputNode.isContentEditable)) {
                    inputNode.focus();
                    if (data.clearFirst) {
                      inputNode.value = '';
                    }
                    inputNode.value = (inputNode.value || '') + (data.text || '');
                    inputNode.dispatchEvent(new Event('input', { bubbles: true }));
                    inputNode.dispatchEvent(new Event('change', { bubbles: true }));

                    if (data.pressEnter) {
                      inputNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                      inputNode.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                      inputNode.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                      if (inputNode.form) {
                        inputNode.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                      }
                    }

                    sendDomSnapshot();
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: true
                    }, '*');
                  } else {
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: false,
                      error: 'Không tìm thấy ô nhập liệu hợp lệ'
                    }, '*');
                  }
                }

                if (data.type === 'MCP_EXECUTE_SCROLL') {
                  var amount = data.amount || 400;
                  if (data.direction === 'down') window.scrollBy({ top: amount, behavior: 'smooth' });
                  else if (data.direction === 'up') window.scrollBy({ top: -amount, behavior: 'smooth' });
                  else if (data.direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
                  else if (data.direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

                  setTimeout(function() {
                    sendDomSnapshot();
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: true
                    }, '*');
                  }, 250);
                }

                if (data.type === 'MCP_REQUEST_DOM') {
                  sendDomSnapshot();
                }

                // obmc-extract-listings-20261107 — read-only CSS-schema extraction, no LLM:
                // baseSelector per listing card, fields = name/selector/attr; values are verbatim.
                if (data.type === 'MCP_EXECUTE_EXTRACT_CSS') {
                  var rows = [];
                  try {
                    var bases = Array.from(document.querySelectorAll(data.baseSelector));
                    rows = bases.slice(0, data.maxRows || 40).map(function(base) {
                      var row = {};
                      (data.fields || []).forEach(function(f) {
                        var el = f.selector ? base.querySelector(f.selector) : base;
                        var val = '';
                        if (el) val = (f.attr ? el.getAttribute(f.attr) : (el.textContent || '')) || '';
                        val = String(val).replace(/\\s+/g, ' ').trim().substring(0, 220);
                        row[f.name] = val;
                      });
                      return row;
                    });
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: true,
                      data: { rows: rows, matched: bases.length }
                    }, '*');
                  } catch (e) {
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
                      identity: ${safeJson(identity)},
                      commandId: data.commandId,
                      success: false,
                      error: 'Extract CSS lỗi: ' + (e && e.message ? e.message : String(e))
                    }, '*');
                  }
                }
              });

              // One delayed snapshot after load — avoid triple storm (DOMContentLoaded+load+timeout)
              var sent = false;
              function sendOnce() {
                if (sent) return;
                sent = true;
                sendDomSnapshot();
              }
              window.addEventListener('load', function() { setTimeout(sendOnce, 400); });
              setTimeout(sendOnce, 1200);
              // obmc-deep-read v2 — re-armed expand passes (toggles render late on lazy pages),
              // each followed by a snapshot; budget 8 clicks total; slow-AJAX safety re-send at the end.
              [1800, 3600, 6500].forEach(function(delay) {
                setTimeout(function() {
                  try { autoExpandPass(); } catch (e) {}
                  setTimeout(sendDomSnapshot, 1200);
                }, delay);
              });
              setTimeout(sendDomSnapshot, 9000);
            } catch(e) {
              console.error('MCP Bridge Error:', e);
            }
          })();
        </script>
      `;

      // Inject base tag and bridge script
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else {
        html = baseTag + html;
      }

      if (html.includes('</body>')) {
        html = html.replace('</body>', `${bridgeScript}</body>`);
      } else {
        html += bridgeScript;
      }

      return res.send(html);
    } catch (err: any) {
      // Fallback helpful error page
      return res.status(502).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Lỗi tải trang qua Proxy</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
            .card { max-width: 600px; margin: 40px auto; background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; }
            h2 { color: #f87171; margin-top: 0; }
            code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; margin-top: 16px; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚠️ Không thể kết nối tới trang web</h2>
            <p>Trang web <code>${escapeHtml(targetUrl.toString())}</code> không phản hồi hoặc chặn yêu cầu proxy (CORS/Bot protection).</p>
            <p><strong>Lỗi chi tiết:</strong> ${escapeHtml(err?.message || 'Network Timeout')}</p>
            <p>Giữ nguyên địa chỉ hiện tại; tải lại để thử kết nối. Không có dữ liệu sản phẩm để trích xuất.</p>
            <button onclick="window.location.reload()">Thử lại cùng URL</button>
          </div>
          <script>
            window.parent.postMessage({ type: 'MCP_DOM_SNAPSHOT', snapshot: {
              ...${safeJson(identity)}, title: 'Lỗi tải trang qua Proxy', interactiveElements: [], simplifiedTree: '',
              textExcerpt: 'Không thể kết nối tới trang web: fetch failed',
              scrollPosition: { x: 0, y: 0, maxScrollY: 0 }, timestamp: Date.now()
            } }, '*');
          </script>
        </body>
        </html>
      `);
    }
  }
}
