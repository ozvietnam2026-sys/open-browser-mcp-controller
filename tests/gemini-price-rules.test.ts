import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_GROUNDING_RULES } from '../server/gemini-agent.js';

describe('PRICE_GROUNDING_RULES', () => {
  test('forbids invented prices on empty extract / captcha / login wall', () => {
    assert.match(PRICE_GROUNDING_RULES, /KHÔNG bịa/);
    assert.match(PRICE_GROUNDING_RULES, /rỗng/);
    assert.match(PRICE_GROUNDING_RULES, /captcha/);
    assert.match(PRICE_GROUNDING_RULES, /đăng nhập/);
    assert.match(PRICE_GROUNDING_RULES, /giá tham khảo/);
    assert.match(PRICE_GROUNDING_RULES, /URL nguồn/);
  });
});
