/**
 * Optional LLM schema extract (ScrapeGraphAI / Firecrawl extract / Stagehand extract inspired).
 * Uses GEMINI_API_KEY when present; otherwise returns a clear skip.
 */
import { fetchUrl } from './http-fetch.js';
import { loadHtml, extractReadable, visibleText } from './parse-html.js';

export async function llmExtract(opts: {
  url: string;
  prompt?: string;
  schema?: Record<string, unknown>;
}) {
  const key = process.env.GEMINI_API_KEY;
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) {
    return { ok: false, status: r.status, error: json?.error?.message || JSON.stringify(json).slice(0, 500) };
  }
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* keep raw */
  }
  return { ok: true, url: res.finalUrl, data, model: 'gemini-2.0-flash' };
}
