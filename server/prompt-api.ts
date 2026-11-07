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
  /** obmc-key-rotation-20261107 — masked slot in use, e.g. 2/3 (never the key itself). */
  keySlot?: string;
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

/**
 * obmc-key-rotation-20261107 — API key pool for daily-quota rotation.
 * Sources (deduped, order preserved): GEMINI_API_KEYS="k1,k2,k3" · GEMINI_API_KEY · GEMINI_API_KEY_2..9.
 * On a quota error (429/RESOURCE_EXHAUSTED) the caller rotates to the next key.
 */
export function parseApiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t && !seen.has(t)) { seen.add(t); keys.push(t); }
  };
  if (typeof env.GEMINI_API_KEYS === 'string') env.GEMINI_API_KEYS.split(/[,\s]+/).forEach(add);
  add(env.GEMINI_API_KEY);
  for (let i = 2; i <= 9; i++) add(env['GEMINI_API_KEY_' + i]);
  return keys;
}

export function isQuotaError(message: string | undefined | null): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|rate ?limit|exceeded/i.test(String(message || ''));
}

/** Sticky slot: remember the last healthy key so steady-state traffic skips exhausted keys. */
let lastGoodKeySlot = 0;

export async function runPrompt(
  prompt: string,
  opts: { model?: string; options?: PromptRunOptions; env?: NodeJS.ProcessEnv } = {}
): Promise<PromptRunResult> {
  const env = opts.env ?? process.env;
  const apiKeys = parseApiKeys(env);
  if (apiKeys.length === 0) {
    return { model: '', text: '', timingMs: 0, error: getMissingGeminiKeyMessage(env) };
  }

  const models = opts.model ? [opts.model] : promptModelCascade(env);

  // obmc-key-rotation-20261107 — on a daily-quota/429 exhaustion the whole key slot is skipped
  // for this request and the sticky pointer moves on; non-quota errors keep the old cascade behavior.
  const started = Date.now();
  let lastError: any;
  let keySlotUsed = 0;
  for (let k = 0; k < apiKeys.length; k++) {
    const slot = (lastGoodKeySlot + k) % apiKeys.length;
    const ai = new GoogleGenAI({
      apiKey: apiKeys[slot],
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

  const { thinkingLevel, maxOutputTokens, systemInstructions } = opts.options ?? {};
  const config: Record<string, unknown> = {};
  if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;
  if (systemInstructions) config.systemInstruction = systemInstructions;
  if (thinkingLevel) config.thinkingConfig = { thinkingLevel };
  const useConfig = Object.keys(config).length > 0;

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
      lastGoodKeySlot = slot;
      keySlotUsed = slot;
      return { model, text, timingMs: Date.now() - started, config: useConfig ? config : undefined, keySlot: `${slot + 1}/${apiKeys.length}` };
    } catch (err: any) {
      lastError = err;
      if (/404|429|503|high demand|no longer available|not found/i.test(String(err?.message || err))) continue;
      break;
    }
  }
  // Quota death on this slot → rotate to the next key and retry the whole cascade once there.
  if (isQuotaError(String(lastError?.message || lastError)) && k < apiKeys.length - 1) {
    lastGoodKeySlot = (slot + 1) % apiKeys.length;
    continue;
  }
  break;
  }
  const result: PromptRunResult = {
    model: models[0],
    text: '',
    timingMs: Date.now() - started,
    error: String(lastError?.message || lastError),
    keySlot: `${keySlotUsed + 1}/${apiKeys.length}`,
  };
  return result;
}
