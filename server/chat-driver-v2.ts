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
    // Verified live: Gemini response nằm trong <message-content> (Angular custom element)
    responseSel: 'message-content',
  },
  kimi: {
    hostMatch: 'kimi.ai',
    // Kimi rich-text editor: dùng execCommand insertText (works với ProseMirror/React)
    typeExpr: (q) => `(function(){const e=document.querySelector('.chat-input-editor,[contenteditable="true"]');if(!e)return 'no-input';e.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,${JSON.stringify(q)});e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`,
    sendExpr: `(function(){const b=document.querySelector('.send-button-container');if(b){b.click();return 'sent';}const e=document.querySelector('[contenteditable="true"],.chat-input-editor');if(e){e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));return 'sent';}return 'no-send';})()`,
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

/** Insert text via CDP Input level (works with React rich-text editors that resist DOM manipulation) */
function insertTextViaCdp(wsUrl: string, text: string, focusExpr: string, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
    const timer = setTimeout(() => { ws.close(); reject(new Error('insert timeout')); }, timeoutMs);
    let step = 0;
    ws.on('open', () => {
      // Step 1: Focus the editor via Runtime.evaluate
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: focusExpr, returnByValue: true } }));
    });
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.id === 1 && step === 0) {
          step = 1;
          // Step 2: Insert text at browser input level
          ws.send(JSON.stringify({ id: 2, method: 'Input.insertText', params: { text } }));
        } else if (msg.id === 2 && step === 1) {
          step = 2;
          clearTimeout(timer); ws.close(); resolve(true);
        }
      } catch { /* ignore */ }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** Send Enter key via CDP Input level */
function pressEnterViaCdp(wsUrl: string, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
    const timer = setTimeout(() => { ws.close(); reject(new Error('enter timeout')); }, timeoutMs);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } }));
    });
    ws.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(String(data));
      if (msg.id === 1) {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } }));
      } else if (msg.id === 2) {
        clearTimeout(timer); ws.close(); resolve(true);
      }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
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

    // Step 1.5: Đếm số messages TRƯỚC khi gửi (PHẢI lấy trước khi type/send!)
    const countBefore = parseInt(await evalInTab(wsUrl,
      `document.querySelectorAll('${cfg.responseSel}').length`
    )) || 0;

    // Step 2: Type the question
    // Kimi: dùng CDP Input.insertText (browser-level, bypasses React state)
    // Others: dùng Runtime.evaluate (DOM-level, works với textarea/contenteditable)
    if (site === 'kimi') {
      try {
        await insertTextViaCdp(wsUrl, question,
          `document.querySelector('.chat-input-editor,[contenteditable="true"]')?.focus(); 'ok'`
        );
      } catch (e: any) {
        return { site, answer: '', timingMs: Date.now() - started, error: `Kimi insert failed: ${e?.message}` };
      }
    } else {
      const typeRes = await evalInTab(wsUrl, cfg.typeExpr(question));
      if (typeRes !== 'ok') {
        return { site, answer: '', timingMs: Date.now() - started, error: `Type failed: ${typeRes}` };
      }
    }

    await new Promise(r => setTimeout(r, 500));

    // Step 3: Send
    if (site === 'kimi') {
      // Kimi: click send button via Runtime.evaluate
      const sendRes = await evalInTab(wsUrl, cfg.sendExpr);
      if (sendRes !== 'sent') {
        return { site, answer: '', timingMs: Date.now() - started, error: `Send failed: ${sendRes}` };
      }
    } else {
      const sendRes = await evalInTab(wsUrl, cfg.sendExpr);
      if (sendRes !== 'sent') {
        return { site, answer: '', timingMs: Date.now() - started, error: `Send failed: ${sendRes}` };
      }
    }

    // Step 4: Poll — CHỈ đọc message thứ N+1 trở đi (message MỚI), KHÔNG fallback về element cũ
    const pollExpr = `(function(){
      const els=document.querySelectorAll('${cfg.responseSel}');
      const before=${countBefore};
      let newText='';
      for(let i=before;i<els.length;i++){
        const t=(els[i].textContent||'').trim();
        if(t&&t.length>0)newText=t;
      }
      return newText;
    })()`;

    const deadline = Date.now() + Number(timeoutMs);
    let lastResp = '';

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const resp = await evalInTab(wsUrl, pollExpr);

      if (resp && resp.length > 0 && resp !== lastResp) {
        // Short answers (≤ 10 chars): return immediately — they're complete
        if (resp.length <= 10) {
          return { site, answer: resp.slice(0, 4000), timingMs: Date.now() - started };
        }
        // Long answers: wait 3s then check if still growing (streaming)
        lastResp = resp;
        await new Promise(r => setTimeout(r, 3000));
        try {
          const again = await evalInTab(wsUrl, pollExpr);
          if (again === resp || String(again).length <= resp.length) {
            return { site, answer: resp.slice(0, 4000), timingMs: Date.now() - started };
          }
        } catch {
          return { site, answer: resp.slice(0, 4000), timingMs: Date.now() - started };
        }
      }
    }

    return { site, answer: lastResp.slice(0, 4000) || '', timingMs: Date.now() - started, error: lastResp ? undefined : `Timeout ${timeoutMs}ms` };
  } catch (err: any) {
    return { site, answer: '', timingMs: Date.now() - started, error: `Lỗi CDP: ${err?.message || err}` };
  }
}
