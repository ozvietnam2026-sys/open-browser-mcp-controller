import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtractSchema, clampRowValue, MAX_ROWS } from '../shared/listing-extract.js';
import { iframeCommandError } from '../shared/challenge-state.js';

describe('normalizeExtractSchema (obmc-extract-listings-20261107)', () => {
  test('accepts a Crawl4AI-style schema and clamps maxRows', () => {
    const { schema, error } = normalizeExtractSchema({
      baseSelector: '.products-list li',
      fields: [
        { name: 'title' },
        { name: 'price_text', selector: '.price' },
        { name: 'url', selector: 'a', attr: 'href' },
      ],
      maxRows: 999,
    });
    assert.equal(error, undefined);
    assert.equal(schema?.baseSelector, '.products-list li');
    assert.equal(schema?.fields.length, 3);
    assert.equal(schema?.maxRows, MAX_ROWS);
  });

  test('rejects missing pieces, bad names, duplicates', () => {
    assert.match(normalizeExtractSchema({}).error!, /baseSelector/);
    assert.match(normalizeExtractSchema({ baseSelector: 'li' }).error!, /fields/);
    assert.match(normalizeExtractSchema({ baseSelector: 'li', fields: [{ name: 'a b' }] }).error!, /không hợp lệ/);
    assert.match(
      normalizeExtractSchema({ baseSelector: 'li', fields: [{ name: 'x' }, { name: 'x' }] }).error!,
      /trùng tên/
    );
  });

  test('clampRowValue keeps verbatim text bounded', () => {
    assert.equal(clampRowValue('  US $9,460.00-11,000.00\n (FOB Price) '), 'US $9,460.00-11,000.00 (FOB Price)');
    assert.equal(clampRowValue(null), '');
    assert.equal(clampRowValue('A'.repeat(500)).length, 220);
  });
});

describe('iframe command policy', () => {
  test('extract_css is allowed on external iframes; extract_content/evaluate still blocked', () => {
    assert.equal(iframeCommandError('extract_css'), undefined);
    assert.match(iframeCommandError('extract_content')!, /Unsupported/);
    assert.match(iframeCommandError('evaluate')!, /Unsupported/);
    assert.equal(iframeCommandError('click'), undefined);
  });
});
