/**
 * Observe helper — Stagehand observe / Browser Use inspired: list actionable candidates without acting.
 * HTTP-only (Vercel-safe) using cheerio heuristics.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml } from './parse-html.js';

export async function observePage(opts: { url: string; instruction?: string; limit?: number }) {
  const res = await fetchUrl(opts.url);
  const $ = loadHtml(res.bodyText);
  const limit = Math.min(opts.limit ?? 40, 100);
  const candidates: Array<{
    kind: string;
    text: string;
    href?: string;
    name?: string;
    selector: string;
    score: number;
  }> = [];

  const push = (c: (typeof candidates)[0]) => {
    if (candidates.length >= limit * 2) return;
    candidates.push(c);
  };

  $('a[href]').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const href = $(el).attr('href');
    if (!text && !href) return;
    push({
      kind: 'link',
      text: text.slice(0, 120),
      href,
      selector: href ? `a[href="${href.replace(/"/g, '\\"')}"]` : `a:nth-of-type(${i + 1})`,
      score: text.length > 2 ? 5 : 1,
    });
  });

  $('button, [role="button"], input[type="submit"]').each((i, el) => {
    const text =
      $(el).text().replace(/\s+/g, ' ').trim() ||
      $(el).attr('value') ||
      $(el).attr('aria-label') ||
      '';
    push({
      kind: 'button',
      text: text.slice(0, 120),
      name: $(el).attr('name'),
      selector: text ? `button:contains("${text.slice(0, 40)}")` : `button:nth-of-type(${i + 1})`,
      score: 8,
    });
  });

  $('input, textarea, select').each((i, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() || 'input';
    const name = $(el).attr('name') || $(el).attr('id') || $(el).attr('aria-label') || '';
    const type = $(el).attr('type') || tag;
    push({
      kind: 'field',
      text: `${type}${name ? ' ' + name : ''}`.slice(0, 120),
      name,
      selector: name ? `[name="${name.replace(/"/g, '\\"')}"]` : `${tag}:nth-of-type(${i + 1})`,
      score: 7,
    });
  });

  let scored = candidates;
  if (opts.instruction) {
    const words = opts.instruction.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    scored = candidates.map((c) => {
      const hay = `${c.text} ${c.href || ''} ${c.name || ''}`.toLowerCase();
      const hit = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { ...c, score: c.score + hit * 10 };
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    url: res.finalUrl,
    instruction: opts.instruction || null,
    count: Math.min(scored.length, limit),
    candidates: scored.slice(0, limit),
    note: 'Stagehand observe inspired — HTTP heuristics. For live a11y refs use pw_snapshot on Docker.',
  };
}
