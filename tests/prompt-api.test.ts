import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePromptRunRequest, promptModelCascade } from '../server/prompt-api.js';

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

  test('cascade respects GEMINI_MODEL env and always has fallbacks', () => {
    const withEnv = promptModelCascade({ GEMINI_MODEL: 'custom-model' } as any);
    assert.equal(withEnv[0], 'custom-model');
    assert.ok(promptModelCascade({} as any).length >= 3);
  });
});
