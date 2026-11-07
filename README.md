# Open Browser MCP Controller

**EN** · In-app browser UI + MCP server with multi-strategy web extraction, CDP DevTools, agent mailbox, browser-AI helpers, tool profiles/caps, map/search/change-tracking.  
**VI** · Giao diện trình duyệt trong app + máy chủ MCP: trích xuất web đa chiến lược, CDP/DevTools, hộp thư agent, điều khiển UI AI, profile/caps, map/search/theo dõi thay đổi.

Live (Vercel): https://open-browser-mcp-controller-ten.vercel.app  
Version: **4.1.12** · Feature matrix: [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md)

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

### v4.1.12 — deep read v3: content-reveal toggles first (`obmc-deep-read-20261107`)

- Click-priority fix: class-confirmed reveal toggles (spec/attrs "View More" style) are clicked BEFORE generic aria-expanded widgets (menus, FAQ) — on Made-in-China the strong set alone exceeded the whole budget and the spec toggle never got its click. Budget 8 → 12.

### v4.1.11 — deep read v2: navigation-guarded expand heuristic (`obmc-deep-read-20261107`)

- Live lesson from Made-in-China: a bare "View More" button can be an app promo that NAVIGATES away mid-task while the real spec toggle shares the same label. Expand heuristic v2: strong signal is an aria-expanded="false" attribute; a label match only counts when the element class confirms reveal semantics (toggle/expand/more/attrs); every auto-click is navigation-guarded (auto history.back() if the href changed).
- Expand passes re-arm at 1.8s/3.6s/6.5s for late-rendered toggles (the spec toggle renders after the first pass on lazy pages); total click budget 8; slow-AJAX safety re-snapshot at 9s.

### v4.1.10 — deep read: auto-expand + read progress + paginated text (`obmc-deep-read-20261107`)

- **Auto-expand pass**: after the first bound snapshot, the proxied-page bridge clicks reveal-only toggles (`View More / Show more / Read more / 查看更多 / Xem thêm`, `aria-expanded="false"`) once per load, bounded at 8, never `<a href>` / submit — then re-snapshots. Lazy-loaded spec tables (e.g. Made-in-China product HS Code) now land in the observation instead of staying invisible until a human clicks.
- **Read-progress meta**: every `browser_get_dom` response carries `Tiến trình đọc: đã đọc X/Y ký tự · còn N mục thu gọn` — the model is told explicitly what it has NOT seen and must not declare information missing before reading to the end.
- **Paginated reads**: snapshots now carry `fullText` (bounded 64KB) + `textTotalLength`; `browser_get_dom` accepts `offset` to page through long documents instead of the old hard 2.000-char cut.
- Agent prompt rule added: hidden/lazy content is expected on marketplace pages — expand, page through, and only then conclude.

### v4.1.9 — navigation wait re-bind + final-answer format nudge (`obmc-nav-wait-20261107`, `obmc-final-nudge-20261107`)

- `waitForDocument` no longer fails when a newer navigation supersedes the one it started with: it keeps polling until the snapshot binds to the **current** document (default budget 2.5s → 10s; proxied marketplace pages routinely need more than 2.5s). This fixes the storm where `browser_navigate` reported "Navigation timeout or superseded" while the tab URL actually advanced, and every later `browser_get_dom` stayed `stale_or_disconnected` until all steps burned out.
- `setDomSnapshot` still rejects mismatched documents (409) but now logs the identity mismatch server-side, so a never-binding document is debuggable instead of silent.
- Agent loop: a prose final answer is a **format slip, not task failure**. Before fail-closing and discarding a grounded answer, the model gets exactly one nudge to restate it as the required JSON (`{"outcome","answer","evidence"}`).
- Known limitation (unchanged): the server keeps ONE shared browser session (`browserState` singleton, `tab-1`) per warm instance. Two people driving the app at the same time will interleave navigations and trip over each other — one pilot at a time until per-session isolation lands.

### v4.1.8 — Made-in-China search URLs + not-available classification (`obmc-mic-search-20261107`)

- Branded "The information you are looking for is not available currently." pages are classified `empty_or_not_ready` (gate → `blocked`), not `ok`, not a login wall. Header chrome like "Sign In / Join Free" alone is not a login wall.
- The in-app agent now uses `productdirectory.do?word={query}&subaction=hunt` (or `products-search/hot-china-products/{Title_Case}.html`) and avoids `/multi-search/…+…/1.html` and `productdirectory.do` without `subaction=hunt` (both 404). Helper: `shared/mic-search.ts`.
- Not captcha bypass, and not a claim that every Made-in-China listing loads through the Vercel proxy.

### v4.1.7 — grounded observations (P0)
- `tabId + URL + navigationId` bind DOM, extraction and simulated screenshot metadata. Navigation/history/reload invalidate caches; mismatched iframe messages are ignored.
- Evidence-based, site-agnostic challenge states distinguish traffic walls, login, app/QR login, fetch/CORS errors and empty/stale observations. Feedback QR is not login; slider detection requires a visible widget signal.
- UI disconnect, timeout, unsupported external iframe commands and empty/unbound extraction fail closed. Navigation waits for an observation; a tool ACK is not proof of task completion.
- Agent results expose `completed / blocked / needs_user / failed`. Completion needs explicit model intent plus a quote from the current observation; no-tool responses and step limits are not automatic success.
- **Limits / Giới hạn:** this is not captcha bypass. External iframe forwarding still supports only click/type/scroll, not drag/extract. `browser_screenshot` remains simulated canvas text; Gemini still discards image blocks. Real Chrome routing, real pixels and human Continue remain P1. MCP auth and upstream Cookie/Authorization isolation are unchanged.
- Made-in-China.com is an upcoming sourcing target; add fixtures only after observed live evidence. No site-specific wall text is assumed.

### v4.1 highlights
- **Vercel** `maxDuration: 300` + SSE heartbeats every ~15s (reconnect-friendly)
- **Search cascade**: Tavily → Jina → Wikipedia OpenSearch → DuckDuckGo (keys auto-enable)
- **PersistStore**: Memory | File | Upstash Redis REST — mailbox + change-store durable when Redis env set
- **Playwright Docker**: optional Patchright (`PLAYWRIGHT_ENGINE=patchright`), stealthish init, `pw_trace_*`, `OBMC_VIDEO=1`
- **One-click Render**: [`render.yaml`](render.yaml) Blueprint
- **agent-desktop sidecar**: [`docs/agent-desktop-sidecar.md`](docs/agent-desktop-sidecar.md) + [`configs/mcp.dual.example.json`](configs/mcp.dual.example.json)

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
