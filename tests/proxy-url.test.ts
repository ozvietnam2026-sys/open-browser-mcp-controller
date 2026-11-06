import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProxyRewrite,
  buildOutboundProxyHeaders,
  normalizeProxyTargetUrl,
  PROXY_PATH,
} from '../server/proxy-url.js';

describe('proxy-url rewrite helper', () => {
  const controller = 'https://open-browser-mcp-controller-ten.vercel.app';
  const taobaoBase = 'https://www.taobao.com/';

  test('foreign absolute URL → proxied', () => {
    const r = resolveProxyRewrite(
      'https://h5api.taobao.com/h5/mtop.taobao.detail.getdetail/1.0/',
      taobaoBase,
      controller
    );
    assert.equal(r.shouldRewrite, true);
    assert.ok(r.proxiedUrl?.startsWith(`${PROXY_PATH}?url=`));
    assert.ok(r.proxiedUrl?.includes(encodeURIComponent('https://h5api.taobao.com')));
  });

  test('already-proxied URL → unchanged', () => {
    const proxied =
      `${controller}${PROXY_PATH}?url=${encodeURIComponent('https://www.taobao.com/')}`;
    const r = resolveProxyRewrite(proxied, taobaoBase, controller);
    assert.equal(r.shouldRewrite, false);
  });

  test('controller /api/mcp path → unchanged', () => {
    const r = resolveProxyRewrite(`${controller}/api/mcp`, taobaoBase, controller);
    assert.equal(r.shouldRewrite, false);
  });

  test('controller /api/agent and /api/browser/events → unchanged', () => {
    assert.equal(
      resolveProxyRewrite(`${controller}/api/agent/run`, taobaoBase, controller).shouldRewrite,
      false
    );
    assert.equal(
      resolveProxyRewrite(`${controller}/api/browser/events`, taobaoBase, controller).shouldRewrite,
      false
    );
  });

  test('relative URL with taobao base → proxied taobao URL', () => {
    const r = resolveProxyRewrite('/wow/z/tbmarket/gbhome/index', taobaoBase, controller);
    assert.equal(r.shouldRewrite, true);
    assert.equal(r.resolvedHref, 'https://www.taobao.com/wow/z/tbmarket/gbhome/index');
    assert.ok(r.proxiedUrl?.includes(encodeURIComponent(r.resolvedHref)));
  });

  test('data: and blob: URLs → unchanged', () => {
    assert.equal(
      resolveProxyRewrite('data:text/plain,hi', taobaoBase, controller).shouldRewrite,
      false
    );
    assert.equal(
      resolveProxyRewrite('blob:https://www.taobao.com/abc', taobaoBase, controller).shouldRewrite,
      false
    );
  });

  test('normalizeProxyTargetUrl adds https when missing', () => {
    assert.equal(normalizeProxyTargetUrl('www.example.com/a'), 'https://www.example.com/a');
    assert.equal(normalizeProxyTargetUrl('http://example.com/'), 'http://example.com/');
  });

  test('buildOutboundProxyHeaders strips Cookie and Authorization', () => {
    const headers = buildOutboundProxyHeaders(
      {
        cookie: 'session=controller-secret',
        authorization: 'Bearer controller-token',
        host: 'evil.example',
        'content-type': 'application/json',
        accept: 'application/json',
        'x-custom-api': 'page-token',
        'content-length': '999',
      },
      'TestUA'
    );
    assert.equal(headers['User-Agent'], 'TestUA');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['Accept'], 'application/json');
    assert.equal(headers['x-custom-api'], 'page-token');
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.Cookie, undefined);
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers.host, undefined);
    assert.equal(headers['content-length'], undefined);
  });
});
