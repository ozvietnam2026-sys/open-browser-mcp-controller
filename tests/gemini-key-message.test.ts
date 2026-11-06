import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getMissingGeminiKeyMessage } from '../server/gemini-agent.js';

describe('getMissingGeminiKeyMessage', () => {
  test('Vercel host points at Environment Variables + redeploy', () => {
    const msg = getMissingGeminiKeyMessage({ VERCEL: '1' } as NodeJS.ProcessEnv);
    assert.match(msg, /Vercel/i);
    assert.match(msg, /Environment Variables/i);
    assert.match(msg, /Redeploy|redeploy/i);
    assert.doesNotMatch(msg, /AI Studio/i);
    assert.doesNotMatch(msg, /AIza|sk-/);
  });

  test('AI Studio (DISABLE_HMR) points at Settings > Secrets', () => {
    const msg = getMissingGeminiKeyMessage({ DISABLE_HMR: 'true' } as NodeJS.ProcessEnv);
    assert.match(msg, /Settings > Secrets/);
    assert.match(msg, /AI Studio/);
  });

  test('generic host points at .env / host secrets', () => {
    const msg = getMissingGeminiKeyMessage({} as NodeJS.ProcessEnv);
    assert.match(msg, /\.env|secrets|Render/i);
    assert.doesNotMatch(msg, /AI Studio Settings/);
  });
});
