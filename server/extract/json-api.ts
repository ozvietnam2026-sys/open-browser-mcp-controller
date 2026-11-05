import { fetchUrl } from './http-fetch.js';
import { loadHtml, absolutize } from './parse-html.js';

export async function detectJsonApis(pageUrl: string) {
  const res = await fetchUrl(pageUrl, { timeoutMs: 15000 });
  const contentType = res.contentType.toLowerCase();
  const findings: any[] = [];

  if (contentType.includes('application/json') || looksLikeJson(res.bodyText)) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(res.bodyText);
    } catch {
      parsed = null;
    }
    findings.push({
      type: 'direct_json',
      url: res.finalUrl,
      keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 40) : [],
      preview: summarizeJson(parsed ?? res.bodyText.slice(0, 500)),
    });
    return { pageUrl, contentType, findings };
  }

  const $ = loadHtml(res.bodyText);

  // Common JSON endpoints linked from the page
  const candidates = new Set<string>();
  $('a[href], link[href], script[src]').each((_, el) => {
    const href = $(el).attr('href') || $(el).attr('src');
    const abs = absolutize(res.finalUrl, href);
    if (!abs) return;
    if (/\.json(\?|$)/i.test(abs) || /\/api\//i.test(abs) || /graphql/i.test(abs)) {
      candidates.add(abs);
    }
  });

  // Inline __NEXT_DATA__ / JSON blobs
  $('script#__NEXT_DATA__, script[type="application/json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      findings.push({
        type: 'inline_json',
        id: $(el).attr('id') || null,
        keys: typeof parsed === 'object' && parsed ? Object.keys(parsed).slice(0, 40) : [],
        preview: summarizeJson(parsed),
      });
    } catch {
      /* ignore */
    }
  });

  // Probe a few candidate endpoints (HEAD/GET limited)
  let probed = 0;
  for (const cand of candidates) {
    if (probed >= 5) break;
    probed += 1;
    try {
      const r = await fetchUrl(cand, { timeoutMs: 8000, maxBytes: 500_000 });
      if (r.contentType.includes('json') || looksLikeJson(r.bodyText)) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(r.bodyText);
        } catch {
          /* */
        }
        findings.push({
          type: 'linked_endpoint',
          url: r.finalUrl,
          status: r.status,
          contentType: r.contentType,
          keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 40) : [],
          preview: summarizeJson(parsed ?? r.bodyText.slice(0, 300)),
        });
      }
    } catch (err: any) {
      findings.push({ type: 'linked_endpoint', url: cand, error: err?.message || String(err) });
    }
  }

  // Also try /.well-known and common patterns
  const origin = new URL(res.finalUrl).origin;
  for (const path of ['/api', '/api/v1', '/graphql', '/wp-json', '/feed.json']) {
    if (probed >= 8) break;
    probed += 1;
    const u = origin + path;
    try {
      const r = await fetchUrl(u, { timeoutMs: 5000, maxBytes: 200_000 });
      if (r.status < 500 && (r.contentType.includes('json') || looksLikeJson(r.bodyText))) {
        findings.push({
          type: 'probed_endpoint',
          url: r.finalUrl,
          status: r.status,
          contentType: r.contentType,
          preview: r.bodyText.slice(0, 300),
        });
      }
    } catch {
      /* ignore */
    }
  }

  return {
    pageUrl,
    contentType,
    candidateCount: candidates.size,
    findings,
  };
}

function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

function summarizeJson(value: any, depth = 0): any {
  if (depth > 2) return typeof value;
  if (value == null) return value;
  if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 2).map((v) => summarizeJson(v, depth + 1)) };
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value).slice(0, 15)) {
      out[k] = typeof v === 'object' ? summarizeJson(v, depth + 1) : v;
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 200);
  return value;
}
