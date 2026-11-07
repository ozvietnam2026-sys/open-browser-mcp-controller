import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFinalProposal, FINAL_ANSWER_NUDGE } from '../server/gemini-agent.js';

describe('parseFinalProposal (obmc-final-nudge-20261107)', () => {
  test('accepts strict final-answer JSON', () => {
    const p = parseFinalProposal('{"outcome":"completed","answer":"Giá US$9,460","evidence":"US$9,460.00-11,000.00 (FOB Price)"}');
    assert.equal(p?.outcome, 'completed');
    assert.equal(p?.answer, 'Giá US$9,460');
  });

  test('accepts fenced JSON', () => {
    const p = parseFinalProposal('```json\n{"outcome":"needs_user","answer":"Cần đăng nhập","evidence":"亲，请登录"}\n```');
    assert.equal(p?.outcome, 'needs_user');
  });

  test('rejects prose (the GTX case: a grounded Vietnamese answer without JSON)', () => {
    const prose = 'Trên trang tìm kiếm Made-in-China với từ khóa "gtx 5000", hiện chưa có sản phẩm card đồ họa dòng GTX 5000 chính xác nào.';
    assert.equal(parseFinalProposal(prose), null);
  });

  test('rejects JSON whose outcome is not one of the four valid values', () => {
    assert.equal(parseFinalProposal('{"outcome":"success","answer":"x"}'), null);
    assert.equal(parseFinalProposal('{"answer":"không có outcome"}'), null);
    assert.equal(parseFinalProposal('["array"]'), null);
  });

  test('nudge message demands the exact JSON shape and forbids tool calls', () => {
    assert.match(FINAL_ANSWER_NUDGE, /KHÔNG gọi công cụ/);
    assert.match(FINAL_ANSWER_NUDGE, /"outcome":"completed\|blocked\|needs_user\|failed"/);
    assert.match(FINAL_ANSWER_NUDGE, /"evidence"/);
  });
});
