/**
 * Multi-strategy web data extraction tools (HTTP-based, Vercel-safe).
 * Inspired by agent-browser, playwright-mcp, Firecrawl, Jina, Crawl4AI, Stagehand, ScrapeGraphAI.
 */
import { McpToolDefinition } from '../../shared/browser-types.js';
import { fetchUrl, truncate } from './http-fetch.js';
import {
  loadHtml,
  extractReadable,
  extractMetadata,
  extractLinks,
  extractTables,
  extractLists,
  extractBySchema,
  visibleText,
} from './parse-html.js';
import { discoverSite, fetchRobotsTxt, fetchSitemap } from './discovery.js';
import { crawlSite, paginateExtract } from './crawl.js';
import { detectJsonApis } from './json-api.js';
import { mapSite } from './map.js';
import { searchWeb } from './search.js';
import { trackChange } from './change-store.js';
import { llmExtract } from './llm-extract.js';
import { observePage } from './observe.js';
import { cacheStats, cacheClear } from '../infra/cache.js';
import { getConfig } from '../config.js';

export const MCP_EXTRACT_TOOLS: McpToolDefinition[] = [
  {
    name: 'extract_http_fetch',
    description:
      'Fetch a URL with plain HTTP (no browser). Returns status, headers, content-type, and body text. Respects OBMC_ALLOWED_DOMAINS / cache / rate limits. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default GET)' },
        maxBytes: { type: 'number', description: 'Max response bytes (default 2MB)' },
        timeoutMs: { type: 'number', description: 'Timeout in ms (default 20000)' },
        ignoreCache: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_readable',
    description:
      'Fetch a page and convert main content to Markdown (Readability-like / Jina Reader style). Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page URL' },
        includeHtml: { type: 'boolean', description: 'Also return cleaned HTML (default false)' },
        ignoreCache: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_structured',
    description:
      'LLM-free CSS schema extract. Example schema: {"title":"h1","links":{"selector":"a","attr":"href","many":true}}. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        schema: {
          type: 'object',
          description: 'Map of field name → CSS selector string or {selector, attr?, many?}',
        },
      },
      required: ['url', 'schema'],
    },
  },
  {
    name: 'extract_tables',
    description: 'Fetch a page and extract HTML tables as JSON (headers + rows). Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number', description: 'Max tables (default 20)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_lists',
    description: 'Fetch a page and extract ul/ol lists as JSON. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_links',
    description: 'Fetch a page and return absolute links with text. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number', description: 'Max links (default 200)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_metadata',
    description:
      'Fetch a page and extract OpenGraph, Twitter cards, JSON-LD, microdata, canonical, and meta tags. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'extract_discover',
    description: 'Discover site structure via robots.txt and sitemaps. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        sitemapLimit: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_robots',
    description: 'Fetch and parse robots.txt for a site. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'extract_sitemap',
    description: 'Fetch and parse a sitemap.xml URL. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_map',
    description:
      'Firecrawl /map inspired: discover URLs via sitemap + same-origin HTML links. Optional search ranks URLs. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        search: { type: 'string' },
        limit: { type: 'number' },
        includeSubdomains: { type: 'boolean' },
        ignoreQueryParameters: { type: 'boolean' },
        sitemapMode: { type: 'string', enum: ['include', 'skip', 'only'] },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_search',
    description:
      'Free DuckDuckGo HTML search (no API key). Firecrawl/Jina search inspired. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'extract_change',
    description:
      'Firecrawl changeTracking inspired: compare readable Markdown to last snapshot for URL+tag. Returns new|same|changed + line diff.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        tag: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_llm',
    description:
      'Optional LLM schema/prompt extract (ScrapeGraphAI / Firecrawl / Stagehand). Needs GEMINI_API_KEY; else clear fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        prompt: { type: 'string' },
        schema: { type: 'object' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_observe',
    description:
      'Stagehand observe inspired: list actionable links/buttons/fields (HTTP heuristics). Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        instruction: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_crawl',
    description:
      'Multi-page same-origin crawl with hard limits (max 20 pages). Works on Vercel with short timeouts.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        maxPages: { type: 'number' },
        sameOriginOnly: { type: 'boolean' },
        delayMs: { type: 'number' },
        extractReadable: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_paginate',
    description: 'Follow pagination links and collect items via CSS selectors. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        itemSelector: { type: 'string' },
        nextSelector: { type: 'string' },
        maxPages: { type: 'number' },
        fields: { type: 'object' },
      },
      required: ['url', 'itemSelector'],
    },
  },
  {
    name: 'extract_json_api',
    description:
      'Detect JSON APIs: direct JSON, __NEXT_DATA__, linked .json/api endpoints, probes. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'extract_cache',
    description: 'Inspect or clear the HTTP extraction cache.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['stats', 'clear'] },
      },
    },
  },
];

function ok(data: any) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

export async function executeExtractTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'extract_http_fetch': {
      const res = await fetchUrl(args.url, {
        method: args.method,
        maxBytes: args.maxBytes,
        timeoutMs: args.timeoutMs,
        ignoreCache: args.ignoreCache,
      });
      return ok({ ...res, bodyText: truncate(res.bodyText, 40_000) });
    }
    case 'extract_readable': {
      const res = await fetchUrl(args.url, { ignoreCache: args.ignoreCache });
      const $ = loadHtml(res.bodyText);
      const readable = extractReadable($, res.finalUrl);
      const out: any = {
        url: res.finalUrl,
        status: res.status,
        title: readable.title,
        byline: readable.byline,
        excerpt: readable.excerpt,
        wordCount: readable.wordCount,
        markdown: readable.contentMarkdown,
        fromCache: res.fromCache,
      };
      if (args.includeHtml) out.html = readable.contentHtml.slice(0, 50_000);
      return ok(out);
    }
    case 'extract_structured': {
      const res = await fetchUrl(args.url);
      const $ = loadHtml(res.bodyText);
      const data = extractBySchema($, res.finalUrl, args.schema || {});
      return ok({ url: res.finalUrl, status: res.status, data });
    }
    case 'extract_tables': {
      const res = await fetchUrl(args.url);
      const $ = loadHtml(res.bodyText);
      return ok({ url: res.finalUrl, tables: extractTables($, args.limit ?? 20) });
    }
    case 'extract_lists': {
      const res = await fetchUrl(args.url);
      const $ = loadHtml(res.bodyText);
      return ok({ url: res.finalUrl, lists: extractLists($, args.limit ?? 30) });
    }
    case 'extract_links': {
      const res = await fetchUrl(args.url);
      const $ = loadHtml(res.bodyText);
      return ok({ url: res.finalUrl, links: extractLinks($, res.finalUrl, args.limit ?? 200) });
    }
    case 'extract_metadata': {
      const res = await fetchUrl(args.url);
      const $ = loadHtml(res.bodyText);
      return ok({
        url: res.finalUrl,
        status: res.status,
        textLength: visibleText($).length,
        metadata: extractMetadata($, res.finalUrl),
      });
    }
    case 'extract_discover':
      return ok(await discoverSite(args.url, args.sitemapLimit ?? 50));
    case 'extract_robots':
      return ok(await fetchRobotsTxt(args.url));
    case 'extract_sitemap':
      return ok(await fetchSitemap(args.url, args.limit ?? 100));
    case 'extract_map':
      return ok(
        await mapSite({
          url: args.url,
          search: args.search,
          limit: args.limit,
          includeSubdomains: args.includeSubdomains,
          ignoreQueryParameters: args.ignoreQueryParameters,
          sitemapMode: args.sitemapMode,
        })
      );
    case 'extract_search':
      return ok(await searchWeb({ query: args.query, limit: args.limit }));
    case 'extract_change': {
      const res = await fetchUrl(args.url, { ignoreCache: true });
      const $ = loadHtml(res.bodyText);
      const readable = extractReadable($, res.finalUrl);
      const change = await trackChange({
        url: res.finalUrl,
        markdown: readable.contentMarkdown || '',
        tag: args.tag,
      });
      return ok({
        url: res.finalUrl,
        title: readable.title,
        wordCount: readable.wordCount,
        ...change,
      });
    }
    case 'extract_llm':
      return ok(await llmExtract({ url: args.url, prompt: args.prompt, schema: args.schema }));
    case 'extract_observe':
      return ok(await observePage({ url: args.url, instruction: args.instruction, limit: args.limit }));
    case 'extract_crawl':
      return ok(
        await crawlSite({
          startUrl: args.url,
          maxPages: args.maxPages,
          sameOriginOnly: args.sameOriginOnly,
          delayMs: args.delayMs,
          extractReadable: args.extractReadable,
        })
      );
    case 'extract_paginate':
      return ok(
        await paginateExtract({
          startUrl: args.url,
          itemSelector: args.itemSelector,
          nextSelector: args.nextSelector,
          maxPages: args.maxPages,
          fields: args.fields,
        })
      );
    case 'extract_json_api':
      return ok(await detectJsonApis(args.url));
    case 'extract_cache': {
      if (args.action === 'clear') {
        cacheClear();
        return ok({ ok: true, cleared: true, config: { ttl: getConfig().cacheTtlSec } });
      }
      return ok({ ...cacheStats(), ttlSec: getConfig().cacheTtlSec, enabled: getConfig().cacheEnabled });
    }
    default:
      throw new Error(`Unknown extract tool: ${name}`);
  }
}

export const EXTRACT_TOOL_NAMES = new Set(MCP_EXTRACT_TOOLS.map((t) => t.name));
