/**
 * Change tracking store — Firecrawl changeTracking inspired (git-diff / status).
 * Persists snapshots under data/ so Docker keeps history; Vercel is ephemeral /tmp.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getConfig } from '../config.js';

type Snap = { url: string; tag: string; hash: string; markdown: string; at: number };

type Store = Record<string, Snap>; // key = tag::url

function storePath() {
  const p = getConfig().changeStorePath;
  // On Vercel use /tmp
  if (process.env.VERCEL) return path.join('/tmp', 'obmc-change-store.json');
  return path.resolve(p);
}

function load(): Store {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(store: Store) {
  try {
    const p = storePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store));
  } catch {
    /* best-effort */
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

export function trackChange(opts: {
  url: string;
  markdown: string;
  tag?: string;
}): {
  status: 'new' | 'same' | 'changed';
  previousAt?: number;
  hash: string;
  previousHash?: string;
  diff?: string;
} {
  const tag = opts.tag || 'default';
  const store = load();
  const k = key(opts.url, tag);
  const hash = hashText(opts.markdown);
  const prev = store[k];
  store[k] = { url: opts.url, tag, hash, markdown: opts.markdown.slice(0, 200_000), at: Date.now() };
  save(store);

  if (!prev) return { status: 'new', hash };
  if (prev.hash === hash) return { status: 'same', hash, previousHash: prev.hash, previousAt: prev.at };
  return {
    status: 'changed',
    hash,
    previousHash: prev.hash,
    previousAt: prev.at,
    diff: lineDiff(prev.markdown, opts.markdown),
  };
}
