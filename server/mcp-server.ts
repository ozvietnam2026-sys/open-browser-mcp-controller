/**
 * Model Context Protocol (MCP) Server Implementation
 * Compliant with MCP 2024-11-05 Specification
 * Provides Server-Sent Events (SSE) and HTTP POST transports for AI Agents.
 */

import { Request, Response } from 'express';
import { browserState } from './browser-state.js';
import { McpToolDefinition } from '../shared/browser-types.js';

// Comprehensive 18 MCP Browser Tools
export const MCP_BROWSER_TOOLS: McpToolDefinition[] = [
  {
    name: 'browser_navigate',
    description:
      'Điều hướng tab hiện tại (hoặc tab chỉ định) tới một địa chỉ URL mới (hỗ trợ https://, http://, hoặc browser://search, browser://store, browser://forms, browser://news).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Địa chỉ URL cần mở (ví dụ: https://wikipedia.org hoặc browser://store).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab cần điều hướng (tùy chọn, mặc định là tab đang active).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_open_tab',
    description: 'Mở một thẻ (tab) mới trong trình duyệt với URL tùy chọn và chuyển tiêu điểm sang tab đó.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL ban đầu của tab mới (mặc định là browser://search).',
        },
        title: {
          type: 'string',
          description: 'Tiêu đề ban đầu cho tab mới.',
        },
      },
    },
  },
  {
    name: 'browser_close_tab',
    description: 'Đóng một tab trình duyệt theo tabId.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần đóng.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Chuyển tab đang active sang một tab khác theo tabId.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab muốn chuyển sang.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_list_tabs',
    description: 'Lấy danh sách tất cả các tab đang mở cùng thông tin ID, URL, tiêu đề và trạng thái active.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_dom',
    description:
      'Đọc cây DOM, cấu trúc trang web, cây trợ năng và danh sách các phần tử tương tác (interactive elements) với mã tham chiếu duy nhất (@ref:1, @ref:2...) để click hoặc gõ phím chính xác.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần đọc (mặc định: tab active).',
        },
        format: {
          type: 'string',
          enum: ['interactive_elements', 'simplified', 'full', 'text'],
          description:
            'Định dạng trả về: "interactive_elements" (danh sách nút/input với mã @ref), "simplified" (cây phân cấp rút gọn), "text" (toàn bộ nội dung văn bản), hoặc "full".',
        },
      },
    },
  },
  {
    name: 'browser_click',
    description:
      'Thực hiện nhấp chuột (click) vào một phần tử trên trang bằng mã tham chiếu (@ref:N), CSS selector, hoặc tọa độ (x, y). Có kèm hiệu ứng hiển thị trực quan con trỏ chuột.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử lấy từ browser_get_dom (ví dụ: "@ref:3" hoặc "3").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử (ví dụ: "button.submit-btn" hoặc "#search-input").',
        },
        x: {
          type: 'number',
          description: 'Tọa độ X (pixel) trên viewport để nhấp chuột.',
        },
        y: {
          type: 'number',
          description: 'Tọa độ Y (pixel) trên viewport để nhấp chuột.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện (tùy chọn).',
        },
      },
    },
  },
  {
    name: 'browser_hover',
    description:
      'Di chuột (hover) vào một phần tử hoặc tọa độ trên trang để kích hoạt hiệu ứng hiển thị menu con, flyout dropdown hoặc tooltip.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử (ví dụ: "@ref:2").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử.',
        },
        x: {
          type: 'number',
          description: 'Tọa độ X (pixel).',
        },
        y: {
          type: 'number',
          description: 'Tọa độ Y (pixel).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_type',
    description:
      'Gõ văn bản vào ô nhập liệu (input, textarea) hoặc phần tử đang được chọn. Hỗ trợ xóa text cũ trước khi gõ và tùy chọn nhấn Enter sau khi hoàn thành.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Chuỗi văn bản cần nhập.',
        },
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của ô nhập liệu (ví dụ: "@ref:2" hoặc "2").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của ô nhập liệu.',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Xóa sạch nội dung cũ trong ô trước khi gõ (mặc định: true).',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Tự động gửi phím Enter sau khi nhập xong để submit form (mặc định: false).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện (tùy chọn).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_press_key',
    description:
      'Gửi phím bàn phím chuyên biệt (như Enter, Escape, Tab, ArrowDown, ArrowUp, Backspace, Space) tới phần tử đang focus hoặc toàn trang.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Tên phím cần nhấn (ví dụ: "Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Backspace").',
        },
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử cần nhận phím (tùy chọn).',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Chọn một giá trị (option) trong thẻ <select> dropdown bằng value, label hiển thị, hoặc vị trí index.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của thẻ <select> (ví dụ: "@ref:4").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của thẻ <select>.',
        },
        value: {
          type: 'string',
          description: 'Giá trị thuộc tính value của option cần chọn.',
        },
        label: {
          type: 'string',
          description: 'Nội dung hiển thị (text) của option cần chọn.',
        },
        index: {
          type: 'number',
          description: 'Vị trí index của option (0, 1, 2...).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_fill_form',
    description:
      'Điền hàng loạt các trường trong form (batch fill) cùng lúc, giúp tiết kiệm lượt gọi tool và tự động submit nếu cần.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description:
            'Bản đồ các trường cần điền, ví dụ: { "@ref:1": "Nguyễn Văn A", "#email": "a@example.com", "role": "developer" }.',
        },
        submitAfter: {
          type: 'boolean',
          description: 'Tự động bấm submit sau khi điền xong form (mặc định false).',
        },
        submitRef: {
          type: 'string',
          description: 'Mã @ref của nút submit cần bấm sau khi điền (nếu submitAfter = true).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'browser_wait_for',
    description:
      'Chờ đợi một phần tử hoặc văn bản cụ thể xuất hiện trên trang web trước khi thực hiện bước tiếp theo (hữu ích cho SPA và tải dữ liệu bất đồng bộ).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector cần chờ xuất hiện.',
        },
        text: {
          type: 'string',
          description: 'Đoạn văn bản cần chờ xuất hiện.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Thời gian chờ tối đa bằng mili-giây (mặc định 4000ms).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_extract_content',
    description:
      'Trích xuất dữ liệu có cấu trúc từ trang web: danh sách bài viết, bảng dữ liệu biểu đồ, danh sách sản phẩm, các liên kết quan trọng hoặc nội dung chính.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['structured', 'table', 'links', 'full_text'],
          description: 'Chế độ trích xuất dữ liệu.',
        },
        query: {
          type: 'string',
          description: 'Mô tả hoặc bộ chọn phạm vi cần trích xuất (tùy chọn).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_scroll',
    description: 'Cuộn trang web theo các hướng: down (xuống), up (lên), top (đầu trang), bottom (cuối trang) với khoảng cách pixel tùy chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['down', 'up', 'top', 'bottom'],
          description: 'Hướng cuộn trang.',
        },
        amount: {
          type: 'number',
          description: 'Khoảng cách cuộn tính bằng pixel (mặc định 400px). Không áp dụng khi cuộn top/bottom.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab cần cuộn.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Chụp ảnh màn hình viewport hiện tại của trình duyệt, trả về dữ liệu ảnh Base64 PNG kèm hiệu ứng chớp ống kính trong giao diện.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần chụp (tùy chọn).',
        },
        fullPage: {
          type: 'boolean',
          description: 'Chụp toàn bộ chiều dài trang nếu có thể.',
        },
      },
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Thực thi một đoạn mã JavaScript an toàn trong ngữ cảnh của trang hiện tại và trả về kết quả JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Đoạn mã JavaScript cần thực thi (ví dụ: "document.title" hoặc "window.location.href").',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_history',
    description: 'Điều hướng lịch sử duyệt web: quay lại trang trước (back), tiến tới trang sau (forward), hoặc tải lại trang (reload).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['back', 'forward', 'reload'],
          description: 'Hành động lịch sử.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['action'],
    },
  },
];

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

    // Keep-alive heartbeat every 35s (>= 30s)
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 35000);

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
                version: '2.0.0',
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
              tools: MCP_BROWSER_TOOLS,
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
    switch (name) {
      case 'browser_navigate': {
        const { url, tabId } = args;
        if (!url) throw new Error('Missing parameter: url');
        const activeTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        const targetTabId = activeTab?.id || 'tab-1';

        browserState.navigateTab(targetTabId, url);
        await browserState.dispatchCommand('navigate', { url }, targetTabId);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Đã điều hướng tab [${targetTabId}] đến: ${url}. Đang tải nội dung trang...`,
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
        const { tabId, format = 'interactive_elements' } = args;
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();
        if (!targetTab) throw new Error(`Tab ${tabId} not found`);

        let snapshot = browserState.getDomSnapshot(targetTab.id);

        if (!snapshot || snapshot.interactiveElements.length === 0) {
          const cmdResult = await browserState.dispatchCommand('evaluate', { getDom: true }, targetTab.id);
          if (cmdResult.data?.snapshot) {
            snapshot = cmdResult.data.snapshot;
          }
        }

        if (!snapshot) {
          return {
            content: [
              {
                type: 'text',
                text: `Trang hiện tại: "${targetTab.title}" (${targetTab.url})\nTrạng thái: Đang tải hoặc chưa có phần tử tương tác nào.`,
              },
            ],
          };
        }

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
                text: `Trang: "${snapshot.title}"\nURL: ${snapshot.url}\n\nCác phần tử tương tác (@ref) trên trang:\n${
                  elementsList || '(Không có phần tử tương tác)'
                }\n\n* Bạn có thể gọi tool "browser_click", "browser_type", "browser_hover" bằng cách truyền tham số ref (ví dụ: ref: "@ref:1" hoặc "1").`,
              },
            ],
          };
        }

        if (format === 'text') {
          return {
            content: [
              {
                type: 'text',
                text: `Tiêu đề: ${snapshot.title}\nURL: ${snapshot.url}\n\nNội dung văn bản:\n${snapshot.textExcerpt}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Tiêu đề: ${snapshot.title}\nURL: ${snapshot.url}\n\nCấu trúc trang (Simplified Tree):\n${
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
          content: [
            {
              type: 'text',
              text: `✅ Đã cuộn trang theo hướng: ${direction} (${direction === 'top' || direction === 'bottom' ? 'toàn bộ' : `${amount}px`}).`,
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

        const dataUrl = result.data?.dataUrl || browserState.getScreenshot(targetTab?.id);

        if (dataUrl && dataUrl.startsWith('data:image/')) {
          const base64Data = dataUrl.split(',')[1];
          return {
            content: [
              {
                type: 'text',
                text: `✅ Đã chụp ảnh màn hình trang "${targetTab?.title}" (${targetTab?.url}) thành công.`,
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
          content: [
            {
              type: 'text',
              text: `✅ Đã ghi nhận yêu cầu chụp ảnh màn hình trang "${targetTab?.title}". Viewport đã lưu ảnh snapshot.`,
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
        const targetTab = tabId ? browserState.getTab(tabId) : browserState.getActiveTab();

        if (action === 'back') {
          const success = browserState.historyBack(targetTab?.id);
          await browserState.dispatchCommand('history', { action: 'back' }, targetTab?.id);
          return {
            content: [
              {
                type: 'text',
                text: success
                  ? `✅ Đã quay lại trang trước (${targetTab?.url})`
                  : `⚠️ Không có trang trước trong lịch sử tab`,
              },
            ],
          };
        }

        if (action === 'forward') {
          const success = browserState.historyForward(targetTab?.id);
          await browserState.dispatchCommand('history', { action: 'forward' }, targetTab?.id);
          return {
            content: [
              {
                type: 'text',
                text: success
                  ? `✅ Đã tiến tới trang sau (${targetTab?.url})`
                  : `⚠️ Không có trang sau trong lịch sử tab`,
              },
            ],
          };
        }

        await browserState.dispatchCommand('history', { action: 'reload' }, targetTab?.id);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Đã tải lại trang "${targetTab?.title}"`,
            },
          ],
        };
      }

      default:
        throw new Error(`Tool không được hỗ trợ: ${name}`);
    }
  }
}
