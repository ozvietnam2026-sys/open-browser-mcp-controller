# Open Browser MCP Controller

**EN** · In-app browser UI + MCP server with multi-strategy web extraction, CDP DevTools, agent mailbox, browser-AI helpers, tool profiles/caps, map/search/change-tracking.  
**VI** · Giao diện trình duyệt trong app + máy chủ MCP: trích xuất web đa chiến lược, CDP/DevTools, hộp thư agent, điều khiển UI AI, profile/caps, map/search/theo dõi thay đổi.

Live (Vercel): https://open-browser-mcp-controller-ozvietnam.vercel.app  
Version: **4.0.0** · Feature matrix: [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md)

---

## English

### What this is
Vite + React UI + Express MCP server. Agents can:

1. Drive the **simulated in-app browser** (`browser_*`)
2. Extract data over **plain HTTP** (`extract_*`) — Vercel-safe (map / search / change / observe / optional LLM)
3. Drive **real Chromium via Playwright + CDP** (`pw_*`) — Docker / local (tabs, dialogs, storage, routes, upload/download, XY)
4. Use an **agent mailbox** (`mail_*`) — file persistence via `MAIL_PERSIST_PATH`; ephemeral on Vercel
5. Drive **logged-in browser AI UIs** (`ai_*`) — Docker / local
6. Inspect **profiles / caps / cache** (`meta_*`) — always visible

### Inspiration (reimplemented ideas)
| Project | Adopted |
|---|---|
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | Snapshot/ref, `--delta`, proxy/UA/allowed-domains/contentBoundaries |
| [vercel-labs/agent-desktop](https://github.com/vercel-labs/agent-desktop) | Coordinate click pattern → `pw_mouse_*_xy` (browser scope) |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | `--caps`, storageState, tabs, dialogs, upload/download, routes, PDF |
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | CDP connect, console, network, emulate, performance, evaluate |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | toolsets/profiles, `--tools` / `--exclude-tools`, Streamable HTTP + stdio |
| [jeffrey-nz/browser-ai-bridge](https://github.com/jeffrey-nz/browser-ai-bridge) | `ai_*` provider drive without API keys |
| [jrb00013/mailnotmilk](https://github.com/jrb00013/mailnotmilk) | `mail_*` mailbox + handoffs + board |
| Firecrawl / Jina / Stagehand / Crawl4AI (public docs) | `extract_map`, `extract_search`, `extract_change`, `extract_readable`, `extract_observe`, `extract_llm`, schema extract |

Paid browser clouds (Browserbase / Steel / Bright Data) are **not** required — use Dockerfile or CDP attach.

### Transports
| Transport | Endpoint / command |
|---|---|
| SSE | `GET /mcp/sse` + `POST /mcp/messages` |
| JSON-RPC | `POST /api/mcp/rpc` |
| Streamable HTTP | `GET\|POST /mcp` |
| stdio | `npm run mcp:stdio` |

### Tool profiles (`OBMC_PROFILE` / `meta_set_profile`)
`minimal` · `extract` · `browser` · `full` · `devops` · `agents`  
Also: `OBMC_CAPS`, `MCP_TOOLS`, `MCP_EXCLUDE_TOOLS`.

### Vercel ✅ vs Docker ✅
| Group | Vercel | Docker/local |
|---|---|---|
| `extract_*`, `meta_*`, `mail_*` (warm), `ai_list_providers`, `browser_*` | ✅ | ✅ |
| `pw_*`, `ai_open/send/extract` | ❌ clear error | ✅ |
| Mail file persistence | ephemeral | `MAIL_PERSIST_PATH` |

### Quick start
```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000
npm run smoke
npm run mcp:stdio
```

### Docker
```bash
docker build -t open-browser-mcp .
docker run --rm -p 3000:3000 -e ENABLE_PLAYWRIGHT=1 -e MAIL_PERSIST_PATH=/data/mailbox.json \
  -v $(pwd)/data:/data open-browser-mcp
```

### Environment
See [`.env.example`](.env.example). Highlights: `GEMINI_API_KEY`, `OBMC_PROFILE`, `OBMC_ALLOWED_DOMAINS`, `OBMC_PROXY`, `OBMC_STEALTHISH`, `CDP_BROWSER_URL`, `MAIL_PERSIST_PATH`.

### Limits
- Vercel SSE ~60s; no Chromium; mail resets on cold start unless external store.
- Node `fetch` does not auto-use HTTP_PROXY (proxy URL is surfaced in config for future tunneling).
- `extract_llm` needs `GEMINI_API_KEY`.

---

## Tiếng Việt

### Đây là gì
Ứng dụng React + máy chủ MCP Express. Agent có thể lấy dữ liệu HTTP đa chiến lược, điều khiển Chromium/CDP, hộp thư agent, điều khiển UI AI, và bật/tắt nhóm công cụ theo profile.

### Tinh hoa đã tích hợp
- **agent-browser**: snapshot/ref, delta, proxy, allow-domains  
- **playwright-mcp**: caps, storageState, tabs, dialogs, upload/download, route mock  
- **chrome-devtools-mcp**: CDP, console, network, emulate, performance  
- **github-mcp**: profile/toolsets, exclude tools, Streamable HTTP  
- **browser-ai-bridge / mailnotmilk**: `ai_*`, `mail_*`  
- **Firecrawl / Jina / Stagehand**: map, search, change tracking, readable, observe, LLM extract tùy chọn  

Chi tiết: [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md)

### Chạy nhanh
```bash
npm install --legacy-peer-deps
npm run dev
npm run smoke
```

### Giới hạn Vercel
Không chạy Chromium; kết nối SSE có thể cắt ~60s; mailbox mất khi cold start (dùng Docker + `MAIL_PERSIST_PATH` để bền).
