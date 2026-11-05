/**
 * Site map discovery — Firecrawl /map inspired (sitemap + same-origin link harvest).
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml, extractLinks } from './parse-html.js';
import { fetchRobotsTxt, fetchSitemap } from './discovery.js';

export async function mapSite(opts: {
  url: string;
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  sitemapMode?: 'include' | 'skip' | 'only';
}) {
  const limit = Math.min(opts.limit ?? 200, 2000);
  const base = new URL(opts.url);
  const origin = base.origin;
  const host = base.hostname;
  const found = new Map<string, { url: string; source: string; score: number }>();

  const add = (raw: string, source: string, score = 0) => {
    try {
      const u = new URL(raw, origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      if (opts.ignoreQueryParameters !== false) {
        u.search = '';
        u.hash = '';
      }
      const same =
        opts.includeSubdomains === false
          ? u.hostname === host
          : u.hostname === host || u.hostname.endsWith('.' + host);
      if (!same) return;
      const href = u.toString();
      const prev = found.get(href);
      if (!prev || score > prev.score) found.set(href, { url: href, source, score });
    } catch {
      /* */
    }
  };

  add(base.toString(), 'seed', 100);

  const mode = opts.sitemapMode || 'include';
  if (mode !== 'skip') {
    try {
      const robots = await fetchRobotsTxt(opts.url);
      const sitemapList: string[] = [...(robots?.sitemaps || [])];
      if (!sitemapList.length) sitemapList.push(`${origin}/sitemap.xml`);
      for (const sm of sitemapList.slice(0, 5)) {
        try {
          const parsed = await fetchSitemap(sm, Math.min(limit, 500));
          for (const loc of parsed?.urls || []) add(loc, 'sitemap', 50);
          if (found.size >= limit) break;
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  }

  if (mode !== 'only' && found.size < limit) {
    try {
      const page = await fetchUrl(opts.url);
      const $ = loadHtml(page.bodyText);
      for (const link of extractLinks($, page.finalUrl, 500)) {
        add(link.href, 'html', 10);
      }
    } catch {
      /* */
    }
  }

  let list = [...found.values()];
  if (opts.search) {
    const q = opts.search.toLowerCase();
    list = list
      .map((e) => ({
        ...e,
        score: e.score + (e.url.toLowerCase().includes(q) ? 80 : 0),
      }))
      .sort((a, b) => b.score - a.score);
  } else {
    list.sort((a, b) => b.score - a.score);
  }

  return {
    url: opts.url,
    count: Math.min(list.length, limit),
    urls: list.slice(0, limit),
    note: 'Firecrawl /map inspired — sitemap + HTML link harvest, same-origin.',
  };
}
