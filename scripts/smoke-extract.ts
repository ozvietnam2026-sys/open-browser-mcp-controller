/**
 * Smoke tests for HTTP extraction + mailbox + tool registry.
 * Playwright / AI-web automation are checked for clear degrade messages when unavailable.
 */
import { executeExtractTool } from '../server/extract/index.js';
import { executeMailTool } from '../server/mailbox/index.js';
import { executeAiWebTool } from '../server/ai-web/index.js';
import { executePlaywrightTool } from '../server/playwright/tools.js';
import { ALL_MCP_TOOLS } from '../server/tools-registry.js';

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
  console.log('=== Open Browser MCP — smoke tests (v3.1) ===\n');

  await run('registry_counts', async () => {
    const names = ALL_MCP_TOOLS.map((t) => t.name);
    const need = ['extract_readable', 'pw_connect', 'pw_console', 'pw_network', 'pw_emulate', 'pw_performance', 'mail_inbox', 'ai_list_providers'];
    for (const n of need) {
      if (!names.includes(n)) throw new Error(`missing tool ${n}`);
    }
    if (names.length < 40) throw new Error(`too few tools: ${names.length}`);
    console.log(`   tools=${names.length}`);
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
    const d = parse(await executeExtractTool('extract_metadata', { url: 'https://en.wikipedia.org/wiki/Web_scraping' }));
    if (!d.metadata?.title) throw new Error('no title');
    if (!d.metadata?.openGraph && !d.metadata?.jsonLd) throw new Error('no og/jsonld');
  });

  await run('extract_links', async () => {
    const d = parse(await executeExtractTool('extract_links', { url: 'https://news.ycombinator.com', limit: 30 }));
    if (!Array.isArray(d.links) || d.links.length < 5) throw new Error('too few links');
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
    if (!d.data?.body) throw new Error('no body field');
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
    const d = parse(await executeExtractTool('extract_crawl', { url: 'https://example.com', maxPages: 2, delayMs: 100 }));
    if (!d.pagesCrawled || d.pagesCrawled < 1) throw new Error('no pages');
  });

  // mailnotmilk-inspired mailbox (works without browser)
  await run('mail_register_post_inbox', async () => {
    parse(await executeMailTool('mail_register', { agentId: 'smoke-bot', status: 'idle' }));
    const posted = parse(
      await executeMailTool('mail_post', {
        from: 'smoke-bot',
        room: 'smoke',
        body: 'hello from smoke',
        priority: 'normal',
        tags: ['smoke'],
      })
    );
    if (!posted.message?.id) throw new Error('no message id');
    const inbox = parse(await executeMailTool('mail_inbox', { agentId: 'smoke-bot', room: 'smoke', unreadOnly: false }));
    if (!Array.isArray(inbox.messages) || inbox.messages.length < 1) throw new Error('empty inbox');
  });

  await run('mail_handoff_board', async () => {
    const h = parse(
      await executeMailTool('mail_handoff', {
        from: 'smoke-bot',
        room: 'smoke',
        title: 'Smoke handoff',
        objective: 'Verify handoff shape',
        acceptance: 'board lists it',
      })
    );
    if (!h.message?.id || h.message.kind !== 'handoff') throw new Error('bad handoff');
    const board = parse(await executeMailTool('mail_board', { room: 'smoke' }));
    if (!Array.isArray(board.agents)) throw new Error('bad board agents');
    if (!Array.isArray(board.recent)) throw new Error('bad board recent');
  });

  await run('ai_list_providers', async () => {
    const d = parse(await executeAiWebTool('ai_list_providers', {}));
    const list = d.providers || d;
    if (!Array.isArray(list) || list.length < 3) throw new Error('few providers');
  });

  // On hosts without Playwright (or when DISABLE_PLAYWRIGHT=1), expect a clear error.
  await run('pw_degrade_message', async () => {
    process.env.DISABLE_PLAYWRIGHT = process.env.DISABLE_PLAYWRIGHT || '1';
    const d = parse(await executePlaywrightTool('pw_navigate', { url: 'https://example.com' }));
    const msg = JSON.stringify(d);
    if (!/Playwright|Docker|Vercel|disabled|unavailable/i.test(msg)) {
      throw new Error(`expected clear degrade message, got: ${msg.slice(0, 200)}`);
    }
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
