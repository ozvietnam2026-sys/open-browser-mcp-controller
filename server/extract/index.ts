/**
 * Multi-strategy web data extraction tools (HTTP-based, Vercel-safe).
 * Inspired by vercel-labs/agent-browser `read`, microsoft/playwright-mcp structured
 * extraction patterns, and github-mcp-server toolset organization.
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

export const MCP_EXTRACT_TOOLS: McpToolDefinition[] = [
  {
    name: 'extract_http_fetch',
    description:
      'Fetch a URL with plain HTTP (no browser). Returns status, headers, content-type, and body text. Best first step for static pages and APIs. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default GET)' },
        maxBytes: { type: 'number', description: 'Max response bytes (default 2MB)' },
        timeoutMs: { type: 'number', description: 'Timeout in ms (default 20000)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_readable',
    description:
      'Fetch a page and convert main content to Markdown (Readability-like). Prefers article/main content; inspired by agent-browser `read`. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page URL' },
        includeHtml: { type: 'boolean', description: 'Also return cleaned HTML (default false)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_structured',
    description:
      'Fetch a page and extract fields via CSS selectors + schema map. Example schema: {"title":"h1","links":{"selector":"a","attr":"href","many":true}}. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page URL' },
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
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_discover',
    description:
      'Discover site structure via robots.txt and sitemaps (sitemap index + loc URLs). Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Site URL or any page on the site' },
        sitemapLimit: { type: 'number', description: 'Max URLs per sitemap (default 50)' },
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
        url: { type: 'string', description: 'Direct sitemap URL' },
        limit: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_crawl',
    description:
      'Multi-page same-origin crawl with hard limits (max 20 pages). Optionally extract readable previews. Works on Vercel with short timeouts.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        maxPages: { type: 'number', description: 'Default 5, max 20' },
        sameOriginOnly: { type: 'boolean', description: 'Default true' },
        delayMs: { type: 'number', description: 'Delay between requests (default 200)' },
        extractReadable: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_paginate',
    description:
      'Follow pagination links and collect items via CSS selectors. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        itemSelector: { type: 'string', description: 'CSS selector for each item' },
        nextSelector: { type: 'string', description: 'CSS selector for next-page link' },
        maxPages: { type: 'number' },
        fields: {
          type: 'object',
          description: 'Optional map of field → relative CSS selector inside each item',
        },
      },
      required: ['url', 'itemSelector'],
    },
  },
  {
    name: 'extract_json_api',
    description:
      'Detect JSON APIs: direct JSON responses, __NEXT_DATA__, linked .json/api endpoints, and common probes. Works on Vercel.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
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
      });
      return ok({
        ...res,
        bodyText: truncate(res.bodyText, 40_000),
      });
    }
    case 'extract_readable': {
      const res = await fetchUrl(args.url);
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
    default:
      throw new Error(`Unknown extract tool: ${name}`);
  }
}

export const EXTRACT_TOOL_NAMES = new Set(MCP_EXTRACT_TOOLS.map((t) => t.name));
