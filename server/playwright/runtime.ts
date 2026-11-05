/**
 * Optional Playwright runtime.
 * Works on long-running hosts (Docker/Render/Railway/Fly).
 * On Vercel serverless: returns a clear capability error.
 *
 * Patterns adopted from microsoft/playwright-mcp (a11y snapshot + refs)
 * and vercel-labs/agent-browser (snapshot → act on @ref).
 */

export function playwrightAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.DISABLE_PLAYWRIGHT === '1') return false;
  if (process.env.ENABLE_PLAYWRIGHT === '0') return false;
  return true;
}

export function playwrightUnavailableMessage(tool: string): string {
  const hostHint =
    'Deploy with the included Dockerfile on Render, Railway, or Fly for real Chromium. Set ENABLE_PLAYWRIGHT=1.';
  if (process.env.VERCEL) {
    return (
      `Tool "${tool}" requires a persistent Playwright/Chromium browser and is not available on Vercel serverless. ` +
      hostHint +
      ' On Vercel, use extract_* HTTP tools instead.'
    );
  }
  return (
    `Tool "${tool}" requires Playwright. Install with: npm i playwright && npx playwright install chromium. ` +
    hostHint
  );
}

type PW = typeof import('playwright');

let pwModule: PW | null = null;
let browser: import('playwright').Browser | null = null;
let context: import('playwright').BrowserContext | null = null;
let page: import('playwright').Page | null = null;

/** ref → selector/locator metadata from last snapshot */
const refMap = new Map<string, { role?: string; name?: string; selector: string }>();
const networkLog: Array<{
  id: number;
  method: string;
  url: string;
  status?: number;
  resourceType: string;
  timestamp: number;
}> = [];
let networkCounter = 0;
let networkHooked = false;

async function loadPlaywright(): Promise<PW> {
  if (!playwrightAvailable()) {
    throw new Error(playwrightUnavailableMessage('playwright'));
  }
  if (pwModule) return pwModule;
  try {
    pwModule = await import('playwright');
    return pwModule;
  } catch (err: any) {
    throw new Error(
      `Playwright is not installed. ${playwrightUnavailableMessage('playwright')} (${err?.message || err})`
    );
  }
}

export async function getPage() {
  const pw = await loadPlaywright();
  if (!browser) {
    browser = await pw.chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADED !== '1',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'OpenBrowserMCP-Playwright/3.0 (+https://github.com/ozvietnam2026-sys/open-browser-mcp-controller)',
    });
  }
  if (!page || page.isClosed()) {
    page = await context.newPage();
    networkHooked = false;
  }
  if (!networkHooked) {
    networkHooked = true;
    page.on('request', (req) => {
      networkCounter += 1;
      networkLog.push({
        id: networkCounter,
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        timestamp: Date.now(),
      });
      if (networkLog.length > 300) networkLog.shift();
    });
    page.on('response', (res) => {
      const req = res.request();
      const entry = [...networkLog].reverse().find((e) => e.url === req.url() && e.method === req.method() && !e.status);
      if (entry) entry.status = res.status();
    });
  }
  return page;
}

export async function closePlaywright() {
  try {
    await context?.close();
  } catch {
    /* */
  }
  try {
    await browser?.close();
  } catch {
    /* */
  }
  browser = null;
  context = null;
  page = null;
  refMap.clear();
  networkLog.length = 0;
  networkHooked = false;
}

function escapeCss(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Build a compact accessibility snapshot with eN refs (Playwright MCP style). */
export async function buildA11ySnapshot(options: { interactiveOnly?: boolean; maxNodes?: number } = {}) {
  const p = await getPage();
  const maxNodes = options.maxNodes ?? 200;
  const snapshot = await p.accessibility.snapshot({ interestingOnly: options.interactiveOnly !== false });
  refMap.clear();
  const lines: string[] = [];
  let counter = 0;

  const walk = (node: any, depth: number) => {
    if (!node || counter >= maxNodes) return;
    const role = node.role || 'node';
    const name = (node.name || '').trim();
    const interactive =
      ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem', 'tab', 'switch', 'searchbox'].includes(
        role
      ) || node.focusable;
    if (!options.interactiveOnly || interactive || depth === 0) {
      counter += 1;
      const ref = `e${counter}`;
      let selector = '';
      if (role === 'link' && name) selector = `a:has-text("${escapeCss(name.slice(0, 80))}")`;
      else if (role === 'button' && name) selector = `button:has-text("${escapeCss(name.slice(0, 80))}")`;
      else if ((role === 'textbox' || role === 'searchbox') && name)
        selector = `[aria-label="${escapeCss(name.slice(0, 80))}"], input[placeholder="${escapeCss(name.slice(0, 80))}"]`;
      else if (name) selector = `text=${name.slice(0, 80)}`;
      else selector = `role=${role}`;
      refMap.set(ref, { role, name, selector });
      const indent = '  '.repeat(Math.min(depth, 8));
      const extras = [
        node.value != null && String(node.value) ? `value="${String(node.value).slice(0, 40)}"` : '',
        node.checked != null ? `checked=${node.checked}` : '',
        node.disabled ? 'disabled' : '',
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`${indent}- ${role}${name ? ` "${name.slice(0, 100)}"` : ''} [ref=${ref}]${extras ? ' ' + extras : ''}`);
    }
    const children = node.children || [];
    for (const child of children) walk(child, depth + 1);
  };

  if (snapshot) walk(snapshot, 0);
  else lines.push('(empty accessibility tree)');

  return {
    url: p.url(),
    title: await p.title(),
    refs: counter,
    snapshot: lines.join('\n'),
  };
}

export function resolveRef(target: string): string {
  const clean = target.replace(/^@/, '').replace(/^ref=/, '');
  const entry = refMap.get(clean) || refMap.get(`e${clean}`) || refMap.get(target);
  if (entry) return entry.selector;
  // allow raw selectors / playwright locators
  return target;
}

export function getNetworkLog(all = false) {
  return all ? [...networkLog] : networkLog.slice(-100);
}

export function clearNetworkLog() {
  networkLog.length = 0;
}
