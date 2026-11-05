/**
 * Lightweight web search via DuckDuckGo HTML (no API key).
 * Inspired by Firecrawl search / Jina search_web — free self-hosted path only.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml } from './parse-html.js';

export async function searchWeb(opts: { query: string; limit?: number }) {
  const limit = Math.min(opts.limit ?? 10, 25);
  const q = opts.query.trim();
  if (!q) throw new Error('query required');

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const res = await fetchUrl(url, {
    ignoreCache: true,
    headers: {
      // DDG HTML endpoint
      Accept: 'text/html',
    },
  });
  const $ = loadHtml(res.bodyText);
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return;
    const a = $(el).find('a.result__a').first();
    const title = a.text().trim();
    let href = a.attr('href') || '';
    // DDG sometimes wraps redirects
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

  // Fallback selectors
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

  return {
    query: q,
    count: results.length,
    results: results.slice(0, limit),
    provider: 'duckduckgo-html',
    note: 'Free HTML scrape — no API key. For production SERP use Bright Data / Firecrawl / Jina with your own key beside this server.',
  };
}
