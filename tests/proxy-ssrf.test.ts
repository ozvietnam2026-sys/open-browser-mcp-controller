import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { Script } from 'node:vm';
import { ProxyEngine } from '../server/proxy-engine.js';

describe('proxy handleProxy SSRF + methods', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.all('/api/browser/proxy', (req, res) => {
      ProxyEngine.handleProxy(req, res);
    });
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('rejects localhost target with 400', async () => {
    const url = `${baseUrl}/api/browser/proxy?url=${encodeURIComponent('http://127.0.0.1:1/')}`;
    const res = await fetch(url);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.match(text, /Blocked target URL|forbidden|Localhost|Loopback/i);
  });

  test('rejects private IP target with 400', async () => {
    const url = `${baseUrl}/api/browser/proxy?url=${encodeURIComponent('http://192.168.1.1/')}`;
    const res = await fetch(url);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.match(text, /Blocked target URL|Private IP/i);
  });

  test('OPTIONS preflight returns 204 with CORS headers', async () => {
    const url = `${baseUrl}/api/browser/proxy?url=${encodeURIComponent('https://example.com/')}`;
    const res = await fetch(url, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(String(res.headers.get('access-control-allow-methods')), /POST/);
  });

  test('GET public HTML injects fetch rewrite bridge', async () => {
    const url = `${baseUrl}/api/browser/proxy?url=${encodeURIComponent('https://example.com/')}`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /__IS_MCP_BROWSER_PAGE__/);
    assert.match(html, /patchFetchAndXhr|PROXY_PATH/);
    assert.match(html, /<base href=/i);
    // Keep single delayed snapshot (no triple storm markers from older builds)
    assert.match(html, /sendOnce/);
    const bridge = html.match(/<script id="__mcp_browser_bridge__">([\s\S]*?)<\/script>/);
    assert.ok(bridge);
    assert.doesNotThrow(() => new Script(bridge[1]));
    assert.match(bridge[1], /navigationId/);
    assert.match(bridge[1], /documentUrl/);
  });
  test('proxy fetch error stays on same URL and reports bound error evidence', async (t) => {
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (input: any, init: any) => {
      if (String(input).startsWith('https://example.com/')) throw new Error('fixture network failure');
      return originalFetch(input, init);
    });
    const res = await fetch(`${baseUrl}/api/browser/proxy?url=https%3A%2F%2Fexample.com%2F&tabId=fixture&navigationId=7`);
    assert.equal(res.status, 502);
    const html = await res.text();
    assert.match(html, /window.location.reload/);
    assert.doesNotMatch(html, /NovaTech|AeroSearch|browser:\/\/store/);
    assert.match(html, /"navigationId":7/);
    assert.match(html, /fetch failed/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(script);
    assert.doesNotThrow(() => new Script(script[1]));
  });

});
