import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserState } from '../server/browser-state.js';
import { classifyChallenge, finalAnswerGate, iframeCommandError } from '../shared/challenge-state.js';
const snapshot = (tab: any, text = 'Product listing ¥10') => ({ tabId: tab.id, navigationId: tab.navigationId, url: tab.url, title: 'Page', interactiveElements: [], simplifiedTree: '', textExcerpt: text, scrollPosition: { x: 0, y: 0, maxScrollY: 0 }, timestamp: Date.now() });
test('navigation invalidates DOM, rejects wrong URL and generation including same-URL revisit', () => {
 const tab = browserState.openTab('https://www.taobao.com');
 const old = snapshot(tab);
 assert.equal(browserState.setDomSnapshot(tab.id, old), true);
 browserState.navigateTab(tab.id, 'https://www.1688.com');
 assert.equal(browserState.getDomSnapshot(tab.id), undefined);
 assert.equal(browserState.setDomSnapshot(tab.id, old), false);
 assert.equal(browserState.setDomSnapshot(tab.id, { ...snapshot(tab), navigationId: -1 }), false);
 assert.equal(browserState.setDomSnapshot(tab.id, { ...snapshot(tab), tabId: 'wrong' }), false);
 browserState.navigateTab(tab.id, 'https://www.taobao.com');
 assert.equal(browserState.setDomSnapshot(tab.id, old), false);
});
for (const [text, state] of [
 ['We have detected unusual traffic from your network, please try again later. Feedback QR', 'unusual_traffic'],
 ['亲，请登录 Phone Password Please try again', 'login_wall'],
 ['Scan QR code with Taobao app to sign in', 'qr_app_login'],
 ['Không thể kết nối tới trang web: fetch failed', 'fetch_error'],
 ['', 'empty_or_not_ready'],
 ['Drag the slider to complete the puzzle', 'slider_or_puzzle'],
 ['Feedback QR', 'ok'],
 ['Please try again', 'ok'],
 ['CORS error: blocked by cross-origin policy', 'cors_error'],
 ['Cross-origin iframe access denied', 'cross_origin_iframe'],
 ['Session unavailable', 'session_unavailable'],
 ['Wrong locale: switch region', 'wrong_site_or_locale'],
] as const) test('challenge fixture: ' + state + ' / ' + text, () => {
 const tab = browserState.openTab('https://example.com');
 const snap = snapshot(tab, text);
 if (state === 'slider_or_puzzle') snap.interactiveElements = [{ tagName: 'input', type: 'range', text: 'Drag slider' }] as any;
 assert.equal(classifyChallenge(tab, snap).state, state);
});
test('stale evidence cannot identify a previous site wall or complete', () => {
 const tab = browserState.openTab('https://www.1688.com');
 const wrong = { ...snapshot(tab, '亲，请登录'), url: 'https://www.taobao.com' };
 assert.equal(classifyChallenge(tab, wrong).state, 'stale_or_disconnected');
 assert.notEqual(finalAnswerGate(tab, wrong).outcome, 'completed');
 assert.equal(finalAnswerGate(tab, snapshot(tab, '')).outcome, 'blocked');
 assert.equal(finalAnswerGate(tab, snapshot(tab, '亲，请登录 Phone Password Please try again')).outcome, 'needs_user');
 assert.equal(finalAnswerGate(tab, snapshot(tab)).outcome, 'completed');
});
test('disconnected commands fail closed', async () => {
 browserState.openTab('browser://forms');
 for (const type of ['click', 'drag', 'extract_content', 'navigate'] as const) {
  const result = await browserState.dispatchCommand(type, { url: 'https://example.com' });
  assert.equal(result.success, false);
  assert.match(result.error!, /disconnect/i);
 }
});
test('command timeout never pretends execution', async () => {
 browserState.openTab('browser://forms');
 const unsubscribe = browserState.subscribeUiEvents(() => {});
 try {
  const result = await browserState.dispatchCommand('drag', {}, undefined, 5);
  assert.equal(result.success, false);
  assert.match(result.error!, /timeout/i);
 } finally { unsubscribe(); }
});
test('external iframe unsupported drag and extraction are explicit errors', () => {
 assert.match(iframeCommandError('drag')!, /unsupported/i);
 assert.match(iframeCommandError('extract_content')!, /unsupported/i);
 assert.equal(iframeCommandError('click'), undefined);
});

test('disconnect settles in-flight command without timeout', async () => {
 browserState.openTab('browser://forms');
 const unsubscribe = browserState.subscribeUiEvents(() => {});
 const pending = browserState.dispatchCommand('click', {}, undefined, 1000);
 unsubscribe();
 const result = await pending;
 assert.equal(result.success, false);
 assert.match(result.error!, /disconnected/);
});
test('screenshots are navigation-bound metadata, stale upload rejected', () => {
 const tab = browserState.openTab('https://example.com');
 const identity = { tabId: tab.id, url: tab.url, navigationId: tab.navigationId! };
 assert.equal(browserState.setScreenshot(tab.id, 'data:image/png;base64,test', identity), true);
 browserState.reloadTab(tab.id);
 assert.equal(browserState.getScreenshot(tab.id), undefined);
 assert.equal(browserState.setScreenshot(tab.id, 'old', identity), false);
});
test('final answer requires explicit task completion and current evidence quote', async () => {
 const { validateFinalAnswer } = await import('../shared/challenge-state.js');
 const tab = browserState.openTab('https://example.com');
 const snap = snapshot(tab);
 assert.equal(validateFinalAnswer(tab, snap, 'Done').outcome, 'failed');
 assert.equal(validateFinalAnswer(tab, snap, JSON.stringify({ outcome: 'completed', answer: 'Done', evidence: 'previous site' })).outcome, 'failed');
 assert.equal(validateFinalAnswer(tab, snap, JSON.stringify({ outcome: 'completed', answer: 'Done', evidence: 'Product listing' })).outcome, 'completed');
 assert.equal(validateFinalAnswer(tab, snapshot(tab, ''), JSON.stringify({ outcome: 'completed', answer: '¥10', evidence: 'Product listing' })).outcome, 'blocked');
});
test('slider mention without a visible widget is not slider evidence', () => {
 const tab = browserState.openTab('https://example.com');
 assert.equal(classifyChallenge(tab, snapshot(tab, 'Drag the slider to complete the puzzle')).state, 'ok');
});
test('MCP exposes disconnected / unsupported failures and rejects stale cached DOM', async () => {
 const { McpServerHandler } = await import('../server/mcp-server.js');
 const tab = browserState.openTab('https://www.taobao.com');
 browserState.setDomSnapshot(tab.id, snapshot(tab, '亲，请登录'));
 browserState.navigateTab(tab.id, 'https://www.1688.com');
 const dom = await McpServerHandler.executeTool('browser_get_dom', {});
 assert.equal(dom.isError, true);
 assert.doesNotMatch(dom.content[0].text, /亲，请登录|taobao/);
 for (const name of ['browser_drag', 'browser_extract_content', 'browser_scroll', 'browser_screenshot']) {
  const result = await McpServerHandler.executeTool(name, { x: 1, y: 1, toX: 2, toY: 1, direction: 'down' });
  assert.equal(result.isError, true, name);
  assert.doesNotMatch(result.content[0].text, /✅/);
 }
});
test('navigation waits for target observation, not just URL assignment', async () => {
 const tab = browserState.openTab('https://example.com');
 assert.equal((await browserState.waitForDocument(tab.id, 5)).success, false);
 const unsubscribe = browserState.subscribeUiEvents(() => {});
 try {
  const pending = browserState.waitForDocument(tab.id, 200);
  browserState.setDomSnapshot(tab.id, snapshot(tab));
  assert.equal((await pending).success, true);
 } finally { unsubscribe(); }
});
test('extraction results require current navigation and nonempty content', async () => {
 const tab = browserState.openTab('browser://forms');
 browserState.setDomSnapshot(tab.id, snapshot(tab));
 let pendingId = '';
 const unsubscribe = browserState.subscribeUiEvents((event, data) => {
  if (event === 'execute_command') pendingId = data.id;
 });
 try {
  for (const data of [{ excerpt: 'unbound data' }, { ...snapshot(tab), excerpt: '' }]) {
   const pending = browserState.dispatchCommand('extract_content', {});
   browserState.resolveCommandResult({ commandId: pendingId, success: true, data });
   assert.equal((await pending).success, false);
  }
  const pending = browserState.dispatchCommand('click', {});
  browserState.reloadTab(tab.id);
  browserState.resolveCommandResult({ commandId: pendingId, success: true });
  assert.equal((await pending).success, false);
 } finally { unsubscribe(); }
});
test('login header with listings is not a login wall', () => {
 const tab = browserState.openTab('https://www.taobao.com');
 assert.equal(classifyChallenge(tab, snapshot(tab, '亲，请登录 | Products ¥10 ¥20')).state, 'ok');
});
test('proxy fetch-error observation does not confirm successful target navigation', async () => {
 const tab = browserState.openTab('https://example.com');
 browserState.setDomSnapshot(tab.id, snapshot(tab, 'Không thể kết nối tới trang web: fetch failed'));
 const result = await browserState.waitForDocument(tab.id, 5);
 assert.equal(result.success, false);
 assert.equal(result.data.state, 'fetch_error');
});
