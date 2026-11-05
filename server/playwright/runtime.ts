/**
 * Optional Playwright runtime.
 * Works on long-running hosts (Docker/Render/Railway/Fly).
 * On Vercel serverless: returns a clear capability error.
 *
 * Patterns adopted from:
 * - microsoft/playwright-mcp (a11y snapshot + refs)
 * - vercel-labs/agent-browser (snapshot → act on @ref)
 * - ChromeDevTools/chrome-devtools-mcp (CDP connect via browserUrl/wsEndpoint,
 *   console messages, network inspection, emulation, performance metrics,
 *   persistent userDataDir)
 */

export function playwrightAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.DISABLE_PLAYWRIGHT === '1') return false;
  if (process.env.ENABLE_PLAYWRIGHT === '0') return false;
  return true;
}

export function playwrightUnavailableMessage(tool: string): string {
  const hostHint =
    'Deploy with the included Dockerfile on Render, Railway, or Fly for real Chromium. Set ENABLE_PLAYWRIGHT=1. Or attach an existing Chrome with pw_connect (CDP browserUrl).';
  if (process.env.VERCEL) {
    return (
      `Tool "${tool}" requires a persistent Playwright/Chromium browser and is not available on Vercel serverless. ` +
      hostHint +
      ' On Vercel, use extract_* HTTP tools and mail_* mailbox tools instead.'
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
let connectionMode: 'launch' | 'cdp' | 'persistent' = 'launch';

/** ref → selector/locator metadata from last snapshot */
const refMap = new Map<string, { role?: string; name?: string; selector: string; depth?: number }>();

export type NetworkEntry = {
  id: number;
  method: string;
  url: string;
  status?: number;
  resourceType: string;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  postData?: string;
  mimeType?: string;
};

const networkLog: NetworkEntry[] = [];
let networkCounter = 0;
let networkHooked = false;

export type ConsoleEntry = {
  id: number;
  type: string;
  text: string;
  location?: string;
  timestamp: number;
};

const consoleLog: ConsoleEntry[] = [];
let consoleCounter = 0;
let consoleHooked = false;

let performanceTracing = false;

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

function hookNetwork(p: import('playwright').Page) {
  if (networkHooked) return;
  networkHooked = true;
  p.on('request', (req) => {
    networkCounter += 1;
    const entry: NetworkEntry = {
      id: networkCounter,
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      timestamp: Date.now(),
      requestHeaders: req.headers(),
      postData: (() => {
        try {
          const d = req.postData();
          return d ? d.slice(0, 4000) : undefined;
        } catch {
          return undefined;
        }
      })(),
    };
    networkLog.push(entry);
    if (networkLog.length > 400) networkLog.shift();
  });
  p.on('response', async (res) => {
    const req = res.request();
    const entry = [...networkLog]
      .reverse()
      .find((e) => e.url === req.url() && e.method === req.method() && !e.status);
    if (entry) {
      entry.status = res.status();
      try {
        entry.responseHeaders = res.headers();
        entry.mimeType = res.headers()['content-type'];
      } catch {
        /* */
      }
    }
  });
}

function hookConsole(p: import('playwright').Page) {
  if (consoleHooked) return;
  consoleHooked = true;
  p.on('console', (msg) => {
    consoleCounter += 1;
    const loc = msg.location();
    consoleLog.push({
      id: consoleCounter,
      type: msg.type(),
      text: msg.text().slice(0, 4000),
      location: loc?.url ? `${loc.url}:${loc.lineNumber || 0}` : undefined,
      timestamp: Date.now(),
    });
    if (consoleLog.length > 300) consoleLog.shift();
  });
  p.on('pageerror', (err) => {
    consoleCounter += 1;
    consoleLog.push({
      id: consoleCounter,
      type: 'error',
      text: `Uncaught: ${err?.message || String(err)}`.slice(0, 4000),
      timestamp: Date.now(),
    });
    if (consoleLog.length > 300) consoleLog.shift();
  });
}

async function ensurePageHooks(p: import('playwright').Page) {
  hookNetwork(p);
  hookConsole(p);
}

/**
 * Connect to an already-running Chrome via CDP (chrome-devtools-mcp --browserUrl / --wsEndpoint).
 */
export async function connectOverCdp(options: {
  browserURL?: string;
  wsEndpoint?: string;
}): Promise<{ mode: string; url: string; pages: number }> {
  const pw = await loadPlaywright();
  await closePlaywright({ keepModule: true });

  if (options.wsEndpoint) {
    browser = await pw.chromium.connectOverCDP(options.wsEndpoint);
  } else {
    const url = options.browserURL || process.env.CDP_BROWSER_URL || 'http://127.0.0.1:9222';
    browser = await pw.chromium.connectOverCDP(url);
  }
  connectionMode = 'cdp';
  const contexts = browser.contexts();
  context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  page = pages[0] || (await context.newPage());
  networkHooked = false;
  consoleHooked = false;
  await ensurePageHooks(page);
  return {
    mode: 'cdp',
    url: page.url(),
    pages: pages.length || 1,
  };
}

export async function getPage() {
  const pw = await loadPlaywright();
  if (!browser) {
    const browserURL = process.env.CDP_BROWSER_URL || process.env.PW_BROWSER_URL;
    const wsEndpoint = process.env.CDP_WS_ENDPOINT || process.env.PW_WS_ENDPOINT;
    const userDataDir = process.env.PW_USER_DATA_DIR || process.env.CHROME_USER_DATA_DIR;

    if (wsEndpoint || browserURL) {
      await connectOverCdp({ browserURL, wsEndpoint });
    } else if (userDataDir) {
      context = await pw.chromium.launchPersistentContext(userDataDir, {
        headless: process.env.PLAYWRIGHT_HEADED !== '1',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--password-store=basic',
          '--use-mock-keychain',
        ],
        viewport: { width: 1280, height: 720 },
      });
      connectionMode = 'persistent';
      browser = context.browser();
      const pages = context.pages();
      page = pages[0] || (await context.newPage());
      networkHooked = false;
      consoleHooked = false;
    } else {
      browser = await pw.chromium.launch({
        headless: process.env.PLAYWRIGHT_HEADED !== '1',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
      });
      connectionMode = 'launch';
    }
  }
  if (!context) {
    context = await browser!.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'OpenBrowserMCP-Playwright/4.0 (+https://github.com/ozvietnam2026-sys/open-browser-mcp-controller)',
    });
  }
  if (!page || page.isClosed()) {
    page = await context.newPage();
    networkHooked = false;
    consoleHooked = false;
  }
  await ensurePageHooks(page);
  return page;
}

export function getConnectionMode() {
  return connectionMode;
}

export async function closePlaywright(opts: { keepModule?: boolean } = {}) {
  try {
    if (connectionMode === 'cdp') {
      // Do not close the user's Chrome; just detach.
      await browser?.close?.();
    } else if (connectionMode === 'persistent') {
      await context?.close();
    } else {
      await context?.close();
      await browser?.close();
    }
  } catch {
    /* */
  }
  browser = null;
  context = null;
  page = null;
  refMap.clear();
  networkLog.length = 0;
  consoleLog.length = 0;
  networkHooked = false;
  consoleHooked = false;
  performanceTracing = false;
  connectionMode = 'launch';
  if (!opts.keepModule) pwModule = null;
}

function escapeCss(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Build a compact accessibility snapshot with eN refs (Playwright MCP / agent-browser style). */
export async function buildA11ySnapshot(
  options: { interactiveOnly?: boolean; maxNodes?: number; maxDepth?: number } = {}
) {
  const p = await getPage();
  const maxNodes = options.maxNodes ?? 200;
  const maxDepth = options.maxDepth ?? 12;
  const snapshot = await p.accessibility.snapshot({ interestingOnly: options.interactiveOnly !== false });
  refMap.clear();
  const lines: string[] = [];
  let counter = 0;

  const walk = (node: any, depth: number) => {
    if (!node || counter >= maxNodes || depth > maxDepth) return;
    const role = node.role || 'node';
    const name = (node.name || '').trim();
    const interactive =
      [
        'button',
        'link',
        'textbox',
        'checkbox',
        'radio',
        'combobox',
        'menuitem',
        'tab',
        'switch',
        'searchbox',
        'slider',
        'spinbutton',
        'option',
      ].includes(role) || node.focusable;
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
      refMap.set(ref, { role, name, selector, depth });
      const indent = '  '.repeat(Math.min(depth, 8));
      const extras = [
        node.value != null && String(node.value) ? `value="${String(node.value).slice(0, 40)}"` : '',
        node.checked != null ? `checked=${node.checked}` : '',
        node.disabled ? 'disabled' : '',
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(
        `${indent}- ${role}${name ? ` "${name.slice(0, 100)}"` : ''} [ref=${ref}]${extras ? ' ' + extras : ''}`
      );
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

export function findInSnapshot(query: {
  role?: string;
  name?: string;
  text?: string;
  limit?: number;
}): Array<{ ref: string; role?: string; name?: string; selector: string }> {
  const limit = query.limit ?? 20;
  const out: Array<{ ref: string; role?: string; name?: string; selector: string }> = [];
  const nameQ = (query.name || query.text || '').toLowerCase();
  const roleQ = (query.role || '').toLowerCase();
  for (const [ref, meta] of refMap.entries()) {
    if (roleQ && (meta.role || '').toLowerCase() !== roleQ) continue;
    if (nameQ && !(meta.name || '').toLowerCase().includes(nameQ)) continue;
    out.push({ ref, role: meta.role, name: meta.name, selector: meta.selector });
    if (out.length >= limit) break;
  }
  return out;
}

export function resolveRef(target: string): string {
  const clean = target.replace(/^@/, '').replace(/^ref=/, '');
  const entry = refMap.get(clean) || refMap.get(`e${clean}`) || refMap.get(target);
  if (entry) return entry.selector;
  const looksLikeRef = /^e\d+$/i.test(clean);
  if (looksLikeRef) {
    throw new Error(
      `Stale ref "${target}": not in the last pw_snapshot (or no snapshot yet). Re-run pw_snapshot and use a current ref.`
    );
  }
  // allow raw selectors / playwright locators
  return target;
}

export function getNetworkLog(all = false) {
  return all ? [...networkLog] : networkLog.slice(-100);
}

export function getNetworkRequest(id: number) {
  return networkLog.find((e) => e.id === id) || null;
}

export function clearNetworkLog() {
  networkLog.length = 0;
}

export function getConsoleLog(opts: { type?: string; all?: boolean } = {}) {
  let list = opts.all ? [...consoleLog] : consoleLog.slice(-100);
  if (opts.type) list = list.filter((e) => e.type === opts.type);
  return list;
}

export function getConsoleMessage(id: number) {
  return consoleLog.find((e) => e.id === id) || null;
}

export function clearConsoleLog() {
  consoleLog.length = 0;
}

export async function applyEmulation(options: {
  viewport?: { width: number; height: number };
  userAgent?: string;
  colorScheme?: 'light' | 'dark' | 'no-preference';
  locale?: string;
  timezoneId?: string;
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
  offline?: boolean;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  extraHTTPHeaders?: Record<string, string>;
}) {
  const p = await getPage();
  const ctx = p.context();
  if (options.viewport) await p.setViewportSize(options.viewport);
  if (options.userAgent) await ctx.setExtraHTTPHeaders({ ...(options.extraHTTPHeaders || {}) });
  // Playwright setExtraHTTPHeaders replaces; merge carefully
  if (options.extraHTTPHeaders) await ctx.setExtraHTTPHeaders(options.extraHTTPHeaders);
  if (options.colorScheme) await ctx.emulateMedia({ colorScheme: options.colorScheme });
  if (options.geolocation) {
    await ctx.grantPermissions(['geolocation']);
    await ctx.setGeolocation(options.geolocation);
  }
  if (typeof options.offline === 'boolean') await ctx.setOffline(options.offline);
  // locale/timezone require new context in Playwright; document limitation
  return {
    applied: Object.keys(options).filter((k) => (options as any)[k] != null),
    notes:
      options.locale || options.timezoneId
        ? 'locale/timezoneId require a fresh context — set PW_LOCALE / PW_TIMEZONE before launch, or reconnect.'
        : undefined,
    viewport: p.viewportSize(),
    url: p.url(),
  };
}

export async function collectPerformanceMetrics() {
  const p = await getPage();
  const nav = await p.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType('paint') as PerformanceEntry[];
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as any[];
    return {
      url: location.href,
      timing: t
        ? {
            domContentLoaded: Math.round(t.domContentLoadedEventEnd),
            loadEvent: Math.round(t.loadEventEnd),
            responseStart: Math.round(t.responseStart),
            transferSize: (t as any).transferSize,
            encodedBodySize: (t as any).encodedBodySize,
          }
        : null,
      paint: paint.map((e) => ({ name: e.name, startTime: Math.round(e.startTime) })),
      lcp: lcpEntries.length
        ? {
            startTime: Math.round(lcpEntries[lcpEntries.length - 1].startTime),
            size: lcpEntries[lcpEntries.length - 1].size,
          }
        : null,
      memory: (performance as any).memory
        ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          }
        : null,
    };
  });

  // CDP Performance.getMetrics when available
  let cdpMetrics: Array<{ name: string; value: number }> = [];
  try {
    const client = await p.context().newCDPSession(p);
    await client.send('Performance.enable');
    const { metrics } = await client.send('Performance.getMetrics');
    cdpMetrics = (metrics || []).map((m: any) => ({ name: m.name, value: m.value }));
    await client.detach().catch(() => undefined);
  } catch {
    /* CDP optional */
  }

  return { ...nav, cdpMetrics: cdpMetrics.slice(0, 40), tracing: performanceTracing };
}

export async function startPerformanceTrace() {
  const p = await getPage();
  try {
    await p.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
    performanceTracing = true;
    return { ok: true, message: 'Playwright tracing started (screenshots+snapshots).' };
  } catch (err: any) {
    // Fallback: mark intent; metrics still available via collectPerformanceMetrics
    performanceTracing = true;
    return {
      ok: true,
      message: `Tracing soft-started (fallback). Metrics via pw_performance. Detail: ${err?.message || err}`,
    };
  }
}

export async function stopPerformanceTrace(): Promise<{ ok: boolean; message: string; metrics: any }> {
  const metrics = await collectPerformanceMetrics();
  if (performanceTracing) {
    try {
      // Do not write large zip to disk on serverless-like hosts; just stop.
      await page?.context().tracing.stop();
    } catch {
      /* */
    }
  }
  performanceTracing = false;
  return {
    ok: true,
    message: 'Performance trace stopped. Lab metrics below (chrome-devtools-mcp style insights lite).',
    metrics,
  };
}

export async function evaluateScript(script: string) {
  const p = await getPage();
  const client = await p.context().newCDPSession(p);
  try {
    const expression = script.trim();
    const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.text || exceptionDetails.exception?.description || 'Script error');
    }
    return result?.value;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

/** ---- v4 advanced helpers (playwright-mcp caps + agent-browser) ---- */

let lastSnapshotText = '';
let dialogHandlerInstalled = false;
let lastDialog: { type: string; message: string; at: number } | null = null;
let dialogAutoAccept: boolean | null = null;
const routes = new Map<string, { url: string; status?: number; body?: string; contentType?: string }>();

export function getLastSnapshotText() {
  return lastSnapshotText;
}

export function setLastSnapshotText(text: string) {
  lastSnapshotText = text;
}

/** Snapshot with optional delta vs previous (agent-browser --delta). */
export async function buildA11ySnapshotWithDelta(
  options: {
    interactiveOnly?: boolean;
    maxNodes?: number;
    maxDepth?: number;
    delta?: boolean;
    includeBoxes?: boolean;
  } = {}
) {
  const snap = await buildA11ySnapshot(options);
  let deltaInfo: { mode: 'full' | 'unchanged' | 'delta'; removedLines?: number; addedLines?: number } = {
    mode: 'full',
  };
  if (options.delta && lastSnapshotText) {
    if (lastSnapshotText === snap.snapshot) {
      deltaInfo = { mode: 'unchanged' };
    } else {
      const prevLines = new Set(lastSnapshotText.split('\n'));
      const nextLines = snap.snapshot.split('\n');
      const added = nextLines.filter((l) => !prevLines.has(l));
      const prevArr = lastSnapshotText.split('\n');
      const nextSet = new Set(nextLines);
      const removed = prevArr.filter((l) => !nextSet.has(l));
      deltaInfo = { mode: 'delta', removedLines: removed.length, addedLines: added.length };
      // Return a compact delta view
      (snap as any).deltaPreview = [
        ...removed.slice(0, 40).map((l) => `- ${l}`),
        ...added.slice(0, 40).map((l) => `+ ${l}`),
      ].join('\n');
    }
  }
  lastSnapshotText = snap.snapshot;
  return { ...snap, delta: deltaInfo };
}

export async function listTabs() {
  await getPage();
  const pages = context?.pages() || [];
  return pages.map((p, i) => ({
    index: i,
    url: p.url(),
    active: p === page,
  }));
}

export async function openTab(url?: string) {
  await getPage();
  const p = await context!.newPage();
  page = p;
  networkHooked = false;
  consoleHooked = false;
  await ensurePageHooks(p);
  if (url) await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  return { index: context!.pages().length - 1, url: p.url() };
}

export async function switchTab(index: number) {
  await getPage();
  const pages = context!.pages();
  if (index < 0 || index >= pages.length) throw new Error(`Tab index out of range: ${index} (have ${pages.length})`);
  page = pages[index];
  networkHooked = false;
  consoleHooked = false;
  await ensurePageHooks(page);
  return { index, url: page.url() };
}

export async function closeTab(index?: number) {
  await getPage();
  const pages = context!.pages();
  const idx = index ?? pages.findIndex((p) => p === page);
  if (idx < 0 || idx >= pages.length) throw new Error('No tab to close');
  if (pages.length === 1) throw new Error('Cannot close the last tab — use pw_close instead');
  await pages[idx].close();
  const remaining = context!.pages();
  page = remaining[Math.min(idx, remaining.length - 1)];
  return { closed: idx, remaining: remaining.length, url: page.url() };
}

export async function installDialogHandler(autoAccept?: boolean) {
  const p = await getPage();
  dialogAutoAccept = autoAccept ?? null;
  if (dialogHandlerInstalled) return { ok: true, autoAccept: dialogAutoAccept };
  dialogHandlerInstalled = true;
  p.on('dialog', async (dialog) => {
    lastDialog = { type: dialog.type(), message: dialog.message(), at: Date.now() };
    if (dialogAutoAccept === true) await dialog.accept().catch(() => undefined);
    else if (dialogAutoAccept === false) await dialog.dismiss().catch(() => undefined);
    // if null: leave for pw_handle_dialog (may timeout) — accept by default to avoid hang
    else await dialog.accept().catch(() => undefined);
  });
  return { ok: true, autoAccept: dialogAutoAccept };
}

export function getLastDialog() {
  return lastDialog;
}

export async function handleDialog(opts: { accept?: boolean; promptText?: string }) {
  // For pending dialogs we rely on auto handler; expose last dialog + set policy
  dialogAutoAccept = opts.accept !== false;
  await installDialogHandler(dialogAutoAccept);
  return { ok: true, policy: dialogAutoAccept ? 'accept' : 'dismiss', lastDialog };
}

export async function saveStorageState(filePath?: string) {
  const p = await getPage();
  const state = await p.context().storageState();
  if (filePath) {
    const fs = await import('fs');
    const path = await import('path');
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(state, null, 2));
    return { ok: true, path: resolved, cookies: state.cookies.length, origins: state.origins.length };
  }
  return { ok: true, state };
}

export async function loadStorageState(filePath: string) {
  const fs = await import('fs');
  const path = await import('path');
  const resolved = path.resolve(filePath);
  const state = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  // Re-create context with storage state (launch mode)
  const pw = await loadPlaywright();
  await closePlaywright({ keepModule: true });
  browser = await pw.chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== '1',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  connectionMode = 'launch';
  context = await browser.newContext({
    storageState: state,
    viewport: { width: 1280, height: 720 },
  });
  page = await context.newPage();
  networkHooked = false;
  consoleHooked = false;
  await ensurePageHooks(page);
  return { ok: true, path: resolved, url: page.url() };
}

export async function listCookies() {
  const p = await getPage();
  return p.context().cookies();
}

export async function setCookie(cookie: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
}) {
  const p = await getPage();
  await p.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      url: cookie.url || p.url(),
    } as any,
  ]);
  return { ok: true };
}

export async function clearCookies() {
  const p = await getPage();
  await p.context().clearCookies();
  return { ok: true };
}

export async function routeMock(opts: { url: string; status?: number; body?: string; contentType?: string }) {
  const p = await getPage();
  const key = opts.url;
  routes.set(key, opts);
  await p.route(opts.url, async (route) => {
    await route.fulfill({
      status: opts.status ?? 200,
      contentType: opts.contentType || 'application/json',
      body: opts.body ?? '{"ok":true}',
    });
  });
  return { ok: true, routed: key, active: routes.size };
}

export async function unroute(url?: string) {
  const p = await getPage();
  if (url) {
    await p.unroute(url).catch(() => undefined);
    routes.delete(url);
  } else {
    await p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
    routes.clear();
  }
  return { ok: true, active: routes.size };
}

export function listRoutes() {
  return [...routes.values()];
}

export async function uploadFiles(opts: { ref?: string; selector?: string; paths: string[] }) {
  const p = await getPage();
  const target = opts.ref ? resolveRef(opts.ref) : opts.selector;
  if (!target) throw new Error('Provide ref or selector for file input');
  await p.locator(target).first().setInputFiles(opts.paths);
  return { ok: true, files: opts.paths };
}

export async function waitForDownload(opts: { clickRef?: string; clickSelector?: string; timeoutMs?: number }) {
  const p = await getPage();
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.resolve(process.env.OBMC_DOWNLOAD_DIR || './data/downloads');
  fs.mkdirSync(dir, { recursive: true });

  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: opts.timeoutMs ?? 30000 }),
    (async () => {
      if (opts.clickRef || opts.clickSelector) {
        const target = opts.clickRef ? resolveRef(opts.clickRef) : opts.clickSelector!;
        await p.locator(target).first().click();
      }
    })(),
  ]);
  const suggested = download.suggestedFilename();
  const dest = path.join(dir, suggested);
  await download.saveAs(dest);
  return { ok: true, path: dest, suggestedFilename: suggested };
}

export async function mouseClickXY(x: number, y: number) {
  const p = await getPage();
  await p.mouse.click(x, y);
  return { ok: true, x, y };
}

export async function mouseMoveXY(x: number, y: number) {
  const p = await getPage();
  await p.mouse.move(x, y);
  return { ok: true, x, y };
}

export async function selectOption(opts: { ref?: string; selector?: string; values: string[] }) {
  const p = await getPage();
  const target = opts.ref ? resolveRef(opts.ref) : opts.selector;
  if (!target) throw new Error('Provide ref or selector');
  const selected = await p.locator(target).first().selectOption(opts.values);
  return { ok: true, selected };
}

export async function fillForm(fields: Array<{ ref?: string; selector?: string; value: string; type?: string }>) {
  const p = await getPage();
  const results: Array<{ target: string; ok: boolean; error?: string }> = [];
  for (const f of fields) {
    const target = f.ref ? resolveRef(f.ref) : f.selector;
    if (!target) {
      results.push({ target: '?', ok: false, error: 'missing ref/selector' });
      continue;
    }
    try {
      const loc = p.locator(target).first();
      if (f.type === 'checkbox' || f.type === 'radio') {
        if (f.value === 'false' || f.value === '0') await loc.uncheck();
        else await loc.check();
      } else if (f.type === 'select') {
        await loc.selectOption(f.value);
      } else {
        await loc.fill(f.value);
      }
      results.push({ target, ok: true });
    } catch (err: any) {
      results.push({ target, ok: false, error: err?.message || String(err) });
    }
  }
  return { results };
}

export async function dragDrop(opts: { fromRef?: string; fromSelector?: string; toRef?: string; toSelector?: string }) {
  const p = await getPage();
  const from = opts.fromRef ? resolveRef(opts.fromRef) : opts.fromSelector;
  const to = opts.toRef ? resolveRef(opts.toRef) : opts.toSelector;
  if (!from || !to) throw new Error('Provide from and to ref/selector');
  await p.locator(from).first().dragTo(p.locator(to).first());
  return { ok: true };
}

export async function highlightRef(ref: string) {
  const p = await getPage();
  const target = resolveRef(ref);
  await p.locator(target).first().evaluate((el) => {
    const prev = (el as HTMLElement).style.outline;
    (el as HTMLElement).style.outline = '3px solid #ff00aa';
    (el as any).__obmcOutline = prev;
  });
  return { ok: true, ref };
}
