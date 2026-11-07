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
  config?: Record<string, unknown>;
  error?: string;
}

/** obmc-prompt-api-20261107 — the four Thinking levels the SDK exposes (verified in @google/genai typings). */
export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface PromptRunOptions {
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  systemInstructions?: string;
}

function pickString(body: any, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Accepts both camelCase and the snake_case that AI Studio's "Get code" emits
 * (thinking_level / max_output_tokens / system_instructions) so configs copy over 1-1.
 */
export function validatePromptRunRequest(body: any): {
  prompt?: string; model?: string; options?: PromptRunOptions; error?: string;
} {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return { error: 'Thiếu prompt (chuỗi 1-8000 ký tự)' };
  if (prompt.length > 8000) return { error: 'Prompt quá dài (tối đa 8000 ký tự)' };
  const model = pickString(body, 'model')?.slice(0, 64);

  const options: PromptRunOptions = {};
  const thinkingLevel = pickString(body, 'thinkingLevel', 'thinking_level')?.toLowerCase();
  if (thinkingLevel) {
    if (!(THINKING_LEVELS as readonly string[]).includes(thinkingLevel)) {
      return { error: `thinkingLevel không hợp lệ (${THINKING_LEVELS.join('/')})` };
    }
    options.thinkingLevel = thinkingLevel as ThinkingLevel;
  }
  const rawTokens = body?.maxOutputTokens ?? body?.max_output_tokens;
  if (rawTokens != null) {
    const n = Number(rawTokens);
    if (!Number.isInteger(n) || n < 1 || n > 65536) {
      return { error: 'maxOutputTokens phải là số nguyên 1-65536' };
    }
    options.maxOutputTokens = n;
  }
  const systemInstructions = pickString(body, 'systemInstructions', 'system_instructions', 'system_instruction');
  if (systemInstructions) {
    if (systemInstructions.length > 8000) return { error: 'systemInstructions quá dài (tối đa 8000 ký tự)' };
    options.systemInstructions = systemInstructions;
  }

  return { prompt, model, options: Object.keys(options).length ? options : undefined };
}

export function promptModelCascade(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest']
    .filter(Boolean) as string[];
}

export async function runPrompt(
  prompt: string,
  opts: { model?: string; options?: PromptRunOptions; env?: NodeJS.ProcessEnv } = {}
): Promise<PromptRunResult> {
  const env = opts.env ?? process.env;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { model: '', text: '', timingMs: 0, error: getMissingGeminiKeyMessage(env) };

  const models = opts.model ? [opts.model] : promptModelCascade(env);
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  // obmc-prompt-api-20261107 — mirrors AI Studio "Get code": max_output_tokens, thinking_level,
  // system instructions — same names the SDK typings use (ThinkingLevel minimal|low|medium|high).
  const { thinkingLevel, maxOutputTokens, systemInstructions } = opts.options ?? {};
  const config: Record<string, unknown> = {};
  if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;
  if (systemInstructions) config.systemInstruction = systemInstructions;
  if (thinkingLevel) config.thinkingConfig = { thinkingLevel };
  const useConfig = Object.keys(config).length > 0;

  const started = Date.now();
  let lastError: any;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent(
        useConfig ? { model, contents: prompt, config } : { model, contents: prompt }
      );
      const text = ((response.candidates?.[0]?.content?.parts ?? []) as any[])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('Empty response from ' + model);
      return { model, text, timingMs: Date.now() - started, config: useConfig ? config : undefined };
    } catch (err: any) {
      lastError = err;
      if (/404|429|503|high demand|no longer available|not found/i.test(String(err?.message || err))) continue;
      break;
    }
  }
  return { model: models[0], text: '', timingMs: Date.now() - started, error: String(lastError?.message || lastError) };
}
