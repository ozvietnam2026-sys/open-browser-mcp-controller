/**
 * obmc-qa-gateway-20261107 — ask→answer records served to other agents.
 * Q&A runs through the server-side Gemini path (runPrompt), every record is persisted
 * (PersistStore: memory → file → Upstash Redis when configured), and the gateway speaks
 * the OpenAI wire format so any router (9router/OneAPI/uni-api…) can add it as a channel.
 */
import { getPersistStore, type PersistStore } from './infra/persist-store.js';
import { runPrompt, promptModelCascade, type PromptRunResult } from './prompt-api.js';

export interface QaRecord {
  id: string;
  question: string;
  answer: string;
  model: string;
  timingMs: number;
  createdAt: string;
  source?: string;
  config?: Record<string, unknown>;
}

const INDEX_KEY = 'qa:index';
const MAX_RECORDS = 200;

function qaStore(): PersistStore {
  return getPersistStore({ namespace: 'obmc-qa' });
}

export async function saveQaRecord(input: Omit<QaRecord, 'id' | 'createdAt'>): Promise<QaRecord> {
  const store = qaStore();
  const record: QaRecord = {
    ...input,
    id: 'qa-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
  };
  await store.setJson('qa:' + record.id, record);
  const index: string[] = (await store.getJson(INDEX_KEY)) || [];
  index.unshift(record.id);
  await store.setJson(INDEX_KEY, index.slice(0, MAX_RECORDS));
  return record;
}

export async function listQa(limit = 20): Promise<QaRecord[]> {
  const store = qaStore();
  const index: string[] = (await store.getJson(INDEX_KEY)) || [];
  const out: QaRecord[] = [];
  for (const id of index.slice(0, Math.max(1, Math.min(limit, MAX_RECORDS)))) {
    const rec = await store.getJson<QaRecord>('qa:' + id);
    if (rec) out.push(rec);
  }
  return out;
}

export async function getQa(id: string): Promise<QaRecord | null> {
  return qaStore().getJson<QaRecord>('qa:' + id);
}

/** Ask + persist in one call — the main Q&A gateway entry. */
export async function askAndSave(
  question: string,
  opts: { model?: string; source?: string; options?: Record<string, unknown> } = {}
): Promise<{ record: QaRecord | null; result: PromptRunResult }> {
  const result = await runPrompt(question, {
    model: opts.model,
    options: opts.options as any,
  });
  if (result.error || !result.text) return { record: null, result };
  const record = await saveQaRecord({
    question,
    answer: result.text,
    model: result.model,
    timingMs: result.timingMs,
    source: opts.source || 'api',
    config: result.config,
  });
  return { record, result };
}

/** Map an OpenAI chat-completions body → runPrompt inputs. */
export function mapOpenAiRequest(body: any): { prompt: string; model?: string; systemInstructions?: string } {
  const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  const systemParts: string[] = [];
  const convo: string[] = [];
  let lastRaw = '';
  for (const m of messages) {
    const content = typeof m?.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    if (m.role === 'system' || m.role === 'developer') systemParts.push(content);
    else if (m.role === 'assistant') convo.push('Trợ lý: ' + content);
    else { convo.push('Người dùng: ' + content); lastRaw = content; }
  }
  // Single user message → ask it verbatim (no role noise); multi-turn → labeled context + question.
  let prompt = '';
  if (convo.length > 1) prompt = convo.slice(0, -1).join('\n') + '\n\nCâu hỏi hiện tại: ' + convo[convo.length - 1];
  else prompt = lastRaw;
  return { prompt, model: typeof body?.model === 'string' ? body.model : undefined, systemInstructions: systemParts.length ? systemParts.join('\n') : undefined };
}

/** runPrompt result → OpenAI chat.completion shape. */
export function toOpenAiResponse(record: QaRecord): unknown {
  return {
    id: 'chatcmpl-' + record.id,
    object: 'chat.completion',
    created: Math.floor(new Date(record.createdAt).getTime() / 1000),
    model: record.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: record.answer },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: Math.ceil(record.question.length / 4),
      completion_tokens: Math.ceil(record.answer.length / 4),
      total_tokens: Math.ceil((record.question.length + record.answer.length) / 4),
    },
  };
}

/** Models this gateway serves, OpenAI list shape. */
export function openAiModelsList(env: NodeJS.ProcessEnv = process.env): unknown {
  const data = promptModelCascade(env).map((id) => ({ id, object: 'model', owned_by: 'obmc' }));
  return { object: 'list', data };
}
