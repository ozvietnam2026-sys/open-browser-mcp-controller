/**
 * Open Browser MCP Controller - Express Server Entry Point
 * Host on port 3000 with Vite middleware in development and MCP SSE/HTTP transports.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { browserState } from './server/browser-state.js';
import { McpServerHandler, MCP_BROWSER_TOOLS, ALL_MCP_TOOLS } from './server/mcp-server.js';
import { getVisibleTools } from './server/tools-registry.js';
import { getConfig } from './server/config.js';
import { executeExtractTool, EXTRACT_TOOL_NAMES } from './server/extract/index.js';
import { executePlaywrightTool, PLAYWRIGHT_TOOL_NAMES } from './server/playwright/tools.js';
import { executeMailTool, MAIL_TOOL_NAMES } from './server/mailbox/index.js';
import { executeAiWebTool, AI_WEB_TOOL_NAMES } from './server/ai-web/index.js';
import { ProxyEngine } from './server/proxy-engine.js';
import { GeminiBrowserAgent } from './server/gemini-agent.js';

import { requireMcpAuth } from './server/mcp-auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// AI Studio dev server strictly runs on port 3000.
// In container environments, nginx runs on 8080 and proxies traffic to port 3000.
// Never bind to 8080 as that causes EADDRINUSE conflict with nginx.
function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed) && parsed !== 8080) return parsed;
  }
  if (process.env.PORT && process.env.PORT !== '8080') {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 3000;
}

const PORT = resolvePort();

// Middleware
app.use(cors());
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// Unauthenticated health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------
// Model Context Protocol (MCP) Endpoints (Protected by requireMcpAuth)
// -------------------------------------------------------------

// Official MCP SSE Transport
app.get('/mcp/sse', requireMcpAuth, (req: Request, res: Response) => {
  McpServerHandler.handleSse(req, res);
});

// Official MCP Message Endpoint
app.post('/mcp/messages', requireMcpAuth, (req: Request, res: Response) => {
  McpServerHandler.handleMessages(req, res);
});

// Direct JSON-RPC endpoint for simple HTTP clients / curl / test scripts
app.post('/api/mcp/rpc', requireMcpAuth, (req: Request, res: Response) => {
  McpServerHandler.handleDirectRpc(req, res);
});

// Streamable HTTP MCP endpoint (GitHub MCP style single /mcp URL)
// Accepts JSON-RPC over POST; also supports simple GET discovery.
app.all('/mcp', requireMcpAuth, async (req: Request, res: Response) => {
  if (req.method === 'GET') {
    return res.json({
      protocol: 'mcp',
      transport: 'streamable-http',
      endpoints: {
        rpc: '/mcp',
        sse: '/mcp/sse',
        messages: '/mcp/messages',
        legacyRpc: '/api/mcp/rpc',
      },
      tools: getVisibleTools().length, catalog: ALL_MCP_TOOLS.length, version: getConfig().version,
    });
  }
  if (req.method === 'POST') {
    const body = req.body;
    // notifications have no id — still process
    const response = await McpServerHandler.processRpcMessage(body);
    // If client Accept prefers SSE and this is a long tool call, we still return JSON for serverless compatibility
    return res.json(response);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
});

// Convenience REST wrappers for HTTP extraction (handy for curl / smoke tests)
app.post('/api/extract/:tool', async (req: Request, res: Response) => {
  const tool = `extract_${req.params.tool}`;
  if (!EXTRACT_TOOL_NAMES.has(tool)) {
    return res.status(404).json({ error: `Unknown extract tool: ${tool}`, available: [...EXTRACT_TOOL_NAMES] });
  }
  try {
    const result = await executeExtractTool(tool, req.body || {});
    const text = result?.content?.[0]?.text;
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    return res.json({ ok: true, tool, data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, tool, error: err?.message || String(err) });
  }
});

app.get('/api/extract/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    version: '4.1.5',
    extractTools: [...EXTRACT_TOOL_NAMES],
    playwrightTools: [...PLAYWRIGHT_TOOL_NAMES],
    mailTools: [...MAIL_TOOL_NAMES],
    aiWebTools: [...AI_WEB_TOOL_NAMES],
    playwrightEnabled: !process.env.VERCEL && process.env.DISABLE_PLAYWRIGHT !== '1',
    platform: process.env.VERCEL ? 'vercel-serverless' : 'long-running',
    inspirations: [
      'ChromeDevTools/chrome-devtools-mcp',
      'jeffrey-nz/browser-ai-bridge',
      'jrb00013/mailnotmilk',
      'vercel-labs/agent-browser',
      'microsoft/playwright-mcp',
    ],
  });
});


// Mailbox REST (mailnotmilk-inspired; ephemeral on serverless)
app.post('/api/mail/:tool', async (req: Request, res: Response) => {
  const tool = `mail_${req.params.tool}`;
  if (!MAIL_TOOL_NAMES.has(tool)) {
    return res.status(404).json({ error: `Unknown mail tool: ${tool}`, available: [...MAIL_TOOL_NAMES] });
  }
  try {
    const result = await executeMailTool(tool, req.body || {});
    const textBody = result?.content?.[0]?.text;
    let data: any = textBody;
    try { data = JSON.parse(textBody); } catch { /* keep */ }
    return res.json({ ok: true, tool, data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, tool, error: err?.message || String(err) });
  }
});

app.post('/api/ai/:tool', async (req: Request, res: Response) => {
  const tool = `ai_${req.params.tool}`;
  if (!AI_WEB_TOOL_NAMES.has(tool)) {
    return res.status(404).json({ error: `Unknown ai tool: ${tool}`, available: [...AI_WEB_TOOL_NAMES] });
  }
  try {
    const result = await executeAiWebTool(tool, req.body || {});
    const textBody = result?.content?.[0]?.text;
    let data: any = textBody;
    try { data = JSON.parse(textBody); } catch { /* keep */ }
    return res.json({ ok: true, tool, data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, tool, error: err?.message || String(err) });
  }
});

// MCP Tools schema list
app.get('/api/mcp/tools', requireMcpAuth, (_req: Request, res: Response) => {
  res.json({
    tools: getVisibleTools(),
    toolCount: getVisibleTools().length,
    catalogCount: ALL_MCP_TOOLS.length,
    config: { version: getConfig().version, profile: getConfig().profile, caps: getConfig().caps },
    groups: {
      browser: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('browser_')).map((t) => t.name),
      extract: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('extract_')).map((t) => t.name),
      playwright: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('pw_')).map((t) => t.name),
      mail: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('mail_')).map((t) => t.name),
      aiWeb: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('ai_')).map((t) => t.name),
      meta: ALL_MCP_TOOLS.filter((t) => t.name.startsWith('meta_')).map((t) => t.name),
    },
    notes: {
      extract: 'HTTP extraction + map/search/change/observe/llm — works on Vercel serverless',
      playwright: 'Chromium + CDP + tabs/dialogs/storage/routes/upload/download/xy — Docker/local; clear error on Vercel',
      browser: 'Simulated in-app browser driven by the UI',
      mail: 'Agent mailbox (mailnotmilk) — file persistence via MAIL_PERSIST_PATH; Vercel warm-instance otherwise',
      aiWeb: 'Drive logged-in browser AI UIs (browser-ai-bridge) — Docker/local only',
      meta: 'Profiles/caps/exclude/cache status — always visible',
    },
  });
});

// MCP Connection Config generator
app.get('/api/mcp/config', requireMcpAuth, (req: Request, res: Response) => {
  const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

  res.json({
    sseEndpoint: `${baseUrl}/mcp/sse`,
    messagesEndpoint: `${baseUrl}/mcp/messages`,
    directRpcEndpoint: `${baseUrl}/api/mcp/rpc`,
    claudeDesktopConfig: {
      mcpServers: {
        'open-browser': {
          url: `${baseUrl}/mcp/sse`,
        },
      },
    },
    cursorConfig: {
      mcpServers: {
        'open-browser': {
          type: 'sse',
          url: `${baseUrl}/mcp/sse`,
        },
      },
    },
    streamableHttpEndpoint: `${baseUrl}/mcp`,
    stdio: {
      command: 'npx',
      args: ['tsx', 'scripts/mcp-stdio.ts'],
      note: 'Run from project root on a long-running host',
    },
  });
});

// MCP Logs
app.get('/api/mcp/logs', requireMcpAuth, (_req: Request, res: Response) => {
  res.json(browserState.getMcpLogs());
});

// -------------------------------------------------------------
// Browser State & Real-Time Sync Endpoints
// -------------------------------------------------------------

// SSE stream for UI client synchronization with 35s keep-alive (>= 30s)
app.get('/api/browser/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // Initial connection confirmation
  res.write(': connected\n\n');

  const unsubscribe = browserState.subscribeUiEvents((event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Keep-alive heartbeat every 15s (Vercel proxy idle cut mitigation)
  const pingInterval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    unsubscribe();
  });
});

// Tabs API
app.get('/api/browser/tabs', (_req: Request, res: Response) => {
  res.json({
    tabs: browserState.getAllTabs(),
    activeTabId: browserState.getActiveTab().id,
  });
});

// Frontend UI resolves a dispatched command result
app.post('/api/browser/command-result', (req: Request, res: Response) => {
  const result = req.body;
  if (result?.commandId) {
    browserState.resolveCommandResult(result);
  }
  res.json({ success: true });
});

// Frontend UI uploads fresh DOM snapshot
app.post('/api/browser/dom-snapshot', (req: Request, res: Response) => {
  const { tabId, snapshot } = req.body;
  if (tabId && snapshot) {
    browserState.setDomSnapshot(tabId, snapshot);
  }
  res.json({ success: true });
});

// Frontend UI uploads screenshot data URL
app.post('/api/browser/screenshot', (req: Request, res: Response) => {
  const { tabId, dataUrl } = req.body;
  if (tabId && dataUrl) {
    browserState.setScreenshot(tabId, dataUrl);
  }
  res.json({ success: true });
});

app.get('/api/browser/screenshot', (req: Request, res: Response) => {
  const tabId = req.query.tabId as string | undefined;
  const screenshot = browserState.getScreenshot(tabId);
  res.json({ screenshot: screenshot || null });
});

// Frontend UI reports console logs
app.post('/api/browser/console-log', (req: Request, res: Response) => {
  const { tabId, level, message } = req.body;
  if (tabId && message) {
    browserState.addConsoleLog(tabId, level || 'log', message);
  }
  res.json({ success: true });
});

// Logs query
app.get('/api/browser/logs', (req: Request, res: Response) => {
  const tabId = req.query.tabId as string | undefined;
  res.json({
    consoleLogs: browserState.getConsoleLogs(tabId),
    networkLogs: browserState.getNetworkLogs(tabId),
  });
});

// Session Export Endpoint
app.get('/api/browser/export', (_req: Request, res: Response) => {
  const tabs = browserState.getAllTabs();
  const mcpLogs = browserState.getMcpLogs();
  const consoleLogs = browserState.getConsoleLogs();

  const exportData = {
    generatedAt: new Date().toISOString(),
    protocol: 'Model Context Protocol (MCP) 2024-11-05',
    tabs,
    mcpTrafficSummary: {
      totalMessages: mcpLogs.length,
      recentLogs: mcpLogs.slice(0, 50),
    },
    consoleLogsCount: consoleLogs.length,
  };

  res.setHeader('Content-Disposition', 'attachment; filename="browser-mcp-session.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// -------------------------------------------------------------
// Web Proxy Endpoint for External Pages
// -------------------------------------------------------------
// All methods: HTML GET injects bridge + fetch/XHR rewrite; other verbs forward upstream.
// Cookie jar not implemented — logged-in site sessions do not persist through this proxy.
app.all('/api/browser/proxy', (req: Request, res: Response) => {
  ProxyEngine.handleProxy(req, res);
});

// -------------------------------------------------------------
// Autonomous Gemini AI Agent Runner
// -------------------------------------------------------------
app.post('/api/agent/run', async (req: Request, res: Response) => {
  const { task, jobId = 'agent-' + Date.now() } = req.body;

  if (!task) {
    return res.status(400).json({ error: 'Missing task description' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`event: agent_start\ndata: ${JSON.stringify({ jobId, task })}\n\n`);

  // Keep-alive heartbeat during model reasoning
  const ping = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 10000);

  try {
    const outcome = await GeminiBrowserAgent.runAutonomousAgent(
      task,
      (step) => {
        res.write(`event: agent_step\ndata: ${JSON.stringify(step)}\n\n`);
      },
      jobId
    );

    clearInterval(ping);
    res.write(`event: agent_done\ndata: ${JSON.stringify(outcome)}\n\n`);
  } catch (err: any) {
    clearInterval(ping);
    res.write(
      `event: agent_error\ndata: ${JSON.stringify({ error: err?.message || 'Agent error' })}\n\n`
    );
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.post('/api/agent/stop', (req: Request, res: Response) => {
  const { jobId } = req.body;
  if (jobId) {
    GeminiBrowserAgent.stopJob(jobId);
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// Vite Middleware / Static Serving
// -------------------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  VITE v8.3.0  ready in 120 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`[Open Browser MCP Controller] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[MCP SSE] endpoint ready at http://0.0.0.0:${PORT}/mcp/sse`);
    console.log(`[MCP POST] messages endpoint ready at http://0.0.0.0:${PORT}/mcp/messages\n`);
  });

  server.on('error', (err: any) => {
    console.error('[Server Error]', err);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
