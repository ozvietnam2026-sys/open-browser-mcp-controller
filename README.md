# Open Browser MCP Controller

**EN** · In-app browser UI + MCP server with multi-strategy web extraction, CDP DevTools tools, agent mailbox, and browser-AI helpers.  
**VI** · Giao diện trình duyệt trong app + máy chủ MCP: trích xuất web đa chiến lược, công cụ CDP/DevTools, hộp thư agent, và điều khiển UI AI trên trình duyệt.

Live (Vercel): https://open-browser-mcp-controller-ozvietnam.vercel.app  
Version: **3.1.0**

---

## English

### What this is
A Vite + React UI paired with an Express MCP server. Agents can:

1. Drive the **simulated in-app browser** (`browser_*`)
2. Extract data over **plain HTTP** (`extract_*`) — works on Vercel serverless
3. Drive **real Chromium via Playwright + CDP** (`pw_*`) — Docker / local host
4. Use an **in-memory agent mailbox** (`mail_*`) — mailnotmilk-inspired; ephemeral on Vercel
5. Drive **logged-in browser AI UIs** (`ai_*`) — browser-ai-bridge / mailnotmilk-inspired

### Inspiration (what we adopted)

| Project | Adopted into this repo |
|---|---|
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | `pw_connect` (browserURL/wsEndpoint), `pw_console` / `pw_console_message`, `pw_network` / `pw_network_request`, `pw_emulate`, `pw_performance`, `pw_evaluate`, snapshot/ref + `pw_find` |
| [jeffrey-nz/browser-ai-bridge](https://github.com/jeffrey-nz/browser-ai-bridge) | Provider catalog, open/send/extract conversation via Playwright, CDP + persistent profile env knobs |
| [jrb00013/mailnotmilk](https://github.com/jrb00013/mailnotmilk) | Agent mailbox (`mail_*`), handoffs, rooms/board; browser AI open/extract/send patterns in `ai_*` |
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | Readable Markdown, a11y snapshot → act on refs, network tooling |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | Snapshot/refs, click/type by ref, screenshot/PDF, wait/scroll |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | stdio + Streamable HTTP, `/mcp` single entry, tool grouping |

**Name resolution notes**
- `chrome-devtools-mcp` → exact: **ChromeDevTools/chrome-devtools-mcp**
- `browser-ai-bridge` → exact: **jeffrey-nz/browser-ai-bridge** (also related: YosefHayim/ai-browser-bridge, usedhonda/chrome-ai-bridge)
- `mailnotmilk` → exact: **jrb00013/mailnotmilk**

### Transports
| Transport | Endpoint / command | Notes |
|---|---|---|
| SSE (legacy) | `GET /mcp/sse` + `POST /mcp/messages` | Existing clients |
| JSON-RPC | `POST /api/mcp/rpc` | Simple curl / UI tester |
| Streamable HTTP | `GET\|POST /mcp` | GitHub-MCP-style single URL |
| stdio | `npm run mcp:stdio` | Local MCP clients |

### Tool groups

#### Extraction (Vercel ✅)
`extract_http_fetch`, `extract_readable`, `extract_structured`, `extract_tables`, `extract_lists`, `extract_links`, `extract_metadata`, `extract_discover`, `extract_robots`, `extract_sitemap`, `extract_crawl`, `extract_paginate`, `extract_json_api`

REST: `GET /api/extract/health` · `POST /api/extract/:tool`

#### Playwright / Chrome DevTools (Docker/local ✅ · Vercel ❌ clear error)
`pw_connect`, `pw_navigate`, `pw_snapshot`, `pw_find`, `pw_click`, `pw_type`, `pw_press`, `pw_select`, `pw_hover`, `pw_wait`, `pw_scroll`, `pw_evaluate`, `pw_console`, `pw_console_message`, `pw_network`, `pw_network_request`, `pw_emulate`, `pw_performance`, `pw_screenshot`, `pw_pdf`, `pw_close`

Attach to an existing Chrome:
```bash
google-chrome --remote-debugging-port=9222
# then MCP tool pw_connect { "browserURL": "http://127.0.0.1:9222" }
# or env: CDP_BROWSER_URL=http://127.0.0.1:9222
```

#### Mailbox (Vercel warm instance ✅ ephemeral · Docker ✅)
`mail_whoami`, `mail_register`, `mail_post`, `mail_handoff`, `mail_inbox`, `mail_read`, `mail_reply`, `mail_board`, `mail_stats`

REST: `POST /api/mail/:tool` (e.g. `/api/mail/inbox`)

#### Browser AI (list on Vercel ✅ · automation Docker/local ✅)
`ai_list_providers`, `ai_open`, `ai_send_message`, `ai_extract_messages`, `ai_status`

REST: `POST /api/ai/:tool`

### Quick start
```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000
npm run smoke        # extraction + mailbox + degrade checks
npm run mcp:stdio    # stdio MCP server
```

### Docker (Playwright + CDP)
```bash
docker build -t open-browser-mcp .
docker run --rm -p 3000:3000 -e ENABLE_PLAYWRIGHT=1 open-browser-mcp
```

### Environment
See `.env.example` for `GEMINI_API_KEY`, `CDP_BROWSER_URL` / `CDP_WS_ENDPOINT`, `PW_USER_DATA_DIR`, `DISABLE_PLAYWRIGHT`.

### Vercel limits
- SSE may cut after ~60s.
- `pw_*` and `ai_open/send/extract` return explicit errors (no Chromium).
- `mail_*` is in-memory and resets on cold start.
- Set `GEMINI_API_KEY` for the in-app Gemini panel.

---

## Tiếng Việt

### Đây là gì
Ứng dụng gồm giao diện trình duyệt giả lập (React) và máy chủ MCP (Express). Agent có thể:

1. Điều khiển **trình duyệt trong app** (`browser_*`)
2. **Trích xuất HTTP** (`extract_*`) — chạy được trên Vercel
3. Điều khiển **Chromium thật + CDP** (`pw_*`) — cần Docker/máy local
4. **Hộp thư agent** (`mail_*`) — lấy cảm hứng từ mailnotmilk (tạm thời trên Vercel)
5. **Điều khiển UI AI trên trình duyệt** (`ai_*`) — browser-ai-bridge / mailnotmilk

### Nguồn tinh hoa
- **chrome-devtools-mcp**: kết nối Chrome sẵn có, console, network, emulate, performance, evaluate
- **browser-ai-bridge**: danh sách provider, mở/gửi/đọc hội thoại AI web, profile CDP
- **mailnotmilk**: mailbox agent, handoff, board; mẫu open/extract/send AI web
- **agent-browser / playwright-mcp / github-mcp-server**: snapshot/ref, Markdown, transport MCP

### Chạy nhanh
```bash
npm install --legacy-peer-deps
npm run dev
npm run smoke
```

### Docker
```bash
docker build -t open-browser-mcp .
docker run --rm -p 3000:3000 -e ENABLE_PLAYWRIGHT=1 open-browser-mcp
```

### Giới hạn Vercel
Serverless: SSE có thể đứt ~60s; Playwright/`ai_*` automation không chạy (báo lỗi rõ); `mail_*` mất khi cold start. Dùng `extract_*` trên Vercel; dùng Docker khi cần `pw_*` / `ai_*`.
