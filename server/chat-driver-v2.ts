/**
 * obmc-chat-driver-20261109 — drive AI chat UIs via Playwright CDP.
 * No API keys — uses browser sessions already logged in on the 24/7 Chrome.
 */
import { getPage } from './playwright/runtime.js';

export interface ChatAnswer {
  site: string;
  answer: string;
  timingMs: number;
  error?: string;
}

interface SiteConfig {
  url: string;
  typeExpr: (q: string) => string;
  sendExpr: string;
  responseExpr: string;
}

const SITES: Record<string, SiteConfig> = {
  deepseek: {
    url: 'chat.deepseek.com',
    typeExpr: (q) => `(function(){
      const ta = document.querySelector('textarea');
      if (!ta) return 'no-input';
      ta.focus();
      const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      s.call(ta, ${JSON.stringify(q)});
      ta.dispatchEvent(new Event('input', {bubbles: true}));
      return 'ok';
    })()`,
    sendExpr: `(function(){
      const ta = document.querySelector('textarea');
      if (!ta) return 'no-input';
      ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
      return 'sent';
    })()`,
    responseExpr: `(function(){
      const els = document.querySelectorAll('[class*="message"]');
      let last = '';
      for (const el of els) {
        const t = (el.textContent || '').trim();
        if (t && t.length > 3 && t !== arguments[1]) last = t;
      }
      return last;
    })()`,
  },
  gemini: {
    url: 'gemini.google.com',
    typeExpr: (q) => `(function(){
      const ed = document.querySelector('[contenteditable="true"], [role="textbox"]');
      if (!ed) return 'no-input';
      ed.focus();
      ed.textContent = ${JSON.stringify(q)};
      ed.dispatchEvent(new Event('input', {bubbles: true}));
      return 'ok';
    })()`,
    sendExpr: `(function(){
      const ed = document.querySelector('[contenteditable="true"], [role="textbox"]');
      if (!ed) return 'no-input';
      ed.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
      return 'sent';
    })()`,
    responseExpr: `(function(){
      const els = document.querySelectorAll('[class*="response"], [class*="message-container"]');
      let last = '';
      for (const el of els) {
        const t = (el.textContent || '').trim();
        if (t && t.length > 3) last = t;
      }
      return last;
    })()`,
  },
  kimi: {
    url: 'kimi.ai',
    typeExpr: (q) => `(function(){
      const ed = document.querySelector('.chat-input-editor, [contenteditable="true"]');
      if (!ed) return 'no-input';
      ed.focus();
      ed.textContent = ${JSON.stringify(q)};
      ed.dispatchEvent(new Event('input', {bubbles: true}));
      return 'ok';
    })()`,
    sendExpr: `(function(){
      const btn = document.querySelector('.send-button-container');
      if (btn) { btn.click(); return 'sent'; }
      return 'no-send-btn';
    })()`,
    responseExpr: `(function(){
      const els = document.querySelectorAll('[class*="message"]');
      let last = '';
      for (const el of els) {
        const t = (el.textContent || '').trim();
        if (t && t.length > 3) last = t;
      }
      return last;
    })()`,
  },
};

export async function chatAskViaCdp(site: string, question: string, timeoutMs: 120_000 | number = 120_000): Promise<ChatAnswer> {
  const cfg = SITES[site];
  if (!cfg) return { site, answer: '', timingMs: 0, error: `Site không hỗ trợ: ${site}` };
  const started = Date.now();

  try {
    const page = await getPage();

    // Check if current page is on the target site; if not, navigate
    if (!page.url().includes(cfg.url)) {
      await page.goto(`https://${cfg.url}`, { timeout: 30_000 });
      await sleep(3000);
    }

    // Type
    const typeRes = String(await page.evaluate(cfg.typeExpr(question)));
    if (typeRes !== 'ok') {
      return { site, answer: '', timingMs: Date.now() - started, error: `Type failed: ${typeRes}` };
    }
    await sleep(500);

    // Send
    const sendRes = String(await page.evaluate(cfg.sendExpr));
    if (sendRes !== 'sent') {
      return { site, answer: '', timingMs: Date.now() - started, error: `Send failed: ${sendRes}` };
    }

    // Poll for response
    const qSnippet = question.slice(0, 30);
    const deadline = Date.now() + Number(timeoutMs);
    let lastResponse = '';

    const respSel = site === 'deepseek' ? '[class*="message"]'
      : site === 'gemini' ? '[class*="response"], [class*="message-container"]'
      : '[class*="message"]';

    while (Date.now() < deadline) {
      await sleep(1500);
      const resp = String(await page.evaluate(`(function(){
        const els = document.querySelectorAll('${respSel}');
        let last = '';
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (t && t.length > 5 && !t.includes(${JSON.stringify(qSnippet)})) last = t;
        }
        return last;
      })()`));

      if (resp && resp.length > 5 && resp !== lastResponse) {
        lastResponse = resp;
        // Wait a bit more to see if it's still streaming
        await sleep(2000);
        const checkAgain = String(await page.evaluate(`(function(){
          const els = document.querySelectorAll('${respSel}');
          let last = '';
          for (const el of els) {
            const t = (el.textContent || '').trim();
            if (t && t.length > 5 && !t.includes(${JSON.stringify(qSnippet)})) last = t;
          }
          return last;
        })()`));
        if (checkAgain === resp || checkAgain.length <= resp.length) {
          return { site, answer: resp.slice(0, 4000), timingMs: Date.now() - started };
        }
      }
    }

    return { site, answer: String(lastResponse).slice(0, 4000) || '', timingMs: Date.now() - started, error: lastResponse ? undefined : 'Timeout' };
  } catch (err: any) {
    return { site, answer: '', timingMs: Date.now() - started, error: `Lỗi: ${err?.message || err}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
