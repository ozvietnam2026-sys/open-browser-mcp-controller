import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApiKeys, isQuotaError } from '../server/prompt-api.js';

describe('API key pool & quota rotation (obmc-key-rotation-20261107)', () => {
  test('parses GEMINI_API_KEYS (comma/space), GEMINI_API_KEY and numbered keys — deduped, order kept', () => {
    const keys = parseApiKeys({
      GEMINI_API_KEYS: 'key-a, key-b  key-c',
      GEMINI_API_KEY: 'key-a',
      GEMINI_API_KEY_2: 'key-d',
      GEMINI_API_KEY_9: 'key-e',
      GEMINI_API_KEY_3: '',
    } as any);
    assert.deepEqual(keys, ['key-a', 'key-b', 'key-c', 'key-d', 'key-e']);
  });

  test('empty env yields empty pool (missing-key path unchanged)', () => {
    assert.deepEqual(parseApiKeys({} as any), []);
    assert.deepEqual(parseApiKeys({ GEMINI_API_KEYS: ' , ,' } as any), []);
  });

  test('quota errors are detected across Google phrasings', () => {
    assert.equal(isQuotaError('You exceeded your current quota'), true);
    assert.equal(isQuotaError('429: RESOURCE_EXHAUSTED'), true);
    assert.equal(isQuotaError('rate limit exceeded for model'), true);
    assert.equal(isQuotaError('This model is currently experiencing high demand'), false);
    assert.equal(isQuotaError('404 not found'), false);
    assert.equal(isQuotaError(''), false);
  });
});
