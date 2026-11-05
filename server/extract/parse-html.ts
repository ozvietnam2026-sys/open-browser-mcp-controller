/**
 * HTML parsing utilities built on cheerio (serverless-friendly).
 */
import * as cheerio from 'cheerio';

export type CheerioAPI = cheerio.CheerioAPI;

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

export function absolutize(baseUrl: string, href: string | undefined | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

export function visibleText($: CheerioAPI, max = 80_000): string {
  const clone = loadHtml($.root().html() || '');
  clone('script,style,noscript,svg,iframe').remove();
  const text = clone('body').text().replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** Lightweight Readability-like article extraction */
export function extractReadable($: CheerioAPI, url: string): {
  title: string;
  byline: string | null;
  excerpt: string;
  contentHtml: string;
  contentMarkdown: string;
  wordCount: number;
} {
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url;

  const byline =
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content') ||
    $('[rel="author"]').first().text().trim() ||
    null;

  const article =
    $('article').first().length > 0
      ? $('article').first()
      : $('main').first().length > 0
        ? $('main').first()
        : $('[role="main"]').first().length > 0
          ? $('[role="main"]').first()
          : $('body');

  const cloneHtml = article.html() || '';
  const $c = loadHtml(`<div id="root">${cloneHtml}</div>`);
  $c('script,style,noscript,nav,footer,aside,form,iframe,svg').remove();
  $c('#root').find('[class*="nav"],[class*="menu"],[class*="sidebar"],[class*="ad-"],[id*="comment"]').remove();

  const contentHtml = $c('#root').html() || '';
  const paragraphs: string[] = [];
  $c('#root')
    .find('h1,h2,h3,h4,p,li,blockquote,pre')
    .each((_, el) => {
      const tag = (el as any).tagName?.toLowerCase?.() || 'p';
      const t = $c(el).text().replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (tag === 'h1') paragraphs.push(`# ${t}`);
      else if (tag === 'h2') paragraphs.push(`## ${t}`);
      else if (tag === 'h3') paragraphs.push(`### ${t}`);
      else if (tag === 'h4') paragraphs.push(`#### ${t}`);
      else if (tag === 'li') paragraphs.push(`- ${t}`);
      else if (tag === 'blockquote') paragraphs.push(`> ${t}`);
      else if (tag === 'pre') paragraphs.push('```\n' + t + '\n```');
      else paragraphs.push(t);
    });

  // Prefer .md / llms.txt style preference note (inspired by agent-browser read)
  let contentMarkdown = paragraphs.join('\n\n');
  if (!contentMarkdown.trim()) {
    contentMarkdown = $c('#root').text().replace(/\s+/g, ' ').trim();
  }
  if (contentMarkdown.length > 100_000) {
    contentMarkdown = contentMarkdown.slice(0, 100_000) + '\n…[truncated]';
  }

  const excerpt =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    contentMarkdown.slice(0, 280);

  const wordCount = contentMarkdown.split(/\s+/).filter(Boolean).length;

  return { title, byline, excerpt, contentHtml: contentHtml.slice(0, 200_000), contentMarkdown, wordCount };
}

export function extractMetadata($: CheerioAPI, baseUrl: string) {
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) og[prop.replace(/^og:/, '')] = content;
  });

  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content) twitter[name.replace(/^twitter:/, '')] = content;
  });

  const meta: Record<string, string> = {};
  $('meta[name]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content && !name.startsWith('twitter:')) meta[name] = content;
  });

  const jsonLd: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else jsonLd.push(parsed);
    } catch {
      jsonLd.push({ _parseError: true, raw: raw.slice(0, 500) });
    }
  });

  const microdata: Array<Record<string, any>> = [];
  $('[itemscope]').each((_, el) => {
    const $el = $(el);
    const item: Record<string, any> = {
      itemtype: $el.attr('itemtype') || null,
      properties: {} as Record<string, string>,
    };
    $el.find('[itemprop]').each((__, propEl) => {
      const $p = $(propEl);
      const key = $p.attr('itemprop');
      if (!key) return;
      const val = $p.attr('content') || $p.attr('href') || $p.attr('src') || $p.text().replace(/\s+/g, ' ').trim();
      if (val) item.properties[key] = val.slice(0, 500);
    });
    microdata.push(item);
  });

  const canonical = absolutize(baseUrl, $('link[rel="canonical"]').attr('href'));
  const icons = $('link[rel~="icon"], link[rel="apple-touch-icon"]')
    .map((_, el) => absolutize(baseUrl, $(el).attr('href')))
    .get()
    .filter(Boolean);

  return {
    title: $('title').first().text().trim(),
    description: meta.description || og.description || null,
    canonical,
    language: $('html').attr('lang') || null,
    openGraph: og,
    twitter,
    meta,
    jsonLd,
    microdata: microdata.slice(0, 50),
    icons,
  };
}

export function extractLinks($: CheerioAPI, baseUrl: string, limit = 200) {
  const links: Array<{ text: string; href: string; rel?: string }> = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    if (links.length >= limit) return false;
    const href = absolutize(baseUrl, $(el).attr('href'));
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({
      text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200),
      href,
      rel: $(el).attr('rel') || undefined,
    });
  });
  return links;
}

export function extractTables($: CheerioAPI, limit = 20) {
  const tables: Array<{ headers: string[]; rows: string[][]; caption?: string }> = [];
  $('table').each((i, el) => {
    if (i >= limit) return false;
    const $t = $(el);
    const headers: string[] = [];
    $t.find('thead th, tr:first-child th').each((__, th) => {
      headers.push($(th).text().replace(/\s+/g, ' ').trim());
    });
    const rows: string[][] = [];
    $t.find('tbody tr, tr').each((ri, tr) => {
      const cells = $(tr)
        .find('td,th')
        .map((__, td) => $(td).text().replace(/\s+/g, ' ').trim())
        .get();
      if (cells.length === 0) return;
      // skip header-only first row if already captured
      if (ri === 0 && headers.length && cells.join('|') === headers.join('|')) return;
      rows.push(cells);
    });
    tables.push({
      headers,
      rows: rows.slice(0, 200),
      caption: $t.find('caption').first().text().trim() || undefined,
    });
  });
  return tables;
}

export function extractLists($: CheerioAPI, limit = 30) {
  const lists: Array<{ type: 'ul' | 'ol'; items: string[] }> = [];
  $('ul,ol').each((i, el) => {
    if (i >= limit) return false;
    const $l = $(el);
    const items = $l
      .children('li')
      .map((_, li) => $(li).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
      .slice(0, 100);
    if (items.length) {
      lists.push({ type: (el as any).tagName?.toLowerCase() === 'ol' ? 'ol' : 'ul', items });
    }
  });
  return lists;
}

export function extractBySchema(
  $: CheerioAPI,
  baseUrl: string,
  schema: Record<string, string | { selector: string; attr?: string; many?: boolean }>
) {
  const out: Record<string, any> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const selector = typeof spec === 'string' ? spec : spec.selector;
    const attr = typeof spec === 'string' ? undefined : spec.attr;
    const many = typeof spec === 'string' ? false : !!spec.many;
    const nodes = $(selector);
    if (many) {
      out[key] = nodes
        .map((_, el) => {
          const $el = $(el);
          const val = attr ? $el.attr(attr) : $el.text().replace(/\s+/g, ' ').trim();
          return attr === 'href' || attr === 'src' ? absolutize(baseUrl, val) : val;
        })
        .get()
        .filter((v) => v != null && v !== '');
    } else {
      const $el = nodes.first();
      const val = attr ? $el.attr(attr) : $el.text().replace(/\s+/g, ' ').trim();
      out[key] = attr === 'href' || attr === 'src' ? absolutize(baseUrl, val) : val || null;
    }
  }
  return out;
}
