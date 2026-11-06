import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
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
  });
});
