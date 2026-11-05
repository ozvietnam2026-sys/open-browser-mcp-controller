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
import { McpServerHandler, MCP_BROWSER_TOOLS } from './server/mcp-server.js';
import { ProxyEngine } from './server/proxy-engine.js';
import { GeminiBrowserAgent } from './server/gemini-agent.js';

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

// -------------------------------------------------------------
// Model Context Protocol (MCP) Endpoints
// -------------------------------------------------------------

// Official MCP SSE Transport
app.get('/mcp/sse', (req: Request, res: Response) => {
  McpServerHandler.handleSse(req, res);
});

// Official MCP Message Endpoint
app.post('/mcp/messages', (req: Request, res: Response) => {
  McpServerHandler.handleMessages(req, res);
});

// Direct JSON-RPC endpoint for simple HTTP clients / curl / test scripts
app.post('/api/mcp/rpc', (req: Request, res: Response) => {
  McpServerHandler.handleDirectRpc(req, res);
});

// MCP Tools schema list
app.get('/api/mcp/tools', (_req: Request, res: Response) => {
  res.json({
    tools: MCP_BROWSER_TOOLS,
  });
});

// MCP Connection Config generator
app.get('/api/mcp/config', (req: Request, res: Response) => {
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
  });
});

// MCP Logs
app.get('/api/mcp/logs', (_req: Request, res: Response) => {
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

  // Keep-alive heartbeat every 35s prevents client timeout without rate spam
  const pingInterval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 35000);

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
app.get('/api/browser/proxy', (req: Request, res: Response) => {
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
