/**
 * Meta / capability tools — inspired by github-mcp --toolsets/--tools/--exclude-tools
 * and playwright-mcp --caps / --profile.
 */
import { McpToolDefinition } from '../../shared/browser-types.js';
import {
  getConfig,
  listProfiles,
  setRuntimeCaps,
  setRuntimeExclude,
  ALL_CAPS,
  ToolCap,
  filterToolsByCaps,
} from '../config.js';
import { cacheStats, cacheClear } from '../infra/cache.js';
import { describePersistBackend, redisEnvPresent } from '../infra/persist-store.js';

export const MCP_META_TOOLS: McpToolDefinition[] = [
  {
    name: 'meta_status',
    description:
      'Show Open Browser MCP Controller version, active profile/caps, platform (Vercel vs long-running), cache and rate-limit settings.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'meta_list_profiles',
    description: 'List built-in tool profiles (minimal, extract, browser, full, devops, agents) and their caps.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'meta_set_profile',
    description:
      'Switch tool profile at runtime (github-mcp / playwright-mcp --caps style). Affects subsequent tools/list filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          enum: ['minimal', 'extract', 'browser', 'full', 'devops', 'agents'],
        },
        caps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional explicit caps override (core,extract,playwright,mail,ai,network,storage,devtools,vision,pdf,meta,browser)',
        },
      },
    },
  },
  {
    name: 'meta_exclude_tools',
    description: 'Exclude tool names at runtime (github-mcp --exclude-tools). Pass empty array to clear.',
    inputSchema: {
      type: 'object',
      properties: {
        tools: { type: 'array', items: { type: 'string' } },
      },
      required: ['tools'],
    },
  },
  {
    name: 'meta_list_tools',
    description: 'List currently visible tools after profile/caps/exclude filtering, grouped by prefix.',
    inputSchema: {
      type: 'object',
      properties: {
        grouped: { type: 'boolean', description: 'Default true' },
      },
    },
  },
  {
    name: 'meta_cache',
    description: 'Inspect or clear HTTP extraction cache (OBMC_CACHE_TTL).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['stats', 'clear'] },
      },
    },
  },
];

export const META_TOOL_NAMES = new Set(MCP_META_TOOLS.map((t) => t.name));

function ok(data: unknown) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

export async function executeMetaTool(name: string, args: Record<string, any>) {
  switch (name) {
    case 'meta_status': {
      const cfg = getConfig();
      const persist = describePersistBackend();
      return ok({
        version: cfg.version,
        profile: cfg.profile,
        caps: cfg.caps,
        platform: process.env.VERCEL ? 'vercel-serverless' : 'long-running',
        playwright: !process.env.VERCEL && process.env.DISABLE_PLAYWRIGHT !== '1',
        cacheEnabled: cfg.cacheEnabled,
        cacheTtlSec: cfg.cacheTtlSec,
        rateLimitPerMin: cfg.rateLimitPerMin,
        allowedDomains: cfg.allowedDomains,
        blockedDomains: cfg.blockedDomains,
        stealthish: cfg.stealthish,
        proxyConfigured: Boolean(cfg.proxyUrl),
        excludeTools: cfg.excludeTools,
        mailPersistPath: cfg.mailPersistPath || null,
        persistBackend: persist.backend,
        redisConfigured: redisEnvPresent(),
        geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        tavilyKeyPresent: Boolean(process.env.TAVILY_API_KEY),
        jinaKeyPresent: Boolean(process.env.JINA_API_KEY),
        searchProvider: process.env.SEARCH_PROVIDER || 'auto',
        playwrightEngine: process.env.PLAYWRIGHT_ENGINE || process.env.OBMC_BROWSER_ENGINE || 'playwright',
        videoEnabled: process.env.OBMC_VIDEO === '1' || process.env.PW_VIDEO === '1',
        maxDurationHint: process.env.VERCEL ? 300 : null,
        keysHelp: {
          GEMINI_API_KEY: 'https://aistudio.google.com/apikey',
          TAVILY_API_KEY: 'https://tavily.com (free, no card)',
          JINA_API_KEY: 'https://jina.ai/?sui=apikey',
          UPSTASH_REDIS_REST_URL_TOKEN: 'https://console.upstash.com',
        },
      });
    }
    case 'meta_list_profiles':
      return ok({ profiles: listProfiles(), allCaps: ALL_CAPS });
    case 'meta_set_profile': {
      if (args.caps && Array.isArray(args.caps) && args.caps.length) {
        const caps = args.caps.map((c: string) => c.toLowerCase()).filter((c: string) =>
          (ALL_CAPS as string[]).includes(c)
        ) as ToolCap[];
        setRuntimeCaps(caps.length ? caps : null);
      } else if (args.profile) {
        const { TOOL_PROFILES } = await import('../config.js');
        const caps = TOOL_PROFILES[args.profile];
        if (!caps) throw new Error(`Unknown profile: ${args.profile}`);
        setRuntimeCaps(caps);
        process.env.OBMC_PROFILE = args.profile;
      } else {
        setRuntimeCaps(null);
      }
      return ok({ ok: true, config: getConfig() });
    }
    case 'meta_exclude_tools': {
      const tools = Array.isArray(args.tools) ? args.tools.map(String) : [];
      setRuntimeExclude(tools.length ? tools : null);
      return ok({ ok: true, excludeTools: getConfig().excludeTools });
    }
    case 'meta_list_tools': {
      const { ALL_MCP_TOOLS_RAW } = await import('../tools-registry.js');
      const visible = filterToolsByCaps(ALL_MCP_TOOLS_RAW);
      if (args.grouped === false) {
        return ok({ count: visible.length, tools: visible.map((t) => t.name) });
      }
      const groups: Record<string, string[]> = {};
      for (const t of visible) {
        const prefix = t.name.split('_')[0];
        (groups[prefix] ||= []).push(t.name);
      }
      return ok({
        count: visible.length,
        groups: Object.fromEntries(
          Object.entries(groups).map(([k, v]) => [k, { count: v.length, tools: v }])
        ),
      });
    }
    case 'meta_cache': {
      if (args.action === 'clear') {
        cacheClear();
        return ok({ ok: true, cleared: true });
      }
      return ok(cacheStats());
    }
    default:
      throw new Error(`Unknown meta tool: ${name}`);
  }
}
