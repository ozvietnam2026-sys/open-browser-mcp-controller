import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFreshDefaultSession,
  hasUserSession,
  builtInPageId,
  urlsEquivalent,
  truncateForLog,
} from '../shared/browser-session.ts';

describe('browser-session helpers', () => {
  test('isFreshDefaultSession detects stock AeroSearch tab only', () => {
    assert.equal(
      isFreshDefaultSession([{ id: 'tab-1', url: 'browser://search', history: ['browser://search'] }]),
      true
    );
    assert.equal(
      isFreshDefaultSession([{ id: 'tab-1', url: 'https://www.taobao.com', history: ['https://www.taobao.com'] }]),
      false
    );
    assert.equal(
      isFreshDefaultSession([
        { id: 'a', url: 'browser://search', history: ['browser://search'] },
        { id: 'b', url: 'browser://store', history: ['browser://store'] },
      ]),
      false
    );
  });

  test('hasUserSession recognizes real http(s) and non-home built-ins', () => {
    assert.equal(hasUserSession([{ url: 'https://www.taobao.com', history: ['https://www.taobao.com'] }]), true);
    assert.equal(hasUserSession([{ url: 'browser://store', history: ['browser://store'] }]), true);
    assert.equal(hasUserSession([{ url: 'browser://search?q=laptop', history: ['browser://search?q=laptop'] }]), true);
    assert.equal(hasUserSession([{ url: 'browser://search', history: ['browser://search'] }]), false);
  });

  test('builtInPageId never treats taobao/1688 as NovaTech store', () => {
    assert.equal(builtInPageId('https://www.taobao.com/item/store'), 'search');
    assert.equal(builtInPageId('https://detail.1688.com/offer/novatech.html'), 'search');
    assert.equal(builtInPageId('browser://store'), 'store');
    assert.equal(builtInPageId('browser://store/cart'), 'store');
    assert.equal(builtInPageId('browser://forms'), 'forms');
    assert.equal(builtInPageId('browser://search?q=x'), 'search');
  });

  test('urlsEquivalent ignores trailing slash and hash for http(s)', () => {
    assert.equal(urlsEquivalent('https://example.com/a', 'https://example.com/a/'), true);
    assert.equal(urlsEquivalent('https://example.com/a#x', 'https://example.com/a'), true);
    assert.equal(urlsEquivalent('https://example.com/a', 'https://example.com/b'), false);
    assert.equal(urlsEquivalent('browser://search', 'browser://search'), true);
  });

  test('truncateForLog caps large payloads', () => {
    const big = { text: 'x'.repeat(5000) };
    const out = truncateForLog(big, 200) as any;
    assert.equal(out._truncated, true);
    assert.ok(out.originalChars > 200);
    assert.equal(truncateForLog('short'), 'short');
  });
});
