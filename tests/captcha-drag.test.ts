import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDragPath } from '../shared/drag-path.js';
import { CAPTCHA_INTERACTION_RULES, PRICE_GROUNDING_RULES } from '../server/gemini-agent.js';
import { MCP_BROWSER_TOOLS as BROWSER_TOOLS } from '../server/mcp-browser-tools.js';
import { MCP_PLAYWRIGHT_TOOLS as PLAYWRIGHT_TOOLS } from '../server/playwright/tools.js';

describe('buildDragPath', () => {
  test('includes start and end, respects steps', () => {
    const p = buildDragPath({ x: 10, y: 50 }, { x: 250, y: 50 }, 20);
    assert.equal(p.length, 20);
    assert.deepEqual(p[0], { x: 10, y: 50 });
    assert.deepEqual(p[p.length - 1], { x: 250, y: 50 });
  });
  test('clamps steps to >= 2', () => {
    assert.equal(buildDragPath({ x: 0, y: 0 }, { x: 5, y: 0 }, 1).length, 2);
    assert.equal(buildDragPath({ x: 0, y: 0 }, { x: 5, y: 0 }, 0).length, 2);
  });
  test('monotonic for horizontal slider', () => {
    const p = buildDragPath({ x: 0, y: 30 }, { x: 300, y: 30 }, 30);
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i].x >= p[i - 1].x);
      assert.equal(p[i].y, 30);
    }
  });
});

describe('CAPTCHA_INTERACTION_RULES', () => {
  test('mentions drag, slider, simple puzzle; forbids invented data', () => {
    assert.match(CAPTCHA_INTERACTION_RULES, /browser_drag/);
    assert.match(CAPTCHA_INTERACTION_RULES, /[Ss]lider/);
    assert.match(CAPTCHA_INTERACTION_RULES, /simple puzzle/);
    assert.match(CAPTCHA_INTERACTION_RULES, /KHÔNG bịa giá/);
    assert.match(CAPTCHA_INTERACTION_RULES, /QR/);
    assert.match(PRICE_GROUNDING_RULES, /KHÔNG bịa/);
  });
  test('tool lists expose drag tools', () => {
    assert.ok((BROWSER_TOOLS as any[]).some((t) => t.name === 'browser_drag'));
    assert.ok((PLAYWRIGHT_TOOLS as any[]).some((t) => t.name === 'pw_mouse_drag_xy'));
  });
});
