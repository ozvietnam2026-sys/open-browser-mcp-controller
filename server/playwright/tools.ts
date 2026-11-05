import { McpToolDefinition } from '../../shared/browser-types.js';
import {
  playwrightAvailable,
  playwrightUnavailableMessage,
  getPage,
  buildA11ySnapshot,
  resolveRef,
  getNetworkLog,
  clearNetworkLog,
  closePlaywright,
} from './runtime.js';

export const MCP_PLAYWRIGHT_TOOLS: McpToolDefinition[] = [
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
      'Playwright: accessibility snapshot with element refs (e1, e2…) like microsoft/playwright-mcp and agent-browser. Use refs with pw_click/pw_type.',
    inputSchema: {
      type: 'object',
      properties: {
        interactiveOnly: { type: 'boolean', description: 'Default true' },
        maxNodes: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_click',
    description: 'Playwright: click by ref from pw_snapshot (e.g. "e5") or a selector.',
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
    name: 'pw_network',
    description: 'Playwright: list captured network/XHR requests for the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'Clear log after read' },
        all: { type: 'boolean' },
      },
    },
  },
  {
    name: 'pw_screenshot',
    description: 'Playwright: capture PNG screenshot (base64).',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean' },
      },
    },
  },
  {
    name: 'pw_pdf',
    description: 'Playwright: render current page to PDF (base64). Chromium only.',
    inputSchema: {
      type: 'object',
      properties: {
        landscape: { type: 'boolean' },
      },
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
        infiniteSteps: { type: 'number', description: 'If set, perform N infinite-scroll steps' },
        waitMs: { type: 'number' },
      },
    },
  },
  {
    name: 'pw_close',
    description: 'Playwright: close browser session and free resources.',
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
      case 'pw_navigate': {
        const p = await getPage();
        await p.goto(args.url, { waitUntil: args.waitUntil || 'domcontentloaded', timeout: 45000 });
        const snap = await buildA11ySnapshot({ interactiveOnly: true, maxNodes: 80 });
        return textResult(
          `Navigated to ${p.url()}\nTitle: ${snap.title}\n\nInteractive snapshot (truncated):\n${snap.snapshot.slice(0, 6000)}`
        );
      }
      case 'pw_snapshot': {
        const snap = await buildA11ySnapshot({
          interactiveOnly: args.interactiveOnly !== false,
          maxNodes: args.maxNodes,
        });
        return textResult(
          `URL: ${snap.url}\nTitle: ${snap.title}\nRefs: ${snap.refs}\n\n${snap.snapshot}`
        );
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
      case 'pw_network': {
        const logs = getNetworkLog(!!args.all);
        if (args.clear) clearNetworkLog();
        return textResult(JSON.stringify({ count: logs.length, requests: logs }, null, 2));
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
            { type: 'text', text: `data:application/pdf;base64,${buf.toString('base64').slice(0, 200)}…[truncated base64]` },
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
      case 'pw_close': {
        await closePlaywright();
        return textResult('Playwright browser closed.');
      }
      default:
        throw new Error(`Unknown playwright tool: ${name}`);
    }
  });
}
