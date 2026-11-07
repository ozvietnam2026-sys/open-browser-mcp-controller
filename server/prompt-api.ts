/**
 * obmc-prompt-api-20261107 — the AI Studio flow (type a prompt, wait for the answer)
 * as a token-authenticated internal API. Backed by the server's GEMINI_API_KEY with
 * the same model cascade as the in-app agent; every call reports which model answered
 * and how long the round trip took.
 */
import { GoogleGenAI } from '@google/genai';
import { getMissingGeminiKeyMessage } from './gemini-agent.js';

export interface PromptRunResult {
  model: string;
  text: string;
  timingMs: number;
  error?: string;
}

export function promptModelCascade(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest']
    .filter(Boolean) as string[];
}

export function validatePromptRunRequest(body: any): { prompt?: string; model?: string; error?: string } {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return { error: 'Thiếu prompt (chuỗi 1-8000 ký tự)' };
  if (prompt.length > 8000) return { error: 'Prompt quá dài (tối đa 8000 ký tự)' };
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 64) : undefined;
  return { prompt, model };
}

export async function runPrompt(
  prompt: string,
  opts: { model?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<PromptRunResult> {
  const env = opts.env ?? process.env;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { model: '', text: '', timingMs: 0, error: getMissingGeminiKeyMessage(env) };

  const models = opts.model ? [opts.model] : promptModelCascade(env);
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const started = Date.now();
  let lastError: any;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const text = ((response.candidates?.[0]?.content?.parts ?? []) as any[])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('Empty response from ' + model);
      return { model, text, timingMs: Date.now() - started };
    } catch (err: any) {
      lastError = err;
      if (/404|429|503|high demand|no longer available|not found/i.test(String(err?.message || err))) continue;
      break;
    }
  }
  return { model: models[0], text: '', timingMs: Date.now() - started, error: String(lastError?.message || lastError) };
}
