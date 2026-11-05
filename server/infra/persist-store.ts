/**
 * PersistStore — Memory | File | Upstash Redis.
 * Auto-enables Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Graceful fallback: Redis → File → Memory. No invented keys.
 */
import fs from 'fs';
import path from 'path';

export type PersistBackend = 'memory' | 'file' | 'upstash-redis';

export interface PersistStore {
  backend: PersistBackend;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** JSON helpers */
  getJson<T = unknown>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSec?: number): Promise<void>;
}

class MemoryStore implements PersistStore {
  backend: PersistBackend = 'memory';
  private map = new Map<string, { v: string; exp?: number }>();

  async get(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) {
      this.map.delete(key);
      return null;
    }
    return e.v;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.map.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
  }
  async del(key: string) {
    this.map.delete(key);
  }
  async getJson<T>(key: string) {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  async setJson(key: string, value: unknown, ttlSec?: number) {
    await this.set(key, JSON.stringify(value), ttlSec);
  }
}

class FileStore implements PersistStore {
  backend: PersistBackend = 'file';
  constructor(private filePath: string) {}

  private readAll(): Record<string, { v: string; exp?: number }> {
    try {
      const resolved = path.resolve(this.filePath);
      if (!fs.existsSync(resolved)) return {};
      return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, { v: string; exp?: number }>) {
    try {
      const resolved = path.resolve(this.filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, JSON.stringify(data));
    } catch {
      /* read-only FS */
    }
  }

  async get(key: string) {
    const all = this.readAll();
    const e = all[key];
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) {
      delete all[key];
      this.writeAll(all);
      return null;
    }
    return e.v;
  }
  async set(key: string, value: string, ttlSec?: number) {
    const all = this.readAll();
    all[key] = { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined };
    this.writeAll(all);
  }
  async del(key: string) {
    const all = this.readAll();
    delete all[key];
    this.writeAll(all);
  }
  async getJson<T>(key: string) {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  async setJson(key: string, value: unknown, ttlSec?: number) {
    await this.set(key, JSON.stringify(value), ttlSec);
  }
}

/** Upstash REST — no SDK required; auto when env present. */
class UpstashRedisStore implements PersistStore {
  backend: PersistBackend = 'upstash-redis';
  constructor(
    private url: string,
    private token: string
  ) {}

  private async cmd(...args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.map(String)),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upstash ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { result?: unknown };
    return json.result ?? null;
  }

  async get(key: string) {
    try {
      const r = await this.cmd('GET', key);
      return r == null ? null : String(r);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string, ttlSec?: number) {
    try {
      if (ttlSec && ttlSec > 0) await this.cmd('SET', key, value, 'EX', ttlSec);
      else await this.cmd('SET', key, value);
    } catch {
      /* best-effort */
    }
  }
  async del(key: string) {
    try {
      await this.cmd('DEL', key);
    } catch {
      /* */
    }
  }
  async getJson<T>(key: string) {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  async setJson(key: string, value: unknown, ttlSec?: number) {
    await this.set(key, JSON.stringify(value), ttlSec);
  }
}

let cached: PersistStore | null = null;

export function redisEnvPresent(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function describePersistBackend(): {
  backend: PersistBackend;
  redisConfigured: boolean;
  note: string;
} {
  if (redisEnvPresent()) {
    return {
      backend: 'upstash-redis',
      redisConfigured: true,
      note: 'UPSTASH_REDIS_REST_URL/TOKEN detected — durable across cold starts.',
    };
  }
  if (process.env.VERCEL) {
    return {
      backend: 'memory',
      redisConfigured: false,
      note: 'Vercel without Upstash — ephemeral per warm instance. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (free at console.upstash.com).',
    };
  }
  return {
    backend: 'file',
    redisConfigured: false,
    note: 'File-backed on long-running host (Docker/local).',
  };
}

/**
 * Resolve store for a logical namespace.
 * @param filePath used when Redis absent and not on Vercel (or when FORCE_FILE=1).
 */
export function getPersistStore(opts?: { filePath?: string; namespace?: string }): PersistStore {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    cached = new UpstashRedisStore(url.replace(/\/$/, ''), token);
    return cached;
  }

  if (opts?.filePath && !process.env.VERCEL) {
    cached = new FileStore(opts.filePath);
    return cached;
  }

  // Vercel /tmp file is still ephemeral across instances — prefer memory clarity
  if (process.env.VERCEL) {
    cached = new MemoryStore();
    return cached;
  }

  if (opts?.filePath) {
    cached = new FileStore(opts.filePath);
    return cached;
  }

  cached = new MemoryStore();
  return cached;
}

/** Test helper — reset singleton between smoke runs */
export function resetPersistStoreForTests() {
  cached = null;
}

export function namespacedKey(ns: string, key: string) {
  return `obmc:${ns}:${key}`;
}
