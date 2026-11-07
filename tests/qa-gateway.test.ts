import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOpenAiRequest, toOpenAiResponse, openAiModelsList, saveQaRecord, listQa } from '../server/qa-gateway.js';

describe('QA gateway (obmc-qa-gateway-20261107)', () => {
  test('maps OpenAI messages: system → instructions, history → context, last user → question', () => {
    const m = mapOpenAiRequest({
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: 'Trả lời tiếng Việt.' },
        { role: 'user', content: 'Thủ đô Pháp?' },
        { role: 'assistant', content: 'Paris.' },
        { role: 'user', content: 'Còn Nhật?' },
      ],
    });
    assert.equal(m.model, 'gemini-3.8-flash');
    assert.equal(m.systemInstructions, 'Trả lời tiếng Việt.');
    assert.match(m.prompt, /Thủ đô Pháp\?/);
    assert.match(m.prompt, /Trợ lý: Paris\./);
    assert.match(m.prompt, /Câu hỏi hiện tại: Người dùng: Còn Nhật\?/);
  });

  test('single message maps clean; empty body yields empty prompt', () => {
    const m = mapOpenAiRequest({ messages: [{ role: 'user', content: '  hello  ' }] });
    assert.equal(m.prompt, 'hello');
    assert.equal(mapOpenAiRequest({}).prompt, '');
  });

  test('record → OpenAI chat.completion shape', () => {
    const body: any = toOpenAiResponse({
      id: 'qa-abc', question: 'Hà Nội?', answer: 'Thủ đô VN.', model: 'gemini-3.8-flash',
      timingMs: 1200, createdAt: '2026-11-07T10:00:00.000Z',
    });
    assert.equal(body.object, 'chat.completion');
    assert.match(body.id, /^chatcmpl-qa-abc$/);
    assert.equal(body.choices[0].message.content, 'Thủ đô VN.');
    assert.equal(body.choices[0].finish_reason, 'stop');
    assert.ok(body.usage.total_tokens >= body.usage.completion_tokens);
  });

  test('models list is OpenAI-shaped', () => {
    const list: any = openAiModelsList({} as any);
    assert.equal(list.object, 'list');
    assert.ok(list.data.length >= 3);
    assert.equal(list.data[0].owned_by, 'obmc');
  });

  test('save + list round-trips through the persist store', async () => {
    const rec = await saveQaRecord({ question: 'test q', answer: 'test a', model: 'm', timingMs: 5, source: 'test' });
    assert.match(rec.id, /^qa-/);
    const items = await listQa(5);
    assert.ok(items.some(i => i.id === rec.id && i.answer === 'test a'));
  });
});
