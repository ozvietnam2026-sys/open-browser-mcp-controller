import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserState } from '../server/browser-state.js';
import { classifyChallenge } from '../shared/challenge-state.js';

/**
 * obmc-classifier-fixtures-20261107 — text fixtures captured from REAL browsing sessions on
 * 2026-11-07 (Vercel proxy, live sites). These lock the challenge classifier against the exact
 * strings the marketplace pages serve, not just paraphrases.
 */
const snap = (tab: any, text: string) => ({
  tabId: tab.id, navigationId: tab.navigationId, url: tab.url, title: 'P',
  interactiveElements: [], simplifiedTree: '', textExcerpt: text,
  scrollPosition: { x: 0, y: 0, maxScrollY: 0 }, timestamp: Date.now(),
});

const cases: Array<[string, string, string]> = [
  // [tên, URL thật đã gặp, chữ nguyên văn trên trang]
  ['MiC not-available (URL multi-search sai)', 'https://www.made-in-china.com/multi-search/canvas%2Btote%2Bbag/1.html',
    'Looking for China products? Try searching in Product Directory or Post Your Sourcing Request. The information you are looking for is not available currently.'],
  ['MiC listing thật sau khi auto-expand', 'https://www.made-in-china.com/products-search/hot-china-products/Rtx_5000_Pro.html',
    'Product List Rtx 5000 Pro, 189 Products found) FOB Price: US $15000 / Piece Min. Order: 1 Piece Diamond Member Audited Supplier Guangdong, China'],
  ['1688 unusual traffic (nguyên văn từng gặp)', 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%98%BE%E5%8D%A1',
    'We have detected unusual traffic from your network, please try again later.'],
  ['Taobao login overlay trên trang tìm kiếm', 'https://s.taobao.com/search?q=%E6%98%BE%E5%8D%A1',
    '亲，请登录 密码登录 请输入手机号码 Please try again'],
  ['Proxy fetch error (trang lỗi của chính app)', 'https://www.aliexpress.com/wholesale?SearchText=gpu',
    'Không thể kết nối tới trang web: fetch failed'],
  ['MiC trang sản phẩm ok (đọc hết vẫn ok)', 'https://ordosync.en.made-in-china.com/product/qOLtQChZldGc/China-High-Performance-Rtx-PRO-5000.html',
    'Product Attributes Graphics Card: Dedicated Graphics Card Video Memory Capacity: 48 GB FOB Price: US $8500 / Piece'],
];

for (const [name, url, text] of cases) {
  test(`fixture thật: ${name}`, () => {
    const tab = browserState.openTab(url);
    const result = classifyChallenge(tab, snap(tab, text));
    const expected =
      /not-available|listing thật|ok/.test(name) ? 'ok_or_empty' :
      /unusual/.test(name) ? 'unusual_traffic' :
      /login/.test(name) ? 'login_wall' :
      /fetch error/.test(name) ? 'fetch_error' : 'ok';
    if (expected === 'ok_or_empty') {
      assert.ok(result.state === 'ok' || result.state === 'empty_or_not_ready', `kỳ vọng ok/empty_or_not_ready, nhận ${result.state}`);
    } else {
      assert.equal(result.state, expected);
    }
  });
}
