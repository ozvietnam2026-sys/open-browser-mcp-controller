import { classifyChallenge } from '../shared/challenge-state.js';
/**
 * Model Context Protocol (MCP) Server Implementation
 * Compliant with MCP 2024-11-05 Specification
 * Provides Server-Sent Events (SSE) and HTTP POST transports for AI Agents.
 */

import { Request, Response } from 'express';
import { browserState } from './browser-state.js';
import { MCP_BROWSER_TOOLS } from './mcp-browser-tools.js';
import { ALL_MCP_TOOLS, getVisibleTools, executeRegisteredTool } from './tools-registry.js';
import { getConfig } from './config.js';
import { formatReadProgress, sliceDocumentText } from '../shared/page-observation.js';
import { normalizeExtractSchema } from '../shared/listing-extract.js';

export { MCP_BROWSER_TOOLS };
export { ALL_MCP_TOOLS };

// Active SSE sessions for external MCP clients
const mcpSessions = new Map<
  string,
  {
    res: Response;
    createdAt: number;
  }
>();

export class McpServerHandler {
  // SSE Transport: GET /mcp/sse
  public static handleSse(req: Request, res: Response) {
    const sessionId = 'mcp-session-' + Math.random().toString(36).substring(2, 10);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    mcpSessions.set(sessionId, { res, createdAt: Date.now() });

    // Send the MCP endpoint event containing the message POST URI
    const messageUrl = `/mcp/messages?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

    // Keep-alive heartbeat every 15s (Vercel proxy / Fluid idle cut mitigation)
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    browserState.logMcp('inbound', 'sse_connect', { sessionId, messageUrl }, 'success');

    req.on('close', () => {
      clearInterval(keepAlive);
      mcpSessions.delete(sessionId);
      browserState.logMcp('inbound', 'sse_disconnect', { sessionId });
    });
  }

  // MCP Message Transport: POST /mcp/messages?sessionId=...
  public static async handleMessages(req: Request, res: Response) {
    const body = req.body;
    browserState.logMcp('inbound', body?.method || 'unknown', body, 'pending');

    const response = await McpServerHandler.processRpcMessage(body);
    browserState.logMcp('outbound', body?.method || 'unknown', response, response.error ? 'error' : 'success');

    res.json(response);
  }

  // Direct JSON-RPC endpoint: POST /api/mcp/rpc
  public static async handleDirectRpc(req: Request, res: Response) {
    const body = req.body;
    browserState.logMcp('inbound', body?.method || 'unknown', body, 'pending');

    const response = await McpServerHandler.processRpcMessage(body);
    browserState.logMcp('outbound', body?.method || 'unknown', response, response.error ? 'error' : 'success');
    res.json(response);
  }

  // Process incoming JSON-RPC 2.0 message
  public static async processRpcMessage(msg: any): Promise<any> {
    if (!msg || typeof msg !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: payload must be a JSON object' },
      };
    }

    const { id, method, params } = msg;

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'open-browser-mcp-server',
                version: getConfig().version,
              },
              capabilities: {
                tools: {
                  listChanged: false,
                },
                resources: {
                  subscribe: false,
                  listChanged: false,
                },
                prompts: {
                  listChanged: false,
                },
              },
            },
          };
        }

        case 'notifications/initialized': {
          return { jsonrpc: '2.0', id: null, result: {} };
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'tools/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: getVisibleTools(),
            },
          };
        }

        case 'tools/call': {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const toolResult = await McpServerHandler.executeTool(toolName, args);

          return {
            jsonrpc: '2.0',
            id,
            result: toolResult,
          };
        }

        case 'resources/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: [
                {
                  uri: 'browser://tabs/current',
                  name: 'Current Active Tab',
                  description: 'Information about the currently active browser tab.',
                  mimeType: 'application/json',
                },
                {
                  uri: 'browser://dom/current',
                  name: 'Current Page DOM Tree',
                  description: 'Simplified interactive elements and DOM snapshot of current tab.',
                  mimeType: 'text/plain',
                },
                {
                  uri: 'browser://console/logs',
                  name: 'Browser Console Logs',
                  description: 'Recent JavaScript console logs from the active page.',
                  mimeType: 'application/json',
                },
              ],
            },
          };
        }

        case 'resources/read': {
          const uri = params?.uri;
          if (uri === 'browser://tabs/current') {
            const activeTab = browserState.getActiveTab();
            return {
              jsonrpc: '2.0',
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(activeTab, null, 2),
                  },
                ],
              },
            };
          }
          if (uri === 'browser://dom/current') {
            const snapshot = browserState.getDomSnapshot();
            return {
              jsonrpc: '2.0',
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'text/plain',
                    text: snapshot?.simplifiedTree || 'No DOM snapshot loaded yet.',
                  },
                ],
              },
            };
          }
          if (uri === 'browser://console/logs') {
            const logs = browserState.getConsoleLogs();
            return {
              jsonrpc: '2.0',
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(logs, null, 2),
                  },
                ],
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Resource not found: ${uri}` },
          };
        }

        default: {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
        }
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err?.message || 'Internal MCP execution error' },
      };
    }
  }

  // Execute browser tool and return MCP content block
  public static async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const registered = await executeRegisteredTool(name, args);
    if (registered) return registered;

    switch (name) {
      case 'browser_navigate': {
        const { url, tabId } = args;
        if (!url) throw new Error('Missing parameter: url');
        const activeTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        const targetTabId = activeTab?.id || 'tab-1';

        browserState.navigateTab(targetTabId, url);
        const result = await browserState.waitForDocument(targetTabId);

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: result.success, url: browserState.getTab(targetTabId)?.url, observation: result.data, error: result.error }),
            },
          ],
        };
      }

      case 'browser_open_tab': {
        const { url, title } = args;
        const newTab = browserState.openTab(url || 'browser://search', title);
        await browserState.dispatchCommand('open_tab', { tabId: newTab.id, url: newTab.url });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Đã mở tab mới thành công: [${newTab.id}] "${newTab.title}" tại ${newTab.url}`,
            },
          ],
        };
      }

      case 'browser_close_tab': {
        const { tabId } = args;
        if (!tabId) throw new Error('Missing parameter: tabId');
        const closed = browserState.closeTab(tabId);
        await browserState.dispatchCommand('close_tab', { tabId });

        return {
          content: [
            {
              type: 'text',
              text: closed
                ? `✅ Đã đóng tab [${tabId}]. Tab active hiện tại: ${browserState.getActiveTab().id}`
                : `⚠️ Không thể đóng tab [${tabId}].`,
            },
          ],
        };
      }

      case 'browser_switch_tab': {
        const { tabId } = args;
        if (!tabId) throw new Error('Missing parameter: tabId');
        const switched = browserState.switchTab(tabId);
        await browserState.dispatchCommand('switch_tab', { tabId });

        return {
          content: [
            {
              type: 'text',
              text: switched
                ? `✅ Đã chuyển sang tab [${tabId}]: "${browserState.getActiveTab().title}"`
                : `❌ Không tìm thấy tab [${tabId}]`,
            },
          ],
        };
      }

      case 'browser_list_tabs': {
        const tabs = browserState.getAllTabs();
        const activeTab = browserState.getActiveTab();
        const formatted = tabs
          .map(
            (t) =>
              `- [${t.id}] ${t.id === activeTab.id ? '⭐ (ACTIVE) ' : ''}"${t.title}" | URL: ${t.url}`
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Danh sách các tab hiện tại (${tabs.length} tab):\n${formatted}`,
            },
          ],
        };
      }

      case 'browser_get_dom': {
        const { tabId, format = 'interactive_elements', offset } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        if (!targetTab) throw new Error(`Tab ${tabId} not found`);

        let snapshot = browserState.getDomSnapshot(targetTab.id);

        if (!snapshot) {
          const cmdResult = await browserState.dispatchCommand('evaluate', { getDom: true }, targetTab.id);
          if (cmdResult.data?.snapshot) {
            browserState.setDomSnapshot(targetTab.id, cmdResult.data.snapshot);
            snapshot = browserState.getDomSnapshot(targetTab.id);
          }
        }

        if (!snapshot) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(classifyChallenge(targetTab, undefined)),
              },
            ],
          };
        }

        // obmc-deep-read-20261107 — read-progress meta + paginated reads: the model must know
        // what it has NOT seen (long page, still-collapsed sections) instead of assuming completeness.
        const readOffset = Math.max(0, Math.min(Number.parseInt(String(offset ?? '0'), 10) || 0, 1_000_000));
        const totalLen = snapshot.textTotalLength ?? (snapshot.fullText ? snapshot.fullText.length : snapshot.textExcerpt.length);
        const readMeta = `\nTiến trình đọc: ${formatReadProgress({ read: readOffset + (format === 'text' ? sliceDocumentText(snapshot.fullText, snapshot.textExcerpt, readOffset).length : snapshot.textExcerpt.length), total: totalLen, collapsed: snapshot.collapsedControls })}\n`;

        if (format === 'interactive_elements') {
          const elementsList = snapshot.interactiveElements
            .map((el) => {
              const details = [
                el.text ? `"${el.text.trim().substring(0, 50)}"` : '',
                el.placeholder ? `placeholder="${el.placeholder}"` : '',
                el.value ? `value="${el.value}"` : '',
                el.name ? `name="${el.name}"` : '',
                el.id ? `id="${el.id}"` : '',
              ]
                .filter(Boolean)
                .join(' ');
              return `${el.refId} <${el.tagName}${el.type ? ` type="${el.type}"` : ''}> ${details}`;
            })
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `Quan sát: ${JSON.stringify(classifyChallenge(targetTab, snapshot))}\nTrang: "${snapshot.title}"\nURL: ${snapshot.url}${readMeta}\nCác phần tử tương tác (@ref) trên trang:\n${
                  elementsList || '(Không có phần tử tương tác)'
                }\n\n* Bạn có thể gọi tool "browser_click", "browser_type", "browser_hover", "browser_drag" bằng cách truyền tham số ref (ví dụ: ref: "@ref:1" hoặc "1").`,
              },
            ],
          };
        }

        if (format === 'text') {
          const chunk = sliceDocumentText(snapshot.fullText, snapshot.textExcerpt, readOffset);
          return {
            content: [
              {
                type: 'text',
                text: `Quan sát: ${JSON.stringify(classifyChallenge(targetTab, snapshot))}\nTiêu đề: ${snapshot.title}\nURL: ${snapshot.url}${readMeta}\nNội dung văn bản (offset ${readOffset}):\n${chunk}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Quan sát: ${JSON.stringify(classifyChallenge(targetTab, snapshot))}\nTiêu đề: ${snapshot.title}\nURL: ${snapshot.url}\n\nCấu trúc trang (Simplified Tree):\n${
                snapshot.simplifiedTree || snapshot.textExcerpt
              }`,
            },
          ],
        };
      }

      case 'browser_click': {
        const { ref, selector, x, y, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        if (!ref && !selector && (x === undefined || y === undefined)) {
          throw new Error('Cần cung cấp ít nhất một trong các tham số: ref, selector, hoặc (x, y)');
        }

        const cleanRef = ref ? (ref.startsWith('@ref:') ? ref : `@ref:${ref}`) : undefined;

        browserState.emitVisualAction({
          type: 'click',
          x,
          y,
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'click',
          { ref: cleanRef, selector, x, y },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã click vào ${cleanRef || selector || `tọa độ (${x}, ${y})`} trên trang "${targetTab?.title}". ${
                    result.data?.elementDesc ? `[Phần tử: ${result.data.elementDesc}]` : ''
                  }`
                : `❌ Lỗi khi click: ${result.error || 'Phần tử không tìm thấy hoặc bị ẩn'}`,
            },
          ],
        };
      }

      case 'browser_drag': {
        const { x, y, toX, toY, fromRef, fromSelector, toRef, toSelector, steps = 25, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        const norm = (r?: string) => (r ? (r.startsWith('@ref:') ? r : `@ref:${r}`) : undefined);
        const hasFrom = (x !== undefined && y !== undefined) || fromRef || fromSelector;
        const hasTo = toX !== undefined || toY !== undefined || toRef || toSelector;
        if (!hasFrom || !hasTo) {
          throw new Error('browser_drag cần điểm đầu (x,y | fromRef | fromSelector) và điểm cuối (toX,toY | toRef | toSelector)');
        }
        browserState.emitVisualAction({ type: 'click', x, y, timestamp: Date.now() });
        const result = await browserState.dispatchCommand(
          'drag',
          {
            x, y, toX, toY: toY ?? y,
            fromRef: norm(fromRef), fromSelector, toRef: norm(toRef), toSelector,
            steps: Math.max(2, Number(steps) || 25),
          },
          targetTab?.id
        );
        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã kéo từ (${result.data?.from?.x}, ${result.data?.from?.y}) tới (${result.data?.to?.x}, ${result.data?.to?.y}) qua ${result.data?.steps} bước. Hãy chụp/đọc lại trang để xác nhận thử thách đã biến mất.`
                : `❌ Lỗi khi kéo: ${result.error || 'Không tìm thấy điểm bắt đầu'}`,
            },
          ],
        };
      }

      case 'browser_hover': {
        const { ref, selector, x, y, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        const cleanRef = ref ? (ref.startsWith('@ref:') ? ref : `@ref:${ref}`) : undefined;

        browserState.emitVisualAction({
          type: 'hover',
          x,
          y,
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'hover',
          { ref: cleanRef, selector, x, y },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã di chuột (hover) đến ${cleanRef || selector || `tọa độ (${x}, ${y})`}.`
                : `❌ Lỗi hover: ${result.error || 'Không tìm thấy phần tử'}`,
            },
          ],
        };
      }

      case 'browser_type': {
        const { text, ref, selector, clearFirst = true, pressEnter = false, tabId } = args;
        if (text === undefined) throw new Error('Missing parameter: text');
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const cleanRef = ref ? (ref.startsWith('@ref:') ? ref : `@ref:${ref}`) : undefined;

        browserState.emitVisualAction({
          type: 'type',
          text,
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'type',
          { text, ref: cleanRef, selector, clearFirst, pressEnter },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã gõ văn bản "${text}" vào ${cleanRef || selector || 'ô nhập liệu hiện tại'}.${
                    pressEnter ? ' (Đã gửi phím Enter)' : ''
                  }`
                : `❌ Lỗi khi gõ phím: ${result.error || 'Không tìm thấy ô nhập liệu'}`,
            },
          ],
        };
      }

      case 'browser_press_key': {
        const { key, ref, selector, tabId } = args;
        if (!key) throw new Error('Missing parameter: key');
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const cleanRef = ref ? (ref.startsWith('@ref:') ? ref : `@ref:${ref}`) : undefined;

        browserState.emitVisualAction({
          type: 'key',
          key,
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'press_key',
          { key, ref: cleanRef, selector },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã gửi phím "${key}" tới trang.`
                : `❌ Lỗi khi nhấn phím: ${result.error}`,
            },
          ],
        };
      }

      case 'browser_select_option': {
        const { ref, selector, value, label, index, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        const cleanRef = ref ? (ref.startsWith('@ref:') ? ref : `@ref:${ref}`) : undefined;

        const result = await browserState.dispatchCommand(
          'select_option',
          { ref: cleanRef, selector, value, label, index },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã chọn option ${value || label || `index=${index}`} trong thẻ select.`
                : `❌ Lỗi khi chọn option: ${result.error}`,
            },
          ],
        };
      }

      case 'browser_fill_form': {
        const { fields, submitAfter = false, submitRef, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const result = await browserState.dispatchCommand(
          'fill_form',
          { fields, submitAfter, submitRef },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Đã điền hàng loạt ${Object.keys(fields || {}).length} trường vào form thành công.${
                    submitAfter ? ' (Đã kích hoạt submit)' : ''
                  }`
                : `❌ Lỗi khi điền form: ${result.error}`,
            },
          ],
        };
      }

      case 'browser_wait_for': {
        const { selector, text, timeoutMs = 4000, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const result = await browserState.dispatchCommand(
          'wait_for',
          { selector, text, timeoutMs },
          targetTab?.id,
          timeoutMs + 2000
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `✅ Điều kiện chờ đạt yêu cầu: ${selector || text}`
                : `⚠️ Hết thời gian chờ (${timeoutMs}ms) cho: ${selector || text}`,
            },
          ],
        };
      }

      case 'browser_extract_content': {
        const { mode = 'structured', query, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const result = await browserState.dispatchCommand(
          'extract_content',
          { mode, query },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `Dữ liệu trích xuất [${mode}]:\n${JSON.stringify(result.data, null, 2)}`
                : `❌ Lỗi trích xuất: ${result.error}`,
            },
          ],
        };
      }

      case 'browser_extract_listings': {
        // obmc-extract-listings-20261107 — deterministic CSS-schema extraction, no LLM.
        // Values are verbatim page strings; missing fields stay empty; nothing is inferred.
        const { tabId } = args;
        const { schema, error: schemaError } = normalizeExtractSchema(args);
        if (schemaError || !schema) {
          return { isError: true, content: [{ type: 'text', text: `❌ Schema không hợp lệ: ${schemaError}` }] };
        }
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        if (!targetTab) throw new Error(`Tab ${tabId} not found`);
        const snapshot = browserState.getDomSnapshot(targetTab.id);
        const challenge = classifyChallenge(targetTab, snapshot);
        const result = await browserState.dispatchCommand(
          'extract_css',
          { baseSelector: schema.baseSelector, fields: schema.fields, maxRows: schema.maxRows },
          targetTab.id
        );
        const rows: Record<string, string>[] = result.data?.rows ?? [];
        if (!result.success || rows.length === 0) {
          return {
            isError: true,
            content: [{
              type: 'text',
              text: `Không trích được listing nào với baseSelector "${schema.baseSelector}".\nTrạng thái trang: ${challenge.state}\nURL: ${targetTab.url}\n${rows.length === 0 && result.success ? 'Selector khớp 0 ô — kiểm tra lại selector hoặc trang chưa tải listing.' : result.error || ''}\nKhông bịa dữ liệu thay thế.`,
            }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Trích listing theo CSS schema (không dùng LLM, chữ nguyên văn):\nTrạng thái trang: ${challenge.state}\nURL: ${targetTab.url}\nSố ô khớp: ${result.data?.matched ?? rows.length} · trả về: ${rows.length}\n\n${JSON.stringify(rows, null, 1)}`,
          }],
        };
      }

      case 'browser_scroll': {
        const { direction, amount = 400, tabId } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        browserState.emitVisualAction({
          type: 'scroll',
          direction,
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'scroll',
          { direction, amount },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success ? `✅ Đã cuộn trang: ${direction}` : `❌ ${result.error}`,
            },
          ],
        };
      }

      case 'browser_screenshot': {
        const { tabId, fullPage } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        browserState.emitVisualAction({
          type: 'screenshot',
          timestamp: Date.now(),
        });

        const result = await browserState.dispatchCommand(
          'screenshot',
          { fullPage },
          targetTab?.id
        );

        const dataUrl = result.success ? result.data?.dataUrl : undefined;

        if (dataUrl && dataUrl.startsWith('data:image/')) {
          const base64Data = dataUrl.split(',')[1];
          return {
            isError: !result.success,
            content: [
              {
                type: 'text',
                text: `Canvas mô phỏng (không phải pixel website): ${JSON.stringify({ tabId: targetTab?.id, url: targetTab?.url, navigationId: targetTab?.navigationId, simulated: true })}`,
              },
              {
                type: 'image',
                data: base64Data,
                mimeType: 'image/png',
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `❌ Không có ảnh được xác nhận: ${result.error || 'empty screenshot'}`,
            },
          ],
        };
      }

      case 'browser_evaluate': {
        const { script, tabId } = args;
        if (!script) throw new Error('Missing parameter: script');
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        const result = await browserState.dispatchCommand(
          'evaluate',
          { script },
          targetTab?.id
        );

        return {
          isError: !result.success,
          content: [
            {
              type: 'text',
              text: result.success
                ? `Kết quả thực thi JavaScript:\n${JSON.stringify(result.data?.result ?? 'undefined', null, 2)}`
                : `❌ Lỗi thực thi JavaScript: ${result.error}`,
            },
          ],
        };
      }

      case 'browser_history': {
        const { action, tabId } = args;
        const tab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        if (!tab) throw new Error('Tab not found');
        const changed = action === 'back' ? browserState.historyBack(tab.id) :
          action === 'forward' ? browserState.historyForward(tab.id) :
          action === 'reload' ? (browserState.reloadTab(tab.id), true) : false;
        const result = changed ? await browserState.waitForDocument(tab.id) :
          { success: false, error: 'History action unavailable' };
        return { isError: !result.success, content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      default:
        throw new Error(`Tool không được hỗ trợ: ${name}`);
    }
  }
}
