/**
 * Optional LLM schema extract (ScrapeGraphAI / Firecrawl extract / Stagehand extract inspired).
 * Uses GEMINI_API_KEY when present; otherwise returns a clear skip.
 * Model cascade: prefer latest flash, fall back on 404/429/503.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml, extractReadable, visibleText } from './parse-html.js';

const MODEL_CASCADE = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
].filter(Boolean) as string[];

export async function llmExtract(opts: {
  url: string;
  prompt?: string;
  schema?: Record<string, unknown>;
}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY not set. LLM extract skipped. Use extract_structured (CSS schema) instead, or set the key.',
      fallback: 'extract_structured',
    };
  }

  const res = await fetchUrl(opts.url);
  const $ = loadHtml(res.bodyText);
  const readable = extractReadable($, res.finalUrl);
  const text = (readable.contentMarkdown || visibleText($)).slice(0, 24_000);

  const schemaHint = opts.schema ? JSON.stringify(opts.schema) : '{"fields":"infer useful structured fields"}';
  const prompt =
    opts.prompt ||
    `Extract structured JSON from the web page content. Follow this schema hint: ${schemaHint}. Return ONLY valid JSON.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${prompt}\n\nURL: ${res.finalUrl}\nTitle: ${readable.title}\n\nCONTENT:\n${text}` }],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  const tried: string[] = [];
  const errors: string[] = [];
  for (const model of MODEL_CASCADE) {
    tried.push(model);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await r.json()) as any;
      if (!r.ok) {
        const msg = json?.error?.message || JSON.stringify(json).slice(0, 300);
        errors.push(`${model}:${r.status}:${msg}`);
        // Retry next model on unavailable / rate / not found
        if ([404, 429, 500, 503].includes(r.status)) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        return { ok: false, status: r.status, error: msg, tried, model };
      }
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      return { ok: true, url: res.finalUrl, data, model, tried };
    } catch (err: any) {
      errors.push(`${model}:throw:${err?.message || err}`);
      continue;
    }
  }

  return {
    ok: false,
    status: 503,
    error: 'All Gemini models failed or were overloaded. Retry later.',
    tried,
    errors: errors.slice(0, 8),
  };
}
