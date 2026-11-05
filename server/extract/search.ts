/**
 * Web search cascade (Firecrawl / Jina / Tavily market pattern):
 *   Tavily (TAVILY_API_KEY) → Jina s.jina.ai (JINA_API_KEY) → Wikipedia OpenSearch (keyless)
 *   → DuckDuckGo HTML → clear guidance when all fail.
 *
 * Note: s.jina.ai keyless is blocked (needs API key). Code still probes once and reports.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml } from './parse-html.js';

export type SearchHit = { title: string; url: string; snippet: string };
export type SearchResult = {
  query: string;
  count: number;
  results: SearchHit[];
  provider: string;
  source?: string;
  degraded?: boolean;
  errors?: string[];
  note?: string;
  tried?: string[];
};

function parseDdgResults(html: string, limit: number): SearchHit[] {
  const $ = loadHtml(html);
  const results: SearchHit[] = [];

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

async function searchTavily(q: string, limit: number): Promise<SearchResult | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query: q,
      max_results: Math.min(limit, 10),
      include_answer: false,
      search_depth: 'basic',
    }),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`tavily ${res.status}: ${json?.detail || json?.error || JSON.stringify(json).slice(0, 200)}`);
  const results: SearchHit[] = (json.results || []).map((r: any) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.content || r.snippet || '',
  }));
  return {
    query: q,
    count: results.length,
    results: results.slice(0, limit),
    provider: 'tavily',
    source: 'https://api.tavily.com/search',
    note: 'Tavily free tier — auto-enabled via TAVILY_API_KEY.',
  };
}

async function searchJina(q: string, limit: number, withKey: boolean): Promise<SearchResult | null> {
  const key = process.env.JINA_API_KEY;
  if (withKey && !key) return null;
  const url = `https://s.jina.ai/${encodeURIComponent(q)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Return-Format': 'json',
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`jina ${res.status}: ${text.slice(0, 220)}`);
  }
  let results: SearchHit[] = [];
  try {
    const json = JSON.parse(text);
    const data = json.data || json.results || json;
    if (Array.isArray(data)) {
      results = data.slice(0, limit).map((r: any) => ({
        title: r.title || r.url || 'result',
        url: r.url || r.link || '',
        snippet: (r.description || r.content || r.snippet || '').toString().slice(0, 400),
      }));
    }
  } catch {
    // Markdown-ish fallback: parse [title](url) lines
    const lines = text.split('\n');
    for (const line of lines) {
      if (results.length >= limit) break;
      const m = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      if (m) results.push({ title: m[1], url: m[2], snippet: '' });
    }
  }
  results = results.filter((r) => r.url);
  return {
    query: q,
    count: results.length,
    results,
    provider: key ? 'jina-search' : 'jina-search-keyless',
    source: url,
    note: key
      ? 'Jina s.jina.ai — auto-enabled via JINA_API_KEY.'
      : 'Jina keyless probe (often 401 from datacenter IPs).',
  };
}

async function searchWikipedia(q: string, limit: number): Promise<SearchResult | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}&namespace=0&format=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenBrowserMCP/4.1 (research; +https://github.com/ozvietnam2026-sys/open-browser-mcp-controller)' },
  });
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  const data = (await res.json()) as [string, string[], string[], string[]];
  const titles = data[1] || [];
  const snippets = data[2] || [];
  const urls = data[3] || [];
  const results: SearchHit[] = titles.map((title, i) => ({
    title,
    url: urls[i],
    snippet: snippets[i] || '',
  }));
  return {
    query: q,
    count: results.length,
    results: results.slice(0, limit),
    provider: 'wikipedia-opensearch',
    source: url,
    note: 'Keyless Wikipedia OpenSearch fallback (encyclopedia scope, not a full SERP).',
  };
}

async function searchDdg(q: string, limit: number): Promise<SearchResult> {
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
      const results = parseDdgResults(res.bodyText, limit);
      if (results.length || res.status < 400) {
        return {
          query: q,
          count: results.length,
          results,
          provider: 'duckduckgo-html',
          source: url,
          note: 'Free HTML scrape — no API key. Datacenter IPs often get 403.',
        };
      }
      errors.push(`${url} -> empty (HTTP ${res.status})`);
    } catch (e) {
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }
  return {
    query: q,
    count: 0,
    results: [],
    provider: 'duckduckgo-html',
    degraded: true,
    errors,
  };
}

export async function searchWeb(opts: { query: string; limit?: number }): Promise<SearchResult> {
  const limit = Math.min(opts.limit ?? 10, 25);
  const q = opts.query.trim();
  if (!q) throw new Error('query required');

  const providerPref = (process.env.SEARCH_PROVIDER || 'auto').toLowerCase();
  const tried: string[] = [];
  const errors: string[] = [];

  const force = (name: string) => providerPref === name;
  const auto = providerPref === 'auto';

  const tryOne = async (label: string, fn: () => Promise<SearchResult | null>) => {
    if (!auto && !force(label) && !(label.startsWith('jina') && force('jina'))) return null;
    tried.push(label);
    try {
      const r = await fn();
      if (r && r.count > 0) return { ...r, tried };
      if (r && r.degraded) errors.push(...(r.errors || [`${label}: empty`]));
      else if (r) errors.push(`${label}: 0 results`);
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
    }
    return null;
  };

  // Ordered cascade for auto
  if (auto || force('tavily')) {
    const r = await tryOne('tavily', () => searchTavily(q, limit));
    if (r) return r;
  }
  if (auto || force('jina')) {
    if (process.env.JINA_API_KEY) {
      const r = await tryOne('jina', () => searchJina(q, limit, true));
      if (r) return r;
    } else if (auto) {
      // Keyless probe once — documented as usually blocked
      const r = await tryOne('jina-keyless', () => searchJina(q, limit, false));
      if (r && r.count > 0) return r;
    }
  }
  if (auto || force('wikipedia')) {
    const r = await tryOne('wikipedia', () => searchWikipedia(q, limit));
    if (r) return r;
  }
  if (auto || force('duckduckgo') || force('ddg')) {
    const r = await tryOne('duckduckgo', async () => searchDdg(q, limit));
    if (r && r.count > 0) return r;
    if (r) errors.push(...(r.errors || []));
  }

  const howTo = [
    'All search providers returned empty or were blocked from this host.',
    'Set TAVILY_API_KEY (free, no card: https://tavily.com) — recommended on Vercel.',
    'Or set JINA_API_KEY (https://jina.ai/?sui=apikey) for s.jina.ai.',
    'Optional: SEARCH_PROVIDER=tavily|jina|wikipedia|duckduckgo to force one.',
    's.jina.ai keyless is blocked from most datacenter IPs (401 AuthenticationRequired).',
  ].join(' ');

  return {
    query: q,
    count: 0,
    results: [],
    provider: 'none',
    degraded: true,
    errors,
    tried,
    note: howTo,
  };
}
