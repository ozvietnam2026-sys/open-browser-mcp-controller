import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStateManager } from '../server/browser-state.js';

const snapshotOf = (tab: any, text: string) => ({
  tabId: tab.id,
  navigationId: tab.navigationId,
  url: tab.url,
  title: 'Page',
  interactiveElements: [],
  simplifiedTree: '',
  textExcerpt: text,
  scrollPosition: { x: 0, y: 0, maxScrollY: 0 },
  timestamp: Date.now(),
});

test('waitForDocument re-binds to a superseding navigation instead of failing', async () => {
  const m = new BrowserStateManager();
  m.subscribeUiEvents(() => {}); // a connected frontend must exist, else it fails fast
  const tab = m.navigateTab('tab-1', 'https://www.made-in-china.com/a');

  const waiting = m.waitForDocument(tab.id, 5000);
  // A newer navigation supersedes mid-wait (e.g. Enter typed in a site search box), then its document binds.
  setTimeout(() => m.navigateTab(tab.id, 'https://www.made-in-china.com/b'), 120);
  setTimeout(() => {
    const current = m.getTab(tab.id)!;
    m.setDomSnapshot(tab.id, snapshotOf(current, 'Product List US$9,460 FOB'));
  }, 400);

  const result = await waiting;
  assert.equal(result.success, true);
  assert.equal((result.data as any)?.url, 'https://www.made-in-china.com/b');
  assert.equal((result.data as any)?.state, 'ok');
});

test('waitForDocument times out with the budget in the message when nothing binds', async () => {
  const m = new BrowserStateManager();
  m.subscribeUiEvents(() => {});
  m.navigateTab('tab-1', 'https://www.made-in-china.com/slow');
  const result = await m.waitForDocument('tab-1', 300);
  assert.equal(result.success, false);
  assert.match(result.error, /Navigation timeout \(300ms\)/);
});

test('waitForDocument fails fast when no frontend is connected', async () => {
  const m = new BrowserStateManager();
  m.navigateTab('tab-1', 'https://www.made-in-china.com/x');
  const result = await m.waitForDocument('tab-1', 5000);
  assert.equal(result.success, false);
  assert.match(result.error, /UI disconnected/);
});
