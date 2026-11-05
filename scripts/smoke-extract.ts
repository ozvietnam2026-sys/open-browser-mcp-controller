/**
 * Smoke tests for HTTP-based extraction tools against public pages.
 */
import { executeExtractTool } from '../server/extract/index.js';

const results: Array<{ tool: string; ok: boolean; detail: string }> = [];

function parse(result: any) {
  const text = result?.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function run(tool: string, args: Record<string, any>, assert: (data: any) => void) {
  try {
    const result = await executeExtractTool(tool, args);
    const data = parse(result);
    assert(data);
    results.push({ tool, ok: true, detail: 'pass' });
    console.log(`✅ ${tool}`);
  } catch (err: any) {
    results.push({ tool, ok: false, detail: err?.message || String(err) });
    console.error(`❌ ${tool}:`, err?.message || err);
  }
}

async function main() {
  console.log('=== Open Browser MCP — extraction smoke tests ===\n');

  await run('extract_http_fetch', { url: 'https://example.com' }, (d) => {
    if (d.status !== 200) throw new Error(`status ${d.status}`);
    if (!String(d.bodyText).includes('Example Domain')) throw new Error('missing Example Domain');
  });

  await run('extract_readable', { url: 'https://example.com' }, (d) => {
    if (!d.markdown || d.wordCount < 1) throw new Error('no markdown');
  });

  await run(
    'extract_metadata',
    { url: 'https://en.wikipedia.org/wiki/Web_scraping' },
    (d) => {
      if (!d.metadata?.title) throw new Error('no title');
      if (!d.metadata?.openGraph && !d.metadata?.jsonLd) throw new Error('no og/jsonld');
    }
  );

  await run('extract_links', { url: 'https://news.ycombinator.com', limit: 30 }, (d) => {
    if (!Array.isArray(d.links) || d.links.length < 5) throw new Error('too few links');
  });

  await run(
    'extract_structured',
    {
      url: 'https://example.com',
      schema: {
        title: 'title',
        body: 'p',
        more: { selector: 'a', attr: 'href', many: true },
      },
    },
    (d) => {
      if (!d.data?.title || !/Example Domain/i.test(d.data.title)) throw new Error('no title field');
      if (!d.data?.body) throw new Error('no body field');
    }
  );

  await run('extract_robots', { url: 'https://www.wikipedia.org' }, (d) => {
    if (d.status >= 500) throw new Error(`robots status ${d.status}`);
  });

  await run('extract_json_api', { url: 'https://example.com' }, (d) => {
    if (!d.findings) throw new Error('no findings key');
  });

  await run(
    'extract_crawl',
    { url: 'https://example.com', maxPages: 2, delayMs: 100 },
    (d) => {
      if (!d.pagesCrawled || d.pagesCrawled < 1) throw new Error('no pages');
    }
  );

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Summary ===');
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.tool}: ${f.detail}`);
    process.exit(1);
  }
}

main();
