import { McpToolDefinition } from '../../shared/browser-types.js';
import {
  playwrightAvailable,
  playwrightUnavailableMessage,
  getPage,
  buildA11ySnapshot,
  buildA11ySnapshotWithDelta,
  resolveRef,
  findInSnapshot,
  getNetworkLog,
  getNetworkRequest,
  clearNetworkLog,
  getConsoleLog,
  getConsoleMessage,
  clearConsoleLog,
  closePlaywright,
  connectOverCdp,
  getConnectionMode,
  applyEmulation,
  collectPerformanceMetrics,
  startPerformanceTrace,
  stopPerformanceTrace,
  startTrace,
  stopTrace,
  videoStatus,
  getBrowserEngine,
  evaluateScript,
  listTabs,
  openTab,
  switchTab,
  closeTab,
  installDialogHandler,
  getLastDialog,
  handleDialog,
  saveStorageState,
  loadStorageState,
  listCookies,
  setCookie,
  clearCookies,
  routeMock,
  unroute,
  listRoutes,
  uploadFiles,
  waitForDownload,
  mouseClickXY,
  mouseMoveXY,
  selectOption,
  fillForm,
  dragDrop,
  highlightRef,
} from './runtime.js';

export const MCP_PLAYWRIGHT_TOOLS: McpToolDefinition[] = [
  {
    name: 'pw_connect',
    description:
      'Playwright/CDP: connect to an existing debuggable Chrome (chrome-devtools-mcp --browserUrl / --wsEndpoint). Example browserURL http://127.0.0.1:9222. Docker/local only.',
    inputSchema: {
      type: 'object',
      properties: {
        browserURL: { type: 'string', description: 'http://127.0.0.1:9222' },
        wsEndpoint: { type: 'string', description: 'ws://…/devtools/browser/<id>' },
      },
    },
  },
  {
    name: 'pw_navigate',
    description:
      'Playwright: navigate real Chromium to a URL. Requires Docker/long-running host (not Vercel serverless).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle', 'commit'] },
      },
      required: ['url'],
    },
  },
  {
    name: 'pw_snapshot',
    description:
      'Playwright: accessibility snapshot with element refs (e1, e2…) like playwright-mcp, agent-browser, and chrome-devtools take_snapshot. Use refs with pw_click/pw_type.',
    inputSchema: {
      type: 'object',
      properties: {
        interactiveOnly: { type: 'boolean', description: 'Default true' },
        maxNodes: { type: 'number' },
        maxDepth: { type: 'number' },
        delta: { type: 'boolean', description: 'agent-browser --delta: only report changes vs last snapshot' },
      },
    },
  },
  {
    name: 'pw_find',
    description:
      'Find refs in the last pw_snapshot by role and/or name/text (P0 snapshot/ref standardization). Call pw_snapshot first.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'e.g. button, link, textbox' },
        name: { type: 'string', description: 'Substring match on accessible name' },
        text: { type: 'string', description: 'Alias of name' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_click',
    description: 'Playwright: click by ref from pw_snapshot (e.g. "e5") or a selector. Auto-snapshots after click.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Snapshot ref like e5 or @e5' },
        selector: { type: 'string' },
      },
    },
  },
  {
    name: 'pw_type',
    description: 'Playwright: type into element by ref or selector.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ref: { type: 'string' },
        selector: { type: 'string' },
        clearFirst: { type: 'boolean' },
        pressEnter: { type: 'boolean' },
      },
      required: ['text'],
    },
  },
  {
    name: 'pw_hover',
    description: 'Playwright: hover by ref or selector (chrome-devtools hover).',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        selector: { type: 'string' },
      },
    },
  },
  {
    name: 'pw_press',
    description: 'Playwright: press a key (Enter, Tab, Escape, Control+a…).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        ref: { type: 'string' },
        selector: { type: 'string' },
      },
      required: ['key'],
    },
  },
  {
    name: 'pw_wait',
    description: 'Wait for selector, text, timeout, or URL substring.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        urlIncludes: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_network',
    description: 'List captured network/XHR requests (chrome-devtools list_network_requests).',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'Clear log after read' },
        all: { type: 'boolean' },
        resourceType: { type: 'string', description: 'Filter e.g. xhr, fetch, document' },
      },
    },
  },
  {
    name: 'pw_network_request',
    description: 'Get one network request by id including headers/postData (chrome-devtools get_network_request).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'pw_console',
    description: 'List browser console messages + page errors (chrome-devtools list_console_messages).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter: log|error|warning|info|debug' },
        clear: { type: 'boolean' },
        all: { type: 'boolean' },
      },
    },
  },
  {
    name: 'pw_console_message',
    description: 'Get one console message by id (chrome-devtools get_console_message).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'pw_emulate',
    description:
      'Emulate viewport, colorScheme, geolocation, offline, extra headers (chrome-devtools emulate / resize_page).',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number' },
        height: { type: 'number' },
        colorScheme: { type: 'string', enum: ['light', 'dark', 'no-preference'] },
        offline: { type: 'boolean' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        userAgent: { type: 'string' },
        extraHTTPHeaders: { type: 'object' },
      },
    },
  },
  {
    name: 'pw_performance',
    description:
      'Collect lab performance metrics (Navigation Timing, paint, LCP, CDP Performance.getMetrics). Inspired by chrome-devtools performance_* tools.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['metrics', 'start_trace', 'stop_trace'],
          description: 'Default metrics',
        },
      },
    },
  },
  {
    name: 'pw_evaluate',
    description: 'Evaluate JavaScript in the page via CDP Runtime.evaluate (chrome-devtools evaluate_script).',
    inputSchema: {
      type: 'object',
      properties: { script: { type: 'string' } },
      required: ['script'],
    },
  },
  {
    name: 'pw_screenshot',
    description: 'Playwright: capture PNG screenshot (base64).',
    inputSchema: {
      type: 'object',
      properties: { fullPage: { type: 'boolean' } },
    },
  },
  {
    name: 'pw_pdf',
    description: 'Playwright: render current page to PDF (base64). Chromium only.',
    inputSchema: {
      type: 'object',
      properties: { landscape: { type: 'boolean' } },
    },
  },
  {
    name: 'pw_scroll',
    description: 'Playwright: scroll page or infinite-scroll N steps collecting heights.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] },
        amount: { type: 'number' },
        infiniteSteps: { type: 'number' },
        waitMs: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_trace_start',
    description:
      'Start Playwright context tracing (screenshots+snapshots). Docker/local only. Pair with pw_trace_stop for a ZIP artifact.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pw_trace_stop',
    description:
      'Stop tracing and write ZIP under OBMC_OUTPUT_DIR (open with npx playwright show-trace). Docker/local only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pw_video_status',
    description:
      'Show whether Playwright recordVideo is enabled (set OBMC_VIDEO=1 on Docker). Videos finalize when page/context closes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pw_status',
    description: 'Show Playwright connection mode (launch|cdp|persistent), engine (playwright|patchright), and current page URL.',
    inputSchema: { type: 'object', properties: {} },
  },

  {
    name: 'pw_tabs',
    description: 'List open tabs (playwright-mcp browser_tabs). Docker/local only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pw_tab_open',
    description: 'Open a new tab, optionally navigating to a URL.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
    },
  },
  {
    name: 'pw_tab_switch',
    description: 'Switch active tab by zero-based index.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number' } },
      required: ['index'],
    },
  },
  {
    name: 'pw_tab_close',
    description: 'Close a tab by index (default: active). Cannot close the last tab.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number' } },
    },
  },
  {
    name: 'pw_dialog',
    description: 'Install dialog handler / set accept|dismiss policy (playwright-mcp dialogs).',
    inputSchema: {
      type: 'object',
      properties: {
        accept: { type: 'boolean', description: 'true=accept, false=dismiss; omit to report last dialog' },
        promptText: { type: 'string' },
      },
    },
  },
  {
    name: 'pw_storage_state',
    description: 'Save cookies+localStorage storageState to JSON file or return inline (playwright-mcp --storage-state).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional file path; omit to return JSON' },
      },
    },
  },
  {
    name: 'pw_set_storage_state',
    description: 'Load storageState from a JSON file and relaunch context with it.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'pw_cookies',
    description: 'List, set, or clear cookies (storage capability).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'set', 'clear'] },
        name: { type: 'string' },
        value: { type: 'string' },
        domain: { type: 'string' },
        path: { type: 'string' },
        url: { type: 'string' },
      },
    },
  },
  {
    name: 'pw_route',
    description: 'Mock/intercept a URL pattern with custom status/body (playwright-mcp network routes).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'glob or string URL pattern' },
        status: { type: 'number' },
        body: { type: 'string' },
        contentType: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'pw_unroute',
    description: 'Remove a route mock (or all if url omitted).',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
    },
  },
  {
    name: 'pw_route_list',
    description: 'List active route mocks.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pw_upload',
    description: 'Upload local files to a file input via ref or selector (playwright-mcp uploads).',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        selector: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['paths'],
    },
  },
  {
    name: 'pw_download',
    description: 'Wait for a download (optionally click a ref first) and save under OBMC_DOWNLOAD_DIR.',
    inputSchema: {
      type: 'object',
      properties: {
        clickRef: { type: 'string' },
        clickSelector: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_select',
    description: 'Select option(s) on a <select> by ref or selector.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        selector: { type: 'string' },
        values: { type: 'array', items: { type: 'string' } },
      },
      required: ['values'],
    },
  },
  {
    name: 'pw_fill_form',
    description: 'Fill multiple fields in one call (ref/selector + value + optional type checkbox|radio|select).',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string' },
              selector: { type: 'string' },
              value: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'pw_drag',
    description: 'Drag from one element to another by ref/selector.',
    inputSchema: {
      type: 'object',
      properties: {
        fromRef: { type: 'string' },
        fromSelector: { type: 'string' },
        toRef: { type: 'string' },
        toSelector: { type: 'string' },
      },
    },
  },
  {
    name: 'pw_mouse_click_xy',
    description: 'Click at viewport coordinates (vision / screenshot-driven agents).',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'pw_mouse_move_xy',
    description: 'Move mouse to viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'pw_highlight',
    description: 'Outline a ref element for visual debugging (devtools).',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
    },
  },

  {
    name: 'pw_close',
    description: 'Close Playwright session. For CDP mode, detaches without quitting the user Chrome.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const PLAYWRIGHT_TOOL_NAMES = new Set(MCP_PLAYWRIGHT_TOOLS.map((t) => t.name));

function textResult(text: string, extra?: any[]) {
  return { content: [{ type: 'text', text }, ...(extra || [])] };
}

async function guard(tool: string, fn: () => Promise<any>) {
  if (!playwrightAvailable()) {
    return textResult(`❌ ${playwrightUnavailableMessage(tool)}`);
  }
  try {
    return await fn();
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (/Cannot find module 'playwright'|playwright/.test(msg) && /not installed|Cannot find/i.test(msg)) {
      return textResult(`❌ ${playwrightUnavailableMessage(tool)}`);
    }
    return textResult(`❌ Playwright error in ${tool}: ${msg}`);
  }
}

export async function executePlaywrightTool(name: string, args: Record<string, any>): Promise<any> {
  return guard(name, async () => {
    switch (name) {
      case 'pw_connect': {
        const info = await connectOverCdp({
          browserURL: args.browserURL,
          wsEndpoint: args.wsEndpoint,
        });
        return textResult(JSON.stringify({ ok: true, ...info }, null, 2));
      }
      case 'pw_navigate': {
        const p = await getPage();
        await p.goto(args.url, { waitUntil: args.waitUntil || 'domcontentloaded', timeout: 45000 });
        const snap = await buildA11ySnapshot({ interactiveOnly: true, maxNodes: 80 });
        return textResult(
          `Navigated to ${p.url()}\nTitle: ${snap.title}\n\nInteractive snapshot (truncated):\n${snap.snapshot.slice(0, 6000)}`
        );
      }
      case 'pw_snapshot': {
        const snap = await buildA11ySnapshotWithDelta({
          interactiveOnly: args.interactiveOnly !== false,
          maxNodes: args.maxNodes,
          maxDepth: args.maxDepth,
          delta: !!args.delta,
        });
        const deltaLine = snap.delta ? `Delta: ${JSON.stringify(snap.delta)}\n` : '';
        const body = (snap as any).deltaPreview && args.delta ? (snap as any).deltaPreview : snap.snapshot;
        return textResult(
          `URL: ${snap.url}\nTitle: ${snap.title}\nRefs: ${snap.refs}\n${deltaLine}\n${body}`
        );
      }
      case 'pw_find': {
        const hits = findInSnapshot({
          role: args.role,
          name: args.name,
          text: args.text,
          limit: args.limit,
        });
        return textResult(JSON.stringify({ count: hits.length, hits }, null, 2));
      }
      case 'pw_click': {
        const p = await getPage();
        const target = args.ref ? resolveRef(args.ref) : args.selector;
        if (!target) throw new Error('Provide ref or selector');
        await p.locator(target).first().click({ timeout: 15000 });
        const snap = await buildA11ySnapshot({ interactiveOnly: true, maxNodes: 60 });
        return textResult(`Clicked ${args.ref || args.selector}\n\n${snap.snapshot.slice(0, 4000)}`);
      }
      case 'pw_type': {
        const p = await getPage();
        const target = args.ref ? resolveRef(args.ref) : args.selector;
        if (!target) throw new Error('Provide ref or selector');
        const loc = p.locator(target).first();
        if (args.clearFirst !== false) await loc.fill('');
        await loc.type(args.text, { delay: 20 });
        if (args.pressEnter) await loc.press('Enter');
        return textResult(`Typed into ${args.ref || args.selector}`);
      }
      case 'pw_hover': {
        const p = await getPage();
        const target = args.ref ? resolveRef(args.ref) : args.selector;
        if (!target) throw new Error('Provide ref or selector');
        await p.locator(target).first().hover({ timeout: 15000 });
        return textResult(`Hovered ${args.ref || args.selector}`);
      }
      case 'pw_press': {
        const p = await getPage();
        if (args.ref || args.selector) {
          const target = args.ref ? resolveRef(args.ref) : args.selector;
          await p.locator(target).first().press(args.key, { timeout: 15000 });
        } else {
          await p.keyboard.press(args.key);
        }
        return textResult(`Pressed ${args.key}`);
      }
      case 'pw_wait': {
        const p = await getPage();
        const timeout = args.timeoutMs ?? 15000;
        if (args.selector) await p.waitForSelector(args.selector, { timeout });
        else if (args.text) await p.getByText(args.text).first().waitFor({ timeout });
        else if (args.urlIncludes) {
          await p.waitForFunction(
            (s) => location.href.includes(s),
            args.urlIncludes,
            { timeout }
          );
        } else await p.waitForTimeout(Math.min(timeout, 10000));
        return textResult(`Wait done. URL=${p.url()}`);
      }
      case 'pw_network': {
        let logs = getNetworkLog(!!args.all);
        if (args.resourceType) {
          logs = logs.filter((e) => e.resourceType === args.resourceType);
        }
        if (args.clear) clearNetworkLog();
        const slim = logs.map(({ id, method, url, status, resourceType, timestamp }) => ({
          id,
          method,
          url,
          status,
          resourceType,
          timestamp,
        }));
        return textResult(JSON.stringify({ count: slim.length, requests: slim }, null, 2));
      }
      case 'pw_network_request': {
        const entry = getNetworkRequest(Number(args.id));
        if (!entry) throw new Error(`No network request id=${args.id}`);
        return textResult(JSON.stringify(entry, null, 2));
      }
      case 'pw_console': {
        const logs = getConsoleLog({ type: args.type, all: !!args.all });
        if (args.clear) clearConsoleLog();
        return textResult(JSON.stringify({ count: logs.length, messages: logs }, null, 2));
      }
      case 'pw_console_message': {
        const msg = getConsoleMessage(Number(args.id));
        if (!msg) throw new Error(`No console message id=${args.id}`);
        return textResult(JSON.stringify(msg, null, 2));
      }
      case 'pw_emulate': {
        const result = await applyEmulation({
          viewport:
            args.width && args.height ? { width: args.width, height: args.height } : undefined,
          colorScheme: args.colorScheme,
          offline: args.offline,
          geolocation:
            args.latitude != null && args.longitude != null
              ? { latitude: args.latitude, longitude: args.longitude }
              : undefined,
          userAgent: args.userAgent,
          extraHTTPHeaders: args.extraHTTPHeaders,
        });
        return textResult(JSON.stringify(result, null, 2));
      }
      case 'pw_performance': {
        const action = args.action || 'metrics';
        if (action === 'start_trace') {
          return textResult(JSON.stringify(await startPerformanceTrace(), null, 2));
        }
        if (action === 'stop_trace') {
          return textResult(JSON.stringify(await stopPerformanceTrace(), null, 2));
        }
        return textResult(JSON.stringify(await collectPerformanceMetrics(), null, 2));
      }
      case 'pw_evaluate': {
        const value = await evaluateScript(args.script);
        return textResult(JSON.stringify({ result: value }, null, 2));
      }
      case 'pw_screenshot': {
        const p = await getPage();
        const buf = await p.screenshot({ fullPage: !!args.fullPage, type: 'png' });
        return {
          content: [
            { type: 'text', text: `Screenshot captured (${buf.byteLength} bytes) of ${p.url()}` },
            { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' },
          ],
        };
      }
      case 'pw_pdf': {
        const p = await getPage();
        const buf = await p.pdf({ landscape: !!args.landscape, format: 'A4' });
        return {
          content: [
            {
              type: 'text',
              text: `PDF generated (${buf.byteLength} bytes). Base64 follows as resource text for transfer.`,
            },
            {
              type: 'text',
              text: `data:application/pdf;base64,${buf.toString('base64').slice(0, 200)}…[truncated base64]`,
            },
          ],
        };
      }
      case 'pw_scroll': {
        const p = await getPage();
        if (args.infiniteSteps) {
          const heights: number[] = [];
          const steps = Math.min(Number(args.infiniteSteps) || 1, 20);
          const waitMs = args.waitMs ?? 800;
          for (let i = 0; i < steps; i++) {
            await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await p.waitForTimeout(waitMs);
            heights.push(await p.evaluate(() => document.body.scrollHeight));
          }
          return textResult(JSON.stringify({ infiniteSteps: steps, heights }, null, 2));
        }
        const amount = args.amount ?? 600;
        const dir = args.direction || 'down';
        if (dir === 'top') await p.evaluate(() => window.scrollTo(0, 0));
        else if (dir === 'bottom') await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        else if (dir === 'up') await p.evaluate((a) => window.scrollBy(0, -a), amount);
        else await p.evaluate((a) => window.scrollBy(0, a), amount);
        return textResult(`Scrolled ${dir}`);
      }
      case 'pw_status': {
        let url = '';
        let title = '';
        try {
          const p = await getPage();
          url = p.url();
          title = await p.title();
        } catch {
          /* no page yet */
        }
        return textResult(
          JSON.stringify(
            {
              engine: getBrowserEngine(),
              stealthish: process.env.OBMC_STEALTHISH === '1',
              video: process.env.OBMC_VIDEO === '1' || process.env.PW_VIDEO === '1',

              mode: getConnectionMode(),
              available: playwrightAvailable(),
              url,
              title,
              platform: process.env.VERCEL ? 'vercel' : 'long-running',
            },
            null,
            2
          )
        );
      }
      case 'pw_tabs':
        return textResult(JSON.stringify(await listTabs(), null, 2));
      case 'pw_tab_open':
        return textResult(JSON.stringify(await openTab(args.url), null, 2));
      case 'pw_tab_switch':
        return textResult(JSON.stringify(await switchTab(Number(args.index)), null, 2));
      case 'pw_tab_close':
        return textResult(JSON.stringify(await closeTab(args.index != null ? Number(args.index) : undefined), null, 2));
      case 'pw_dialog': {
        if (args.accept == null) {
          await installDialogHandler();
          return textResult(JSON.stringify({ lastDialog: getLastDialog() }, null, 2));
        }
        return textResult(JSON.stringify(await handleDialog({ accept: !!args.accept, promptText: args.promptText }), null, 2));
      }
      case 'pw_storage_state':
        return textResult(JSON.stringify(await saveStorageState(args.path), null, 2));
      case 'pw_set_storage_state':
        return textResult(JSON.stringify(await loadStorageState(args.path), null, 2));
      case 'pw_cookies': {
        const action = args.action || 'list';
        if (action === 'clear') return textResult(JSON.stringify(await clearCookies(), null, 2));
        if (action === 'set') {
          return textResult(
            JSON.stringify(
              await setCookie({
                name: args.name,
                value: args.value,
                domain: args.domain,
                path: args.path,
                url: args.url,
              }),
              null,
              2
            )
          );
        }
        return textResult(JSON.stringify(await listCookies(), null, 2));
      }
      case 'pw_route':
        return textResult(
          JSON.stringify(
            await routeMock({
              url: args.url,
              status: args.status,
              body: args.body,
              contentType: args.contentType,
            }),
            null,
            2
          )
        );
      case 'pw_unroute':
        return textResult(JSON.stringify(await unroute(args.url), null, 2));
      case 'pw_route_list':
        return textResult(JSON.stringify(listRoutes(), null, 2));
      case 'pw_upload':
        return textResult(
          JSON.stringify(await uploadFiles({ ref: args.ref, selector: args.selector, paths: args.paths }), null, 2)
        );
      case 'pw_download':
        return textResult(
          JSON.stringify(
            await waitForDownload({
              clickRef: args.clickRef,
              clickSelector: args.clickSelector,
              timeoutMs: args.timeoutMs,
            }),
            null,
            2
          )
        );
      case 'pw_select':
        return textResult(
          JSON.stringify(await selectOption({ ref: args.ref, selector: args.selector, values: args.values }), null, 2)
        );
      case 'pw_fill_form':
        return textResult(JSON.stringify(await fillForm(args.fields || []), null, 2));
      case 'pw_drag':
        return textResult(
          JSON.stringify(
            await dragDrop({
              fromRef: args.fromRef,
              fromSelector: args.fromSelector,
              toRef: args.toRef,
              toSelector: args.toSelector,
            }),
            null,
            2
          )
        );
      case 'pw_mouse_click_xy':
        return textResult(JSON.stringify(await mouseClickXY(Number(args.x), Number(args.y)), null, 2));
      case 'pw_mouse_move_xy':
        return textResult(JSON.stringify(await mouseMoveXY(Number(args.x), Number(args.y)), null, 2));
      case 'pw_highlight':
        return textResult(JSON.stringify(await highlightRef(args.ref), null, 2));
      case 'pw_trace_start': {
        return textResult(JSON.stringify(await startTrace(), null, 2));
      }
      case 'pw_trace_stop': {
        return textResult(JSON.stringify(await stopTrace(), null, 2));
      }
      case 'pw_video_status': {
        return textResult(JSON.stringify(await videoStatus(), null, 2));
      }
      case 'pw_close': {
        await closePlaywright();
        return textResult('Playwright browser closed / CDP detached.');
      }
      default:
        throw new Error(`Unknown playwright tool: ${name}`);
    }
  });
}
