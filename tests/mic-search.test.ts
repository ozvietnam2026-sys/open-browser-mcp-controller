import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserState } from '../server/browser-state.js';
import { classifyChallenge, finalAnswerGate, validateFinalAnswer } from '../shared/challenge-state.js';
import { micProductDirectoryUrl, micHotProductsUrl, isBadMicSearchUrl } from '../shared/mic-search.js';
import { MIC_SEARCH_RULES, PRICE_GROUNDING_RULES, CAPTCHA_INTERACTION_RULES } from '../server/gemini-agent.js';

const USER_EXCERPT = 'Sign In Join Free For Buyer For Supplier Inquiry Basket English Products The information you are looking for is not available currently.';
const snap = (tab: any, text: string) => ({ tabId: tab.id, navigationId: tab.navigationId, url: tab.url, title: 'Made-in-China', interactiveElements: [], simplifiedTree: '', textExcerpt: text, scrollPosition: { x: 0, y: 0, maxScrollY: 0 }, timestamp: Date.now() });

test('MIC not-available page (user verbatim excerpt) is empty_or_not_ready / blocked', () => {
  const tab = browserState.openTab('https://www.made-in-china.com/productdirectory.do?word=gpt+pro+5000');
  const s = snap(tab, USER_EXCERPT);
  assert.equal(classifyChallenge(tab, s).state, 'empty_or_not_ready');
  const gate = finalAnswerGate(tab, s);
  assert.equal(gate.outcome, 'blocked');
  const v = validateFinalAnswer(tab, s, JSON.stringify({ outcome: 'needs_user', answer: 'Cần đăng nhập', evidence: 'Sign In Join Free' }));
  assert.equal(v.outcome, 'blocked');
});
test('header Sign In / Join Free chrome alone is not a login wall', () => {
  const tab = browserState.openTab('https://www.made-in-china.com/');
  assert.equal(classifyChallenge(tab, snap(tab, 'Sign In Join Free For Buyer For Supplier Inquiry Basket English Products Canvas Tote Bag US$0.5 MOQ 500 Pieces')).state, 'ok');
});
test('MIC good vs bad search URL shapes', () => {
  assert.equal(micProductDirectoryUrl('gpt pro 5000'), 'https://www.made-in-china.com/productdirectory.do?word=gpt+pro+5000&subaction=hunt');
  assert.equal(micHotProductsUrl('gpt pro 5000'), 'https://www.made-in-china.com/products-search/hot-china-products/Gpt_Pro_5000.html');
  assert.equal(micHotProductsUrl('canvas tote bag'), 'https://www.made-in-china.com/products-search/hot-china-products/Canvas_Tote_Bag.html');
  assert.equal(isBadMicSearchUrl(micProductDirectoryUrl('gpt pro 5000')), false);
  assert.equal(isBadMicSearchUrl(micHotProductsUrl('gpt pro 5000')), false);
  assert.equal(isBadMicSearchUrl('https://www.made-in-china.com/productdirectory.do?word=gpt+pro+5000'), true);
  assert.equal(isBadMicSearchUrl('https://www.made-in-china.com/multi-search/canvas%2Btote%2Bbag/1.html'), true);
  assert.equal(isBadMicSearchUrl('https://www.made-in-china.com/multi-search/canvas+tote+bag/1.html'), true);
});
test('MIC_SEARCH_RULES teaches good shapes and keeps other rules intact', () => {
  assert.match(MIC_SEARCH_RULES, /subaction=hunt/);
  assert.match(MIC_SEARCH_RULES, /hot-china-products/);
  assert.match(MIC_SEARCH_RULES, /multi-search/);
  assert.match(MIC_SEARCH_RULES, /not available currently/);
  assert.match(MIC_SEARCH_RULES, /KHÔNG bịa/);
  assert.match(PRICE_GROUNDING_RULES, /KHÔNG bịa/);
  assert.match(CAPTCHA_INTERACTION_RULES, /browser_drag/);
});
