import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isExpandControl, formatReadProgress, sliceDocumentText, EXPAND_LABEL_RE } from '../shared/page-observation.js';

describe('isExpandControl (obmc-deep-read-20261107)', () => {
  test('accepts a collapsed View More button', () => {
    assert.equal(isExpandControl({ tagName: 'button', text: 'View More', ariaExpanded: 'false' }), true);
  });
  test('accepts Chinese / Vietnamese wording and missing aria-expanded', () => {
    assert.equal(isExpandControl({ tagName: 'button', text: '查看更多' }), true);
    assert.equal(isExpandControl({ tagName: 'div', text: 'Xem thêm' }), true);
  });
  test('rejects navigation links, submits, already-expanded and long labels', () => {
    assert.equal(isExpandControl({ tagName: 'a', text: 'View More', hasHref: true }), false);
    assert.equal(isExpandControl({ tagName: 'button', text: 'View More', type: 'submit' }), false);
    assert.equal(isExpandControl({ tagName: 'button', text: 'View More', ariaExpanded: 'true' }), false);
    assert.equal(isExpandControl({ tagName: 'button', text: 'This is a long product description about graphics cards and pricing' }), false);
    assert.equal(isExpandControl({ tagName: 'button', text: 'Buy Now' }), false);
  });
  test('label regex matches the marketplace wording we observed', () => {
    assert.match('View More', EXPAND_LABEL_RE);
    assert.doesNotMatch('Add to Cart', EXPAND_LABEL_RE);
  });
});

describe('formatReadProgress', () => {
  test('tells the model to keep reading when text remains', () => {
    const line = formatReadProgress({ read: 2000, total: 45000, collapsed: 3 });
    assert.match(line, /đã đọc 2000\/45000 ký tự/);
    assert.match(line, /offset/);
    assert.match(line, /3 mục vẫn còn thu gọn/);
  });
  test('no continuation hint once fully read', () => {
    const line = formatReadProgress({ read: 45000, total: 45000 });
    assert.doesNotMatch(line, /offset/);
    assert.doesNotMatch(line, /thu gọn/);
  });
});

describe('sliceDocumentText', () => {
  const full = 'A'.repeat(5000);
  test('chunks from an offset', () => {
    assert.equal(sliceDocumentText(full, 'short', 2000).length, 2000);
    assert.equal(sliceDocumentText(full, 'short', 2000)[0], 'A');
  });
  test('clamps offset past the end and falls back to the excerpt', () => {
    assert.equal(sliceDocumentText(full, 'short', 999999), 'A');
    assert.equal(sliceDocumentText(undefined, 'excerpt text', 0), 'excerpt text');
    assert.equal(sliceDocumentText(undefined, 'excerpt text', 3), 'erpt text');
  });
});
