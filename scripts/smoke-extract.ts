/**
 * Smoke tests for HTTP extraction + mailbox + meta + tool registry (v4).
 * Playwright / AI-web automation are checked for clear degrade messages when unavailable.
 */
import { executeExtractTool } from '../server/extract/index.js';
import { executeMailTool } from '../server/mailbox/index.js';
import { executeAiWebTool } from '../server/ai-web/index.js';
import { executePlaywrightTool } from '../server/playwright/tools.js';
import { executeMetaTool } from '../server/meta/index.js';
import { ALL_MCP_TOOLS, getVisibleTools } from '../server/tools-registry.js';
import { getConfig } from '../server/config.js';

const results: Array<{ tool: string; ok: boolean; detail: string }> = [];

function parse(result: any) {
  const text = result?.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function run(tool: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ tool, ok: true, detail: 'pass' });
    console.log(`✅ ${tool}`);
  } catch (err: any) {
    results.push({ tool, ok: false, detail: err?.message || String(err) });
    console.error(`❌ ${tool}:`, err?.message || err);
  }
}

async function main() {
  console.log('=== Open Browser MCP — smoke tests (v4.0) ===\n');

  await run('registry_counts', async () => {
    const names = ALL_MCP_TOOLS.map((t) => t.name);
    const need = [
      'extract_readable',
      'extract_map',
      'extract_search',
      'extract_change',
      'extract_observe',
      'extract_llm',
      'extract_cache',
      'pw_connect',
      'pw_tabs',
      'pw_dialog',
      'pw_storage_state',
      'pw_route',
      'pw_upload',
      'pw_download',
      'pw_mouse_click_xy',
      'mail_inbox',
      'ai_list_providers',
      'meta_status',
      'meta_list_tools',
    ];
    for (const n of need) {
      if (!names.includes(n)) throw new Error(`missing tool ${n}`);
    }
    if (names.length < 70) throw new Error(`too few tools: ${names.length}`);
    const visible = getVisibleTools();
    console.log(`   catalog=${names.length} visible=${visible.length} version=${getConfig().version}`);
  });

  await run('meta_status', async () => {
    const d = parse(await executeMetaTool('meta_status', {}));
    if (d.version !== '4.0.0') throw new Error(`bad version ${d.version}`);
    if (!Array.isArray(d.caps) || !d.caps.length) throw new Error('no caps');
  });

  await run('extract_http_fetch', async () => {
    const d = parse(await executeExtractTool('extract_http_fetch', { url: 'https://example.com' }));
    if (d.status !== 200) throw new Error(`status ${d.status}`);
    if (!String(d.bodyText).includes('Example Domain')) throw new Error('missing Example Domain');
  });

  await run('extract_readable', async () => {
    const d = parse(await executeExtractTool('extract_readable', { url: 'https://example.com' }));
    if (!d.markdown || d.wordCount < 1) throw new Error('no markdown');
  });

  await run('extract_metadata', async () => {
    const d = parse(
      await executeExtractTool('extract_metadata', { url: 'https://en.wikipedia.org/wiki/Web_scraping' })
    );
    if (!d.metadata?.title) throw new Error('no title');
  });

  await run('extract_links', async () => {
    const d = parse(
      await executeExtractTool('extract_links', { url: 'https://en.wikipedia.org/wiki/Web_scraping', limit: 30 })
    );
    if (!Array.isArray(d.links) || d.links.length < 5) throw new Error(`too few links: ${d.links?.length}`);
  });

  await run('extract_structured', async () => {
    const d = parse(
      await executeExtractTool('extract_structured', {
        url: 'https://example.com',
        schema: {
          title: 'title',
          body: 'p',
          more: { selector: 'a', attr: 'href', many: true },
        },
      })
    );
    if (!d.data?.title || !/Example Domain/i.test(d.data.title)) throw new Error('no title field');
  });

  await run('extract_map', async () => {
    const d = parse(await executeExtractTool('extract_map', { url: 'https://example.com', limit: 20 }));
    if (!Array.isArray(d.urls) && !Array.isArray(d.links) && !d.count && !d.total) {
      // accept several shapes
      if (!d.url && !d.seed) throw new Error(`bad map shape: ${JSON.stringify(d).slice(0, 200)}`);
    }
  });

  await run('extract_search', async () => {
    const d = parse(await executeExtractTool('extract_search', { query: 'example domain', limit: 5 }));
    if (!Array.isArray(d.results) && !Array.isArray(d.items)) {
      throw new Error(`bad search shape: ${JSON.stringify(d).slice(0, 200)}`);
    }
  });

  await run('extract_observe', async () => {
    const d = parse(await executeExtractTool('extract_observe', { url: 'https://example.com', limit: 20 }));
    if (!Array.isArray(d.actions) && !Array.isArray(d.candidates) && !Array.isArray(d.elements)) {
      throw new Error(`bad observe shape: ${JSON.stringify(d).slice(0, 200)}`);
    }
  });

  await run('extract_change', async () => {
    const d1 = parse(await executeExtractTool('extract_change', { url: 'https://example.com', tag: 'smoke' }));
    const d2 = parse(await executeExtractTool('extract_change', { url: 'https://example.com', tag: 'smoke' }));
    if (!d1.status && !d1.change && !d1.result) {
      // expect status field like new|same|changed
      if (!['new', 'same', 'changed'].includes(d1.status) && !['new', 'same', 'changed'].includes(d2.status)) {
        // tolerate alternate keys
        if (!d1.diff && d2.status == null && d1.ok == null) {
          throw new Error(`bad change shape: ${JSON.stringify(d1).slice(0, 200)}`);
        }
      }
    }
  });

  await run('extract_cache', async () => {
    const d = parse(await executeExtractTool('extract_cache', { action: 'stats' }));
    if (typeof d.size !== 'number' && typeof d.entries !== 'number' && !d.ok && d.enabled == null) {
      // accept various stats shapes
      if (!('ttlSec' in d) && !('enabled' in d)) throw new Error(`bad cache stats: ${JSON.stringify(d)}`);
    }
  });

  await run('extract_robots', async () => {
    const d = parse(await executeExtractTool('extract_robots', { url: 'https://www.wikipedia.org' }));
    if (d.status >= 500) throw new Error(`robots status ${d.status}`);
  });

  await run('extract_json_api', async () => {
    const d = parse(await executeExtractTool('extract_json_api', { url: 'https://example.com' }));
    if (!d.findings) throw new Error('no findings key');
  });

  await run('extract_crawl', async () => {
    const d = parse(
      await executeExtractTool('extract_crawl', { url: 'https://example.com', maxPages: 2, delayMs: 100 })
    );
    if (!d.pagesCrawled || d.pagesCrawled < 1) throw new Error('no pages');
  });

  await run('mail_register_post_inbox', async () => {
    parse(await executeMailTool('mail_register', { agentId: 'smoke-bot', status: 'idle' }));
    const posted = parse(
      await executeMailTool('mail_post', {
        from: 'smoke-bot',
        room: 'smoke',
        body: 'hello from smoke v4',
        priority: 'normal',
        tags: ['smoke'],
      })
    );
    if (!posted.message?.id) throw new Error('no message id');
    const inbox = parse(await executeMailTool('mail_inbox', { agentId: 'smoke-bot', room: 'smoke' }));
    if (!Array.isArray(inbox.messages) || inbox.messages.length < 1) throw new Error('empty inbox');
  });

  await run('mail_handoff_board', async () => {
    const h = parse(
      await executeMailTool('mail_handoff', {
        from: 'smoke-bot',
        to: 'other-bot',
        title: 'Smoke handoff',
        objective: 'Verify handoff shape',
        acceptance: 'board lists it',
      })
    );
    if (!h.message?.id || h.message.kind !== 'handoff') throw new Error('bad handoff');
    const board = parse(await executeMailTool('mail_board', {}));
    if (!Array.isArray(board.agents)) throw new Error('bad board agents');
  });

  await run('ai_list_providers', async () => {
    const d = parse(await executeAiWebTool('ai_list_providers', {}));
    const list = d.providers || d;
    if (!Array.isArray(list) || list.length < 3) throw new Error('few providers');
  });

  await run('pw_degrade_message', async () => {
    process.env.DISABLE_PLAYWRIGHT = process.env.DISABLE_PLAYWRIGHT || '1';
    const d = parse(await executePlaywrightTool('pw_navigate', { url: 'https://example.com' }));
    const msg = JSON.stringify(d);
    if (!/Playwright|Docker|Vercel|disabled|unavailable/i.test(msg)) {
      throw new Error(`expected clear degrade message, got: ${msg.slice(0, 200)}`);
    }
  });

  await run('meta_list_tools', async () => {
    const d = parse(await executeMetaTool('meta_list_tools', {}));
    if (!d.count || d.count < 50) throw new Error(`few visible tools ${d.count}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Summary ===');
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.tool}: ${f.detail}`);
    process.exit(1);
  }
}

main();
