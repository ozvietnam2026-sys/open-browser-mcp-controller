/**
 * Runtime config — env/CLI inspired by playwright-mcp --caps, agent-browser AGENT_BROWSER_*,
 * and github-mcp-server --toolsets / --exclude-tools.
 */
export type ToolCap =
  | 'core'
  | 'browser'
  | 'extract'
  | 'playwright'
  | 'mail'
  | 'ai'
  | 'network'
  | 'storage'
  | 'devtools'
  | 'vision'
  | 'pdf'
  | 'meta';

const ALL_CAPS: ToolCap[] = [
  'core',
  'browser',
  'extract',
  'playwright',
  'mail',
  'ai',
  'network',
  'storage',
  'devtools',
  'vision',
  'pdf',
  'meta',
];

/** Profiles reduce tool schema size for LLMs (github-mcp + playwright-mcp pattern). */
export const TOOL_PROFILES: Record<string, ToolCap[]> = {
  minimal: ['core', 'browser', 'extract', 'meta'],
  extract: ['core', 'extract', 'meta'],
  browser: ['core', 'browser', 'playwright', 'network', 'storage', 'pdf', 'meta'],
  full: ALL_CAPS,
  devops: ['core', 'extract', 'playwright', 'network', 'storage', 'devtools', 'pdf', 'meta'],
  agents: ['core', 'extract', 'mail', 'ai', 'meta'],
};

function parseList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCaps(raw?: string | null): ToolCap[] | null {
  if (!raw) return null;
  const parts = parseList(raw).map((s) => s.toLowerCase()) as ToolCap[];
  const valid = parts.filter((p) => ALL_CAPS.includes(p));
  return valid.length ? valid : null;
}

export interface AppConfig {
  version: string;
  userAgent: string;
  proxyUrl?: string;
  proxyBypass: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  maxOutputChars: number;
  cacheTtlSec: number;
  cacheEnabled: boolean;
  rateLimitPerMin: number;
  contentBoundaries: boolean;
  ignoreHttpsErrors: boolean;
  caps: ToolCap[];
  profile: string;
  excludeTools: string[];
  includeTools: string[];
  mailPersistPath?: string;
  changeStorePath: string;
  downloadDir: string;
  outputDir: string;
  stealthish: boolean;
}

let runtimeCapsOverride: ToolCap[] | null = null;
let runtimeExcludeOverride: string[] | null = null;

export function getConfig(): AppConfig {
  const profileName = (process.env.MCP_PROFILE || process.env.OBMC_PROFILE || 'full').toLowerCase();
  const profileCaps = TOOL_PROFILES[profileName] || TOOL_PROFILES.full;
  const envCaps = parseCaps(process.env.MCP_CAPS || process.env.OBMC_CAPS || process.env.PLAYWRIGHT_MCP_CAPS);
  const caps = runtimeCapsOverride || envCaps || profileCaps;

  return {
    version: '4.1.8',
    userAgent:
      process.env.OBMC_USER_AGENT ||
      process.env.AGENT_BROWSER_USER_AGENT ||
      'OpenBrowserMCP/4.1.8 (+https://github.com/ozvietnam2026-sys/open-browser-mcp-controller; research bot)',
    proxyUrl: process.env.OBMC_PROXY || process.env.AGENT_BROWSER_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
    proxyBypass: parseList(process.env.OBMC_PROXY_BYPASS || process.env.AGENT_BROWSER_PROXY_BYPASS || process.env.NO_PROXY),
    allowedDomains: parseList(process.env.OBMC_ALLOWED_DOMAINS || process.env.AGENT_BROWSER_ALLOWED_DOMAINS),
    blockedDomains: parseList(process.env.OBMC_BLOCKED_DOMAINS),
    maxOutputChars: Number(process.env.OBMC_MAX_OUTPUT || process.env.AGENT_BROWSER_MAX_OUTPUT || 100_000),
    cacheTtlSec: Number(process.env.OBMC_CACHE_TTL || 120),
    cacheEnabled: process.env.OBMC_CACHE !== '0',
    rateLimitPerMin: Number(process.env.OBMC_RATE_LIMIT || 60),
    contentBoundaries: process.env.OBMC_CONTENT_BOUNDARIES === '1' || process.env.AGENT_BROWSER_CONTENT_BOUNDARIES === '1',
    ignoreHttpsErrors: process.env.OBMC_IGNORE_HTTPS_ERRORS === '1' || process.env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS === '1',
    caps,
    profile: profileName,
    excludeTools: runtimeExcludeOverride || parseList(process.env.MCP_EXCLUDE_TOOLS || process.env.GITHUB_EXCLUDE_TOOLS),
    includeTools: parseList(process.env.MCP_TOOLS || process.env.GITHUB_TOOLS),
    mailPersistPath: process.env.MAIL_PERSIST_PATH || (process.env.VERCEL ? undefined : './data/mailbox.json'),
    changeStorePath: process.env.OBMC_CHANGE_STORE || './data/change-store.json',
    downloadDir: process.env.OBMC_DOWNLOAD_DIR || process.env.AGENT_BROWSER_DOWNLOAD_PATH || './data/downloads',
    outputDir: process.env.OBMC_OUTPUT_DIR || './data/output',
    stealthish: process.env.OBMC_STEALTHISH === '1',
  };
}

export function setRuntimeCaps(caps: ToolCap[] | null) {
  runtimeCapsOverride = caps;
}

export function setRuntimeExclude(tools: string[] | null) {
  runtimeExcludeOverride = tools;
}

export function listProfiles() {
  return Object.entries(TOOL_PROFILES).map(([name, caps]) => ({ name, caps }));
}

export function capForTool(name: string): ToolCap {
  if (name.startsWith('extract_')) return 'extract';
  if (name.startsWith('pw_')) {
    if (['pw_pdf'].includes(name)) return 'pdf';
    if (['pw_network', 'pw_network_request', 'pw_route', 'pw_unroute', 'pw_route_list'].includes(name)) return 'network';
    if (['pw_cookies', 'pw_storage_state', 'pw_set_storage_state', 'pw_localstorage'].includes(name)) return 'storage';
    if (['pw_trace_start', 'pw_trace_stop', 'pw_highlight', 'pw_performance'].includes(name)) return 'devtools';
    if (['pw_mouse_click_xy', 'pw_mouse_move_xy', 'pw_mouse_drag_xy'].includes(name)) return 'vision';
    return 'playwright';
  }
  if (name.startsWith('mail_')) return 'mail';
  if (name.startsWith('ai_')) return 'ai';
  if (name.startsWith('meta_') || name.startsWith('tools_')) return 'meta';
  if (name.startsWith('browser_')) return 'browser';
  return 'core';
}

export function filterToolsByCaps<T extends { name: string }>(tools: T[]): T[] {
  const cfg = getConfig();
  const capSet = new Set(cfg.caps);
  const exclude = new Set(cfg.excludeTools);
  const include = new Set(cfg.includeTools);
  return tools.filter((t) => {
    if (exclude.has(t.name)) return false;
    // Explicit include list wins (github-mcp --tools pattern)
    if (include.size > 0) return include.has(t.name);
    const cap = capForTool(t.name);
    // meta tools always visible so agents can discover profiles/caps
    if (cap === 'meta') return true;
    if (cap === 'core') return true;
    return capSet.has(cap);
  });
}

export { ALL_CAPS };
