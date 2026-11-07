import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePromptRunRequest, promptModelCascade, THINKING_LEVELS } from '../server/prompt-api.js';

describe('prompt API contract (obmc-prompt-api-20261107)', () => {
  test('validates prompt body: required, bounded, model optional', () => {
    assert.match(validatePromptRunRequest({}).error!, /Thiếu prompt/);
    assert.match(validatePromptRunRequest({ prompt: '   ' }).error!, /Thiếu prompt/);
    assert.match(validatePromptRunRequest({ prompt: 'x'.repeat(8001) }).error!, /quá dài/);
    const ok = validatePromptRunRequest({ prompt: '  chào em  ', model: ' gemini-3.8-flash ' });
    assert.equal(ok.prompt, 'chào em');
    assert.equal(ok.model, 'gemini-3.8-flash');
    assert.equal(validatePromptRunRequest({ prompt: 'hi' }).model, undefined);
  });

  test('accepts AI-Studio Get-code params in BOTH naming styles', () => {
    const snake = validatePromptRunRequest({
      prompt: 'hi',
      thinking_level: 'Medium',
      max_output_tokens: 1024,
      system_instructions: 'Trả lời tiếng Việt',
    });
    assert.equal(snake.options?.thinkingLevel, 'medium');
    assert.equal(snake.options?.maxOutputTokens, 1024);
    assert.equal(snake.options?.systemInstructions, 'Trả lời tiếng Việt');

    const camel = validatePromptRunRequest({ prompt: 'hi', thinkingLevel: 'high' });
    assert.equal(camel.options?.thinkingLevel, 'high');
    assert.equal(validatePromptRunRequest({ prompt: 'hi' }).options, undefined);
  });

  test('rejects bad thinking level and out-of-range tokens', () => {
    assert.match(validatePromptRunRequest({ prompt: 'hi', thinkingLevel: 'ultra' }).error!, /không hợp lệ/);
    assert.match(validatePromptRunRequest({ prompt: 'hi', maxOutputTokens: 0 }).error!, /1-65536/);
    assert.match(validatePromptRunRequest({ prompt: 'hi', maxOutputTokens: 70000 }).error!, /1-65536/);
    assert.match(validatePromptRunRequest({ prompt: 'hi', systemInstructions: 'x'.repeat(8001) }).error!, /quá dài/);
    assert.deepEqual([...THINKING_LEVELS], ['minimal', 'low', 'medium', 'high']);
  });

  test('cascade respects GEMINI_MODEL env and always has fallbacks', () => {
    const withEnv = promptModelCascade({ GEMINI_MODEL: 'custom-model' } as any);
    assert.equal(withEnv[0], 'custom-model');
    assert.ok(promptModelCascade({} as any).length >= 3);
  });
});
