/**
 * Web Proxy Engine for Safe Browser Sandboxing
 * Proxies external web URLs, injects the browser MCP bridge for DOM inspection
 * and interactive event dispatching, and handles link rewrites.
 */

import { Request, Response } from 'express';
import { browserState } from './browser-state.js';

export class ProxyEngine {
  public static async handleProxy(req: Request, res: Response) {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).send('Missing "url" parameter');
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
    } catch (err: any) {
      return res.status(400).send(`Invalid URL: ${rawUrl}`);
    }

    const startTime = Date.now();

    try {
      const response = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
        },
        redirect: 'follow',
      });

      const contentType = response.headers.get('content-type') || 'text/html';
      const durationMs = Date.now() - startTime;

      browserState.addNetworkLog({
        tabId: (req.query.tabId as string) || browserState.getActiveTab().id,
        url: targetUrl.toString(),
        method: 'GET',
        status: response.status,
        durationMs,
        type: contentType.split(';')[0],
      });

      // Pass non-HTML resources (images, css, js) directly
      if (!contentType.includes('text/html')) {
        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(Buffer.from(buffer));
      }

      let html = await response.text();

      // Clean headers that prevent framing
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Inject Base tag if not present to resolve relative URLs
      const origin = targetUrl.origin;
      const baseTag = `<base href="${targetUrl.href}">`;

      // Bridge script injected into the proxied page to report interactive elements
      // and accept click/type commands from the parent browser application
      const bridgeScript = `
        <script id="__mcp_browser_bridge__">
          (function() {
            try {
              window.__IS_MCP_BROWSER_PAGE__ = true;

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

              function sendDomSnapshot() {
                var interactive = collectInteractiveElements();
                var textExcerpt = document.body ? document.body.innerText.substring(0, 2000) : '';
                var snapshot = {
                  url: window.location.href,
                  title: document.title || 'Untitled Page',
                  interactiveElements: interactive,
                  simplifiedTree: interactive.map(function(el) {
                    return el.refId + ' <' + el.tagName + (el.type ? ' type="' + el.type + '"' : '') + '> ' + (el.text ? '"' + el.text + '"' : '') + (el.placeholder ? ' placeholder="' + el.placeholder + '"' : '');
                  }).join('\\n'),
                  textExcerpt: textExcerpt,
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
                        commandId: data.commandId,
                        success: true,
                        elementDesc: targetNode.tagName.toLowerCase() + (targetNode.id ? '#' + targetNode.id : '')
                      }, '*');
                    }, 100);
                  } else {
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
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
                      commandId: data.commandId,
                      success: true
                    }, '*');
                  } else {
                    window.parent.postMessage({
                      type: 'MCP_COMMAND_COMPLETED',
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
                      commandId: data.commandId,
                      success: true
                    }, '*');
                  }, 250);
                }

                if (data.type === 'MCP_REQUEST_DOM') {
                  sendDomSnapshot();
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
            <p>Trang web <code>${targetUrl.toString()}</code> không phản hồi hoặc chặn yêu cầu proxy (CORS/Bot protection).</p>
            <p><strong>Lỗi chi tiết:</strong> ${err?.message || 'Network Timeout'}</p>
            <p>Trình duyệt vẫn đang đứng ở đúng địa chỉ vừa mở. Đừng chuyển sang các trang mẫu (NovaTech Store, AeroSearch) để thay thế trang này — đó chỉ là trang test demo.</p>
            <p>Nếu trang thật chặn lớp proxy (hay gặp với Taobao, 1688, Tmall), hãy tải lại hoặc dùng phiên Chrome thật trên máy chủ. Các trang mẫu <code>browser://store</code> / <code>browser://search</code> không phải nhà cung cấp thật.</p>
          </div>
        </body>
        </html>
      `);
    }
  }
}
