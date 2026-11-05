/**
 * Change tracking store — Firecrawl changeTracking inspired (git-diff / status).
 * Backends: Upstash Redis (when env set) → file (Docker/local) → /tmp or memory on Vercel.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getConfig } from '../config.js';
import { getPersistStore, namespacedKey, describePersistBackend, redisEnvPresent } from '../infra/persist-store.js';

type Snap = { url: string; tag: string; hash: string; markdown: string; at: number };
type Store = Record<string, Snap>; // key = tag::url

const STORE_KEY = namespacedKey('change', 'store');

function fileFallbackPath() {
  const p = getConfig().changeStorePath;
  if (process.env.VERCEL && !redisEnvPresent()) return path.join('/tmp', 'obmc-change-store.json');
  return path.resolve(p);
}

async function load(): Promise<Store> {
  const store = getPersistStore({ filePath: fileFallbackPath() });
  if (redisEnvPresent() || store.backend !== 'memory') {
    const raw = await store.getJson<Store>(STORE_KEY);
    if (raw) return raw;
  }
  // Legacy direct file (pre-v4.1)
  try {
    const raw = fs.readFileSync(fileFallbackPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function save(data: Store) {
  const store = getPersistStore({ filePath: fileFallbackPath() });
  try {
    await store.setJson(STORE_KEY, data);
  } catch {
    /* */
  }
  // Also mirror to legacy file when not using Redis on long-running hosts
  if (!redisEnvPresent() && !process.env.VERCEL) {
    try {
      const p = fileFallbackPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(data));
    } catch {
      /* */
    }
  }
}

function key(url: string, tag: string) {
  return `${tag}::${url}`;
}

export function hashText(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Simple line diff (git-diff lite). */
export function lineDiff(prev: string, next: string, maxLines = 80): string {
  const a = prev.split('\n');
  const b = next.split('\n');
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max && out.length < maxLines; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] != null && b[i] == null) out.push(`- ${a[i]}`);
    else if (a[i] == null && b[i] != null) out.push(`+ ${b[i]}`);
    else {
      out.push(`- ${a[i]}`);
      out.push(`+ ${b[i]}`);
    }
  }
  if (out.length >= maxLines) out.push('…[diff truncated]');
  return out.join('\n');
}

export async function trackChange(opts: {
  url: string;
  markdown: string;
  tag?: string;
}): Promise<{
  status: 'new' | 'same' | 'changed';
  previousAt?: number;
  hash: string;
  previousHash?: string;
  diff?: string;
  persistBackend?: string;
}> {
  const tag = opts.tag || 'default';
  const store = await load();
  const k = key(opts.url, tag);
  const hash = hashText(opts.markdown);
  const prev = store[k];
  store[k] = { url: opts.url, tag, hash, markdown: opts.markdown.slice(0, 200_000), at: Date.now() };
  await save(store);
  const backend = describePersistBackend().backend;

  if (!prev) return { status: 'new', hash, persistBackend: backend };
  if (prev.hash === hash) return { status: 'same', hash, previousHash: prev.hash, previousAt: prev.at, persistBackend: backend };
  return {
    status: 'changed',
    hash,
    previousHash: prev.hash,
    previousAt: prev.at,
    diff: lineDiff(prev.markdown, opts.markdown),
    persistBackend: backend,
  };
}
