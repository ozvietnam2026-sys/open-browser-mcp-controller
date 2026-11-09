/**
 * obmc-chat-driver-20261109 — drive AI chat UIs via raw WebSocket CDP.
 * No Playwright dependency — uses 'ws' directly against the CDP endpoint.
 * No API keys — uses browser sessions already logged in on the 24/7 Chrome.
 */
import http from 'http';
import WebSocket from 'ws';

export interface ChatAnswer {
  site: string;
  answer: string;
  timingMs: number;
  error?: string;
}

interface SiteConfig {
  hostMatch: string;
  typeExpr: (q: string) => string;
  sendExpr: string;
  responseSel: string;
}

const SITES: Record<string, SiteConfig> = {
  deepseek: {
    hostMatch: 'chat.deepseek.com',
    typeExpr: (q) => `(function(){const t=document.querySelector('textarea');if(!t)return 'no-input';t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(q)});t.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`,
    sendExpr: `(function(){const t=document.querySelector('textarea');if(!t)return 'no-input';t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));return 'sent';})()`,
    responseSel: '[class*="message"]',
  },
  gemini: {
    hostMatch: 'gemini.google.com',
    typeExpr: (q) => `(function(){const e=document.querySelector('[contenteditable="true"],[role="textbox"]');if(!e)return 'no-input';e.focus();e.textContent=${JSON.stringify(q)};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`,
    sendExpr: `(function(){const e=document.querySelector('[contenteditable="true"],[role="textbox"]');if(!e)return 'no-input';e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));return 'sent';})()`,
    responseSel: '[class*="response"], [class*="message-container"]',
  },
  kimi: {
    hostMatch: 'kimi.ai',
    typeExpr: (q) => `(function(){const e=document.querySelector('.chat-input-editor,[contenteditable="true"]');if(!e)return 'no-input';e.focus();e.textContent=${JSON.stringify(q)};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`,
    sendExpr: `(function(){const b=document.querySelector('.send-button-container');if(b){b.click();return 'sent';}return 'no-send';})()`,
    responseSel: '[class*="message"]',
  },
};

/** Get tab list from CDP endpoint */
function getTabs(cdpUrl: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    http.get(`${cdpUrl}/json/list`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/** Evaluate JS in a tab via WebSocket CDP */
function evalInTab(wsUrl: string, expr: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
    const timer = setTimeout(() => { ws.close(); reject(new Error('eval timeout')); }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          resolve(String(msg.result?.result?.value ?? ''));
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Ask a question on an AI chat site via CDP.
 * Uses raw WebSocket — no Playwright, no crash risk.
 */
export async function chatAskViaCdp(site: string, question: string, timeoutMs = 120_000): Promise<ChatAnswer> {
  const cfg = SITES[site];
  if (!cfg) return { site, answer: '', timingMs: 0, error: `Site không hỗ trợ: ${site}` };

  const started = Date.now();
  const cdpUrl = process.env.CDP_BROWSER_URL || 'http://127.0.0.1:9222';

  try {
    // Step 1: Find the right tab
    const tabs = await getTabs(cdpUrl);
    const tab = tabs.find((t: any) => t.type === 'page' && t.url?.includes(cfg.hostMatch));
    if (!tab) {
      return { site, answer: '', timingMs: Date.now() - started, error: `Không tìm thấy tab ${site} trên Chrome (CDP: ${cdpUrl})` };
    }
    const wsUrl = tab.webSocketDebuggerUrl;

    // Step 2: Type the question
    const typeRes = await evalInTab(wsUrl, cfg.typeExpr(question));
    if (typeRes !== 'ok') {
      return { site, answer: '', timingMs: Date.now() - started, error: `Type failed: ${typeRes}` };
    }

    await new Promise(r => setTimeout(r, 500));

    // Step 3: Send
    const sendRes = await evalInTab(wsUrl, cfg.sendExpr);
    if (sendRes !== 'sent') {
      return { site, answer: '', timingMs: Date.now() - started, error: `Send failed: ${sendRes}` };
    }

    // Step 4: Poll for response
    const qSnippet = question.slice(0, 30);
    const pollExpr = `(function(){
      const els=document.querySelectorAll('${cfg.responseSel}');
      let last='';
      for(const el of els){const t=(el.textContent||'').trim();if(t&&t.length>5&&!t.includes(${JSON.stringify(qSnippet)}))last=t;}
      return last;
    })()`;

    const deadline = Date.now() + Number(timeoutMs);
    let lastResp = '';

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const resp = await evalInTab(wsUrl, pollExpr);

      if (resp && resp.length > 5 && resp !== lastResp) {
        lastResp = resp;
        // Wait 2s then check again to see if still streaming
        await new Promise(r => setTimeout(r, 2000));
        const again = await evalInTab(wsUrl, pollExpr);
        if (again === resp || again.length <= resp.length) {
          return { site, answer: resp.slice(0, 4000), timingMs: Date.now() - started };
        }
      }
    }

    return { site, answer: lastResp.slice(0, 4000) || '', timingMs: Date.now() - started, error: lastResp ? undefined : `Timeout ${timeoutMs}ms` };
  } catch (err: any) {
    return { site, answer: '', timingMs: Date.now() - started, error: `Lỗi CDP: ${err?.message || err}` };
  }
}
