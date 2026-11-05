/**
 * Lightweight in-memory agent mailbox.
 * Inspired by jrb00013/mailnotmilk (shared agent mailbox MCP):
 * post_message / check_inbox / post_handoff / reply / rooms.
 *
 * Works on Vercel serverless for the lifetime of one warm instance
 * (ephemeral — not durable across cold starts).
 */
import { McpToolDefinition } from '../../shared/browser-types.js';
import { randomUUID } from 'crypto';
import { getConfig } from '../config.js';
import {
  getPersistStore,
  describePersistBackend,
  namespacedKey,
  redisEnvPresent,
} from '../infra/persist-store.js';

export type MailPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface MailMessage {
  id: string;
  from: string;
  to?: string; // omit = room broadcast
  room?: string;
  body: string;
  priority: MailPriority;
  tags: string[];
  threadId?: string;
  kind: 'message' | 'handoff' | 'turn' | 'reply';
  handoff?: {
    title: string;
    objective: string;
    acceptance?: string;
    files?: string[];
  };
  createdAt: number;
  readBy: Set<string>;
  archived?: boolean;
}

interface AgentPresence {
  id: string;
  status: 'idle' | 'working' | 'waiting';
  lastSeen: number;
}

const messages: MailMessage[] = [];
const agents = new Map<string, AgentPresence>();
const MAX_MESSAGES = 500;

function persistPath(): string | undefined {
  try {
    return getConfig().mailPersistPath;
  } catch {
    return process.env.MAIL_PERSIST_PATH || (process.env.VERCEL ? undefined : './data/mailbox.json');
  }
}

const MAIL_KEY = namespacedKey('mail', 'state');

function store() {
  return getPersistStore({ filePath: persistPath() || './data/mailbox-kv.json' });
}

async function loadPersisted() {
  try {
    const raw = await store().getJson<{
      messages?: any[];
      agents?: AgentPresence[];
    }>(MAIL_KEY);
    // File-store legacy: also try reading classic MAIL_PERSIST_PATH shape via getJson of whole file
    // For file backend we store under key; Memory/Redis same.
    if (!raw) {
      // Legacy file format (direct JSON file without key wrapper) handled by FileStore only for keyed data.
      return;
    }
    messages.length = 0;
    for (const m of raw.messages || []) {
      messages.push({
        ...m,
        readBy: new Set(m.readBy || []),
      });
    }
    agents.clear();
    for (const a of raw.agents || []) {
      agents.set(a.id, a);
    }
  } catch {
    /* ignore corrupt store */
  }
}

async function savePersisted() {
  try {
    await store().setJson(MAIL_KEY, {
      messages: messages.map((m) => ({ ...m, readBy: [...m.readBy] })),
      agents: [...agents.values()],
      savedAt: Date.now(),
    });
  } catch {
    /* best-effort */
  }
}

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
async function ensureHydrated() {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = loadPersisted().then(() => {
      hydrated = true;
    });
  }
  await hydratePromise;
}

function platformLabel() {
  const desc = describePersistBackend();
  if (desc.backend === 'upstash-redis') return 'vercel-redis';
  if (process.env.VERCEL) return 'vercel-ephemeral';
  if (persistPath()) return 'docker-file';
  return 'long-running-memory';
}

function textResult(data: unknown) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function serialize(m: MailMessage) {
  return {
    id: m.id,
    from: m.from,
    to: m.to,
    room: m.room,
    body: m.body,
    priority: m.priority,
    tags: m.tags,
    threadId: m.threadId,
    kind: m.kind,
    handoff: m.handoff,
    createdAt: m.createdAt,
    readBy: [...m.readBy],
    archived: !!m.archived,
  };
}

function touchAgent(id: string) {
  const existing = agents.get(id);
  agents.set(id, {
    id,
    status: existing?.status || 'idle',
    lastSeen: Date.now(),
  });
}

async function pushMessage(msg: MailMessage) {
  await ensureHydrated();
  messages.unshift(msg);
  if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES;
  await savePersisted();
}

export const MCP_MAIL_TOOLS: McpToolDefinition[] = [
  {
    name: 'mail_whoami',
    description: 'Show suggested agent id for this process (mailnotmilk whoami pattern). Works on Vercel.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'string' } } },
  },
  {
    name: 'mail_register',
    description: 'Register or refresh agent presence in the shared mailbox roster.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        status: { type: 'string', enum: ['idle', 'working', 'waiting'] },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'mail_post',
    description: 'Post markdown to an agent (DM) or omit `to` and set `room` for broadcast (mailnotmilk post_message).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        room: { type: 'string' },
        body: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['from', 'body'],
    },
  },
  {
    name: 'mail_handoff',
    description: 'Structured task handoff to another agent (mailnotmilk post_handoff).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        title: { type: 'string' },
        objective: { type: 'string' },
        acceptance: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        body: { type: 'string' },
      },
      required: ['from', 'to', 'title', 'objective'],
    },
  },
  {
    name: 'mail_inbox',
    description: 'List unread messages for an agent (DMs, room broadcasts, @mentions). Priority-sorted.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        room: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'mail_read',
    description: 'Fetch a message and mark it read for the agent.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        agentId: { type: 'string' },
      },
      required: ['id', 'agentId'],
    },
  },
  {
    name: 'mail_reply',
    description: 'Reply in-thread; routes back to the original sender.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Parent message id' },
        from: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['id', 'from', 'body'],
    },
  },
  {
    name: 'mail_board',
    description: 'Human-readable status board: agents, rooms, urgent, recent (mailnotmilk mailbox_board).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'mail_stats',
    description: 'Aggregate mailbox stats (counts, priorities, live agents).',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const MAIL_TOOL_NAMES = new Set(MCP_MAIL_TOOLS.map((t) => t.name));

const PRIORITY_RANK: Record<MailPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export async function executeMailTool(name: string, args: Record<string, any>) {
  await ensureHydrated();
  switch (name) {
    case 'mail_whoami': {
      const id = args.agentId || process.env.MAIL_AGENT_ID || `agent-${process.pid}`;
      touchAgent(id);
      const desc = describePersistBackend();
      return textResult({
        agentId: id,
        platform: platformLabel(),
        persistBackend: desc.backend,
        redisConfigured: redisEnvPresent(),
        note: desc.note,
        persistPath: persistPath() || null,
      });
    }
    case 'mail_register': {
      agents.set(args.agentId, {
        id: args.agentId,
        status: args.status || 'idle',
        lastSeen: Date.now(),
      });
      await savePersisted();
      return textResult({ ok: true, agent: agents.get(args.agentId) });
    }
    case 'mail_post': {
      touchAgent(args.from);
      const msg: MailMessage = {
        id: randomUUID(),
        from: args.from,
        to: args.to,
        room: args.room || (args.to ? undefined : 'lobby'),
        body: args.body,
        priority: (args.priority as MailPriority) || 'normal',
        tags: args.tags || [],
        kind: 'message',
        createdAt: Date.now(),
        readBy: new Set(),
      };
      await pushMessage(msg);
      return textResult({ ok: true, message: serialize(msg) });
    }
    case 'mail_handoff': {
      touchAgent(args.from);
      const msg: MailMessage = {
        id: randomUUID(),
        from: args.from,
        to: args.to,
        body: args.body || `${args.title}\n\n${args.objective}`,
        priority: 'high',
        tags: ['handoff'],
        kind: 'handoff',
        handoff: {
          title: args.title,
          objective: args.objective,
          acceptance: args.acceptance,
          files: args.files,
        },
        createdAt: Date.now(),
        readBy: new Set(),
      };
      await pushMessage(msg);
      return textResult({ ok: true, message: serialize(msg) });
    }
    case 'mail_inbox': {
      touchAgent(args.agentId);
      const limit = args.limit ?? 20;
      const unread = messages
        .filter((m) => !m.archived)
        .filter((m) => !m.readBy.has(args.agentId))
        .filter((m) => {
          if (m.to && m.to === args.agentId) return true;
          if (!m.to && m.room && (!args.room || m.room === args.room)) return true;
          if (m.body.includes(`@${args.agentId}`)) return true;
          return false;
        })
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(serialize);
      return textResult({ count: unread.length, messages: unread });
    }
    case 'mail_read': {
      const msg = messages.find((m) => m.id === args.id);
      if (!msg) return textResult({ error: `message not found: ${args.id}` });
      msg.readBy.add(args.agentId);
      touchAgent(args.agentId);
      await savePersisted();
      return textResult({ message: serialize(msg) });
    }
    case 'mail_reply': {
      const parent = messages.find((m) => m.id === args.id);
      if (!parent) return textResult({ error: `parent not found: ${args.id}` });
      touchAgent(args.from);
      const msg: MailMessage = {
        id: randomUUID(),
        from: args.from,
        to: parent.from,
        room: parent.room,
        body: args.body,
        priority: parent.priority,
        tags: ['reply'],
        threadId: parent.threadId || parent.id,
        kind: 'reply',
        createdAt: Date.now(),
        readBy: new Set(),
      };
      await pushMessage(msg);
      return textResult({ ok: true, message: serialize(msg) });
    }
    case 'mail_board': {
      const rooms = new Map<string, number>();
      for (const m of messages) {
        if (m.room) rooms.set(m.room, (rooms.get(m.room) || 0) + 1);
      }
      const urgent = messages.filter((m) => m.priority === 'urgent' && !m.archived).slice(0, 5).map(serialize);
      const recent = messages.slice(0, 10).map(serialize);
      return textResult({
        agents: [...agents.values()],
        rooms: [...rooms.entries()].map(([name, count]) => ({ name, count })),
        urgent,
        recent,
        note: describePersistBackend().note,
        persistBackend: describePersistBackend().backend,
      });
    }
    case 'mail_stats': {
      const byPriority: Record<string, number> = {};
      for (const m of messages) byPriority[m.priority] = (byPriority[m.priority] || 0) + 1;
      return textResult({
        totalMessages: messages.length,
        byPriority,
        agents: agents.size,
        platform: platformLabel(),
        persistBackend: describePersistBackend().backend,
        redisConfigured: redisEnvPresent(),
      });
    }
    default:
      throw new Error(`Unknown mail tool: ${name}`);
  }
}
