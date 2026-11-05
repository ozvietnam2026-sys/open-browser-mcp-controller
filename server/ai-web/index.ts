/**
 * Browser-AI helpers inspired by:
 * - jeffrey-nz/browser-ai-bridge (drive logged-in AI web UIs via Playwright/CDP, no API keys)
 * - jrb00013/mailnotmilk (browser_open_ai / extract_messages / send_message / relay)
 *
 * These tools need a real browser (Docker/local). On Vercel they return a clear error.
 * Selectors are best-effort heuristics — AI UIs change frequently.
 */
import { McpToolDefinition } from '../../shared/browser-types.js';
import {
  playwrightAvailable,
  playwrightUnavailableMessage,
  getPage,
  buildA11ySnapshot,
} from '../playwright/runtime.js';

export const AI_PROVIDERS: Record<
  string,
  { name: string; url: string; composerHints: string[]; messageHints: string[] }
> = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    composerHints: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
    messageHints: ['[data-message-author-role]', 'article', '[class*="markdown"]'],
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://gemini.google.com/app',
    composerHints: ['rich-textarea', 'div[contenteditable="true"]', 'textarea'],
    messageHints: ['message-content', '[class*="model-response"]', 'article'],
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    composerHints: ['textarea', 'div[contenteditable="true"]'],
    messageHints: ['[class*="message"]', 'article'],
  },
  grok: {
    name: 'xAI Grok',
    url: 'https://grok.com',
    composerHints: ['textarea', 'div[contenteditable="true"]'],
    messageHints: ['[class*="message"]', 'article'],
  },
  copilot: {
    name: 'Microsoft Copilot',
    url: 'https://copilot.microsoft.com',
    composerHints: ['textarea', 'div[contenteditable="true"]'],
    messageHints: ['[class*="message"]', 'article'],
  },
  claude: {
    name: 'Claude.ai',
    url: 'https://claude.ai/new',
    composerHints: ['div[contenteditable="true"]', 'textarea'],
    messageHints: ['[data-test-render-count]', 'article', '[class*="font-claude"]'],
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    composerHints: ['textarea', 'div[contenteditable="true"]'],
    messageHints: ['[class*="prose"]', 'article'],
  },
};

export const MCP_AI_WEB_TOOLS: McpToolDefinition[] = [
  {
    name: 'ai_list_providers',
    description:
      'List supported browser-AI providers (browser-ai-bridge / mailnotmilk). Docker/local for automation; list works everywhere.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ai_open',
    description:
      'Open a browser-AI site (chatgpt|gemini|deepseek|grok|copilot|claude|perplexity) or custom URL. Requires Playwright host.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        url: { type: 'string', description: 'Custom URL override' },
      },
    },
  },
  {
    name: 'ai_extract_messages',
    description:
      'Parse visible chat turns from the open browser AI page (mailnotmilk browser_extract_messages). Heuristic selectors.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'ai_send_message',
    description:
      'Type a message into the browser AI composer and optionally press Enter (mailnotmilk browser_send_message / browser-ai-bridge ask).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        provider: { type: 'string' },
        pressEnter: { type: 'boolean', description: 'Default true' },
      },
      required: ['text'],
    },
  },
  {
    name: 'ai_status',
    description: 'Show current page URL/title and whether Playwright is available for browser-AI tools.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const AI_WEB_TOOL_NAMES = new Set(MCP_AI_WEB_TOOLS.map((t) => t.name));

function textResult(data: unknown) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

async function guard(tool: string, fn: () => Promise<any>) {
  if (tool === 'ai_list_providers') return fn();
  if (!playwrightAvailable()) {
    return textResult(`❌ ${playwrightUnavailableMessage(tool)}`);
  }
  try {
    return await fn();
  } catch (err: any) {
    return textResult(`❌ ai-web error in ${tool}: ${err?.message || err}`);
  }
}

async function findFirstLocator(hints: string[]) {
  const p = await getPage();
  for (const sel of hints) {
    const loc = p.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        if (await loc.isVisible()) return loc;
      } catch {
        return loc;
      }
    }
  }
  return null;
}

export async function executeAiWebTool(name: string, args: Record<string, any>) {
  return guard(name, async () => {
    switch (name) {
      case 'ai_list_providers':
        return textResult({
          providers: Object.entries(AI_PROVIDERS).map(([id, p]) => ({
            id,
            name: p.name,
            url: p.url,
          })),
          notes: [
            'Adopted from jeffrey-nz/browser-ai-bridge (exact npm name) and jrb00013/mailnotmilk.',
            'Related candidates if you meant a different project: YosefHayim/ai-browser-bridge, usedhonda/chrome-ai-bridge.',
            'Requires signed-in Chrome profile (PW_USER_DATA_DIR or pw_connect CDP) for real answers — no API keys.',
          ],
        });
      case 'ai_open': {
        const provider = args.provider ? AI_PROVIDERS[String(args.provider).toLowerCase()] : null;
        const url = args.url || provider?.url;
        if (!url) throw new Error('Provide provider or url');
        const p = await getPage();
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const snap = await buildA11ySnapshot({ interactiveOnly: true, maxNodes: 40 });
        return textResult({
          ok: true,
          provider: args.provider || null,
          url: p.url(),
          title: snap.title,
          snapshotPreview: snap.snapshot.slice(0, 2500),
        });
      }
      case 'ai_extract_messages': {
        const p = await getPage();
        const provider = args.provider ? AI_PROVIDERS[String(args.provider).toLowerCase()] : null;
        const hints = provider?.messageHints || [
          '[data-message-author-role]',
          'article',
          '[class*="markdown"]',
          '[class*="message"]',
        ];
        const limit = Math.min(Number(args.limit) || 30, 80);
        const messages: Array<{ index: number; text: string; selector: string }> = [];
        for (const sel of hints) {
          const nodes = p.locator(sel);
          const count = Math.min(await nodes.count(), limit);
          for (let i = 0; i < count; i++) {
            const text = ((await nodes.nth(i).innerText().catch(() => '')) || '').trim();
            if (text && text.length > 1) messages.push({ index: i, text: text.slice(0, 4000), selector: sel });
          }
          if (messages.length) break;
        }
        // Fallback: accessibility snapshot text
        if (!messages.length) {
          const snap = await buildA11ySnapshot({ interactiveOnly: false, maxNodes: 100 });
          return textResult({
            count: 0,
            warning: 'No chat nodes matched heuristics; returning a11y snapshot instead.',
            url: p.url(),
            snapshot: snap.snapshot.slice(0, 6000),
          });
        }
        return textResult({
          count: messages.length,
          url: p.url(),
          messages: messages.slice(-limit),
        });
      }
      case 'ai_send_message': {
        const provider = args.provider ? AI_PROVIDERS[String(args.provider).toLowerCase()] : null;
        const hints = provider?.composerHints || [
          'div[contenteditable="true"]',
          'textarea',
          '#prompt-textarea',
        ];
        const loc = await findFirstLocator(hints);
        if (!loc) throw new Error('Could not find AI composer. Open the site with ai_open and ensure logged in.');
        await loc.click({ timeout: 10000 });
        try {
          await loc.fill(args.text);
        } catch {
          await loc.type(args.text, { delay: 15 });
        }
        if (args.pressEnter !== false) {
          await loc.press('Enter').catch(async () => {
            const p = await getPage();
            await p.keyboard.press('Enter');
          });
        }
        return textResult({
          ok: true,
          sentChars: String(args.text).length,
          pressEnter: args.pressEnter !== false,
          note: 'Generation is async; poll with ai_extract_messages after a few seconds.',
        });
      }
      case 'ai_status': {
        if (!playwrightAvailable()) {
          return textResult({
            available: false,
            reason: playwrightUnavailableMessage('ai_status'),
            providers: Object.keys(AI_PROVIDERS),
          });
        }
        const p = await getPage();
        return textResult({
          available: true,
          url: p.url(),
          title: await p.title(),
          providers: Object.keys(AI_PROVIDERS),
        });
      }
      default:
        throw new Error(`Unknown ai-web tool: ${name}`);
    }
  });
}
