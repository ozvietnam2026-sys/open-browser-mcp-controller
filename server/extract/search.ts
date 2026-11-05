/**
 * Lightweight web search via DuckDuckGo HTML (no API key).
 * Inspired by Firecrawl search / Jina search_web — free self-hosted path only.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml } from './parse-html.js';

function parseResults(html: string, limit: number) {
  const $ = loadHtml(html);
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return;
    const a = $(el).find('a.result__a').first();
    const title = a.text().trim();
    let href = a.attr('href') || '';
    try {
      const u = new URL(href, 'https://duckduckgo.com');
      const uddg = u.searchParams.get('uddg');
      if (uddg) href = decodeURIComponent(uddg);
      else href = u.toString();
    } catch {
      /* */
    }
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && href) results.push({ title, url: href, snippet });
  });

  if (!results.length) {
    $('a[href^="http"]').each((_, el) => {
      if (results.length >= limit) return;
      const title = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (title.length > 5 && href.includes('.') && !href.includes('duckduckgo.com')) {
        results.push({ title: title.slice(0, 120), url: href, snippet: '' });
      }
    });
  }
  return results.slice(0, limit);
}

export async function searchWeb(opts: { query: string; limit?: number }) {
  const limit = Math.min(opts.limit ?? 10, 25);
  const q = opts.query.trim();
  if (!q) throw new Error('query required');

  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  ];

  const errors: string[] = [];
  for (const url of endpoints) {
    try {
      const res = await fetchUrl(url, {
        ignoreCache: true,
        headers: { Accept: 'text/html' },
      });
      const results = parseResults(res.bodyText, limit);
      if (results.length || res.status < 400) {
        return {
          query: q,
          count: results.length,
          results,
          provider: 'duckduckgo-html',
          source: url,
          note: 'Free HTML scrape — no API key. For production SERP use Bright Data / Firecrawl / Jina with your own key beside this server.',
        };
      }
      errors.push(`${url} -> empty (HTTP ${res.status})`);
    } catch (e) {
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }

  // Soft-fail so agents can continue; smoke expects results array shape
  return {
    query: q,
    count: 0,
    results: [] as Array<{ title: string; url: string; snippet: string }>,
    provider: 'duckduckgo-html',
    degraded: true,
    errors,
    note: 'Search upstream blocked or unreachable from this host. Shape preserved for agents; try again later or plug a SERP key beside this server.',
  };
}
