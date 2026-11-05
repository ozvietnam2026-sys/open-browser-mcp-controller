import { fetchUrl } from './http-fetch.js';
import { loadHtml, extractLinks, extractReadable } from './parse-html.js';

export interface CrawlOptions {
  startUrl: string;
  maxPages?: number;
  sameOriginOnly?: boolean;
  delayMs?: number;
  extractReadable?: boolean;
}

export async function crawlSite(options: CrawlOptions) {
  const maxPages = Math.min(options.maxPages ?? 5, 20);
  const sameOriginOnly = options.sameOriginOnly !== false;
  const delayMs = Math.max(0, options.delayMs ?? 200);
  const origin = new URL(options.startUrl).origin;

  const queue: string[] = [options.startUrl];
  const seen = new Set<string>();
  const pages: any[] = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const res = await fetchUrl(url, { timeoutMs: 15000, maxBytes: 1_500_000 });
      if (!res.contentType.includes('html') && !res.bodyText.trimStart().startsWith('<')) {
        pages.push({ url, status: res.status, skipped: true, reason: `non-html: ${res.contentType}` });
        continue;
      }
      const $ = loadHtml(res.bodyText);
      const title = $('title').first().text().trim();
      const links = extractLinks($, res.finalUrl, 100);
      const page: any = {
        url: res.finalUrl,
        status: res.status,
        title,
        linkCount: links.length,
        elapsedMs: res.elapsedMs,
      };
      if (options.extractReadable) {
        const readable = extractReadable($, res.finalUrl);
        page.readable = {
          title: readable.title,
          wordCount: readable.wordCount,
          excerpt: readable.excerpt,
          markdownPreview: readable.contentMarkdown.slice(0, 1500),
        };
      }
      pages.push(page);

      for (const link of links) {
        try {
          const abs = new URL(link.href);
          if (sameOriginOnly && abs.origin !== origin) continue;
          if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
          abs.hash = '';
          const next = abs.toString();
          if (!seen.has(next) && !queue.includes(next)) queue.push(next);
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      pages.push({ url, error: err?.message || String(err) });
    }

    if (delayMs && queue.length && pages.length < maxPages) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    startUrl: options.startUrl,
    pagesCrawled: pages.length,
    queuedRemaining: queue.length,
    seen: seen.size,
    pages,
  };
}

/** Follow pagination via CSS selector next-link or page URL pattern */
export async function paginateExtract(options: {
  startUrl: string;
  itemSelector: string;
  nextSelector?: string;
  maxPages?: number;
  fields?: Record<string, string>;
}) {
  const maxPages = Math.min(options.maxPages ?? 5, 15);
  const items: any[] = [];
  let url: string | null = options.startUrl;
  let page = 0;

  while (url && page < maxPages) {
    page += 1;
    const res = await fetchUrl(url, { timeoutMs: 15000 });
    const $ = loadHtml(res.bodyText);
    $(options.itemSelector).each((_, el) => {
      const $el = $(el);
      if (options.fields && Object.keys(options.fields).length) {
        const row: Record<string, string> = {};
        for (const [k, sel] of Object.entries(options.fields)) {
          row[k] = $el.find(sel).first().text().replace(/\s+/g, ' ').trim();
        }
        items.push(row);
      } else {
        items.push({ text: $el.text().replace(/\s+/g, ' ').trim().slice(0, 500) });
      }
    });

    if (!options.nextSelector) break;
    const nextHref = $(options.nextSelector).first().attr('href');
    if (!nextHref) break;
    try {
      url = new URL(nextHref, res.finalUrl).toString();
    } catch {
      break;
    }
  }

  return { pages: page, itemCount: items.length, items: items.slice(0, 500) };
}
