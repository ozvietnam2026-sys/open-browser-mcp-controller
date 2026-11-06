/**
 * Automated Test Suite for MCP Authentication, Security, CORS, and pw_lighthouse
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import http from 'http';
import {
  safeCompareTokens,
  validateTargetUrlForSsrf,
  requireMcpAuth,
} from '../server/mcp-auth.js';
import { McpServerHandler, ALL_MCP_TOOLS } from '../server/mcp-server.js';

describe('1. Constant-Time Token Comparison (safeCompareTokens)', () => {
  test('returns true for matching tokens', () => {
    assert.equal(safeCompareTokens('my-secret-token-123', 'my-secret-token-123'), true);
  });

  test('returns false for mismatched tokens of same length', () => {
    assert.equal(safeCompareTokens('my-secret-token-123', 'my-secret-token-999'), false);
  });

  test('returns false for mismatched tokens of different lengths', () => {
    assert.equal(safeCompareTokens('short', 'a-very-long-secret-token-string'), false);
  });

  test('returns false for empty or undefined input', () => {
    assert.equal(safeCompareTokens('', 'my-secret-token-123'), false);
    assert.equal(safeCompareTokens('my-secret-token-123', ''), false);
  });
});

describe('2. SSRF Target URL Protection (validateTargetUrlForSsrf)', () => {
  test('allows public HTTPS URLs', () => {
    assert.deepEqual(validateTargetUrlForSsrf('https://example.com/page'), { valid: true });
    assert.deepEqual(validateTargetUrlForSsrf('http://wikipedia.org'), { valid: true });
  });

  test('blocks localhost and loopback targets', () => {
    assert.equal(validateTargetUrlForSsrf('http://localhost:3000').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://127.0.0.1:8080').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://0.0.0.0').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://[::1]:8000').valid, false);
  });

  test('blocks cloud metadata endpoints', () => {
    assert.equal(validateTargetUrlForSsrf('http://169.254.169.254/latest/meta-data/').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://metadata.google.internal/').valid, false);
  });

  test('blocks private IPv4 address ranges', () => {
    assert.equal(validateTargetUrlForSsrf('http://10.0.0.1/admin').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://172.16.0.5/').valid, false);
    assert.equal(validateTargetUrlForSsrf('http://192.168.1.1/router').valid, false);
  });

  test('blocks invalid non-HTTP schemes', () => {
    assert.equal(validateTargetUrlForSsrf('file:///etc/passwd').valid, false);
    assert.equal(validateTargetUrlForSsrf('ftp://public.ftp.com').valid, false);
    assert.equal(validateTargetUrlForSsrf('javascript:alert(1)').valid, false);
  });
});

describe('3. MCP Server HTTP Transport & Authentication Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  const TEST_TOKEN = 'test-mcp-bearer-token-secret-98765';

  before((_, done) => {
    process.env.MCP_AUTH_TOKEN = TEST_TOKEN;
    process.env.MCP_ALLOWED_ORIGINS = 'https://trusted-client.com,https://app.cursor.sh';

    const app = express();
    app.use(express.json());

    // Health check (unauthenticated)
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Protected MCP endpoints
    app.all('/mcp', requireMcpAuth, (req: Request, res: Response) => {
      McpServerHandler.handleMessages(req, res);
    });

    app.get('/mcp/sse', requireMcpAuth, (req: Request, res: Response) => {
      McpServerHandler.handleSse(req, res);
    });

    app.post('/mcp/messages', requireMcpAuth, (req: Request, res: Response) => {
      McpServerHandler.handleMessages(req, res);
    });

    app.post('/api/mcp/rpc', requireMcpAuth, (req: Request, res: Response) => {
      McpServerHandler.handleDirectRpc(req, res);
    });

    app.get('/api/mcp/tools', requireMcpAuth, (_req: Request, res: Response) => {
      res.json({ tools: ALL_MCP_TOOLS });
    });

    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      done();
    });
  });

  after((_, done) => {
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_ALLOWED_ORIGINS;
    server.close(done);
  });

  test('GET /health is accessible without authentication', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'healthy');
  });

  test('Remote MCP endpoint rejects requests without Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        'User-Agent': 'Remote-MCP-Agent/1.0',
      },
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Unauthorized');
  });

  test('Remote MCP endpoint rejects requests with invalid Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        Authorization: 'Bearer wrong-invalid-token',
        'User-Agent': 'Remote-MCP-Agent/1.0',
      },
    });
    assert.equal(res.status, 401);
  });

  test('Remote MCP endpoint accepts requests with valid Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.tools));
    const pwTool = data.tools.find((t: any) => t.name === 'pw_lighthouse');
    assert.ok(pwTool, 'pw_lighthouse tool must be present in tools list');
  });

  test('Same-origin first-party UI request works without manual token entry', async () => {
    const serverHost = baseUrl.replace('http://', '');
    const res = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        Host: serverHost,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.tools));
  });

  test('MCP_ALLOWED_ORIGINS CORS restriction enforcement', async () => {
    // Allowed origin
    const allowedRes = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'https://trusted-client.com',
      },
    });
    assert.equal(allowedRes.status, 200);
    assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'https://trusted-client.com');

    // Denied origin
    const deniedRes = await fetch(`${baseUrl}/api/mcp/tools`, {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'https://evil-untrusted-site.com',
      },
    });
    assert.equal(deniedRes.status, 403);
  });

  test('Direct JSON-RPC tool execution with valid token', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1001,
        method: 'tools/call',
        params: {
          name: 'browser_list_tabs',
          arguments: {},
        },
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.jsonrpc, '2.0');
    assert.equal(data.id, 1001);
    assert.ok(data.result?.content);
  });

  test('pw_lighthouse tool SSRF protection blocks local target', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1002,
        method: 'tools/call',
        params: {
          name: 'pw_lighthouse',
          arguments: {
            url: 'http://127.0.0.1:3000/internal',
          },
        },
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.result);

    const payload = JSON.parse(data.result.content[0].text);
    assert.equal(payload.success, false);
    assert.equal(payload.error, 'ssrf_blocked');
  });

  test('pw_lighthouse tool capability check when Playwright unavailable', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1003,
        method: 'tools/call',
        params: {
          name: 'pw_lighthouse',
          arguments: {
            url: 'https://example.com',
          },
        },
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    const payload = JSON.parse(data.result.content[0].text);

    if (payload.error === 'unsupported') {
      assert.equal(payload.success, false);
      assert.equal(payload.capability, 'playwright_lighthouse');
    } else {
      assert.ok(typeof payload.success === 'boolean');
    }
  });
});

describe('4. Fail-Closed behavior when MCP_AUTH_TOKEN is unset in Production', () => {
  let prodServer: http.Server;
  let prodBaseUrl: string;

  before((_, done) => {
    delete process.env.MCP_AUTH_TOKEN;
    process.env.NODE_ENV = 'production';

    const app = express();
    app.use(express.json());

    app.get('/api/mcp/tools', requireMcpAuth, (_req: Request, res: Response) => {
      res.json({ tools: [] });
    });

    prodServer = app.listen(0, '127.0.0.1', () => {
      const address = prodServer.address() as any;
      prodBaseUrl = `http://127.0.0.1:${address.port}`;
      done();
    });
  });

  after((_, done) => {
    process.env.NODE_ENV = 'development';
    prodServer.close(done);
  });

  test('Remote request fails closed with 503 when token is unset in production', async () => {
    const res = await fetch(`${prodBaseUrl}/api/mcp/tools`, {
      headers: {
        'User-Agent': 'Remote-Client/1.0',
      },
    });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.error, 'MCP authentication is not configured on this server');
  });
});
