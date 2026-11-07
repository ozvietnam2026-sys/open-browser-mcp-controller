import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ASSIST_RULES } from '../server/gemini-agent.js';

describe('HUMAN_ASSIST_RULES (obmc-human-assist-20261107)', () => {
  test('tells the model to pause via needs_user for human-only walls and trusted-gated content', () => {
    assert.match(HUMAN_ASSIST_RULES, /needs_user/);
    assert.match(HUMAN_ASSIST_RULES, /quét QR|QR/);
    assert.match(HUMAN_ASSIST_RULES, /trusted/);
    assert.match(HUMAN_ASSIST_RULES, /Tiếp tục/);
  });

  test('demands the answer tell the user WHAT to do, and forbids abusing needs_user to skip reading', () => {
    assert.match(HUMAN_ASSIST_RULES, /nêu rõ NGƯỜI DÙNG cần làm gì/);
    assert.match(HUMAN_ASSIST_RULES, /KHÔNG dùng needs_user để né/);
  });

  test('requires the loop to continue with the fresh observation after resume', () => {
    assert.match(HUMAN_ASSIST_RULES, /PHẢI tiếp tục nhiệm vụ gốc/);
    assert.match(HUMAN_ASSIST_RULES, /trả completed/);
  });
});
