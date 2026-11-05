# Open Browser MCP Controller

**EN** · In-app browser UI + MCP server with multi-strategy web data extraction.  
**VI** · Giao diện trình duyệt trong app + máy chủ MCP, trích xuất dữ liệu web bằng nhiều chiến lược.

Live (Vercel): https://open-browser-mcp-controller-ozvietnam.vercel.app

---

## English

### What this is
A Vite + React UI (“AeroSearch” browser chrome) paired with an Express MCP server. Agents can:

1. Drive the **simulated in-app browser** (`browser_*` tools)
2. Extract data over **plain HTTP** (`extract_*` tools) — works on Vercel serverless
3. Drive **real Chromium via Playwright** (`pw_*` tools) — Docker / Render / Railway / Fly only

### Inspiration (what we adopted)

| Project | Adopted |
|---|---|
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | `read`-style Markdown extraction, accessibility snapshot → act on `@ref` / `eN`, MCP tool profiles, network tooling |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | A11y snapshot with refs, click/type by ref, network request capture, screenshot/PDF, wait/scroll patterns |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | stdio + Streamable HTTP transports, tool grouping / discovery, single `/mcp` HTTP entry |

### Transports
| Transport | Endpoint / command | Notes |
|---|---|---|
| SSE (legacy) | `GET /mcp/sse` + `POST /mcp/messages` | Existing clients |
| JSON-RPC | `POST /api/mcp/rpc` | Simple curl / UI tester |
| Streamable HTTP | `GET\|POST /mcp` | GitHub-MCP-style single URL |
| stdio | `npm run mcp:stdio` | Local MCP clients |

### Extraction tools (Vercel ✅)
`extract_http_fetch`, `extract_readable`, `extract_structured`, `extract_tables`, `extract_lists`, `extract_links`, `extract_metadata`, `extract_discover`, `extract_robots`, `extract_sitemap`, `extract_crawl`, `extract_paginate`, `extract_json_api`

REST helpers:
- `GET /api/extract/health`
- `POST /api/extract/:tool` (e.g. `/api/extract/readable` with JSON `{ "url": "…" }`)

### Playwright tools (Docker host ✅ / Vercel ❌ clear error)
`pw_navigate`, `pw_snapshot`, `pw_click`, `pw_type`, `pw_network`, `pw_screenshot`, `pw_pdf`, `pw_scroll`, `pw_close`

### Quick start
```bash
npm install
npm run dev          # http://localhost:3000
npm run smoke        # HTTP extraction smoke tests
npm run mcp:stdio    # stdio MCP server
```

### Docker (Playwright)
```bash
docker build -t open-browser-mcp .
docker run --rm -p 3000:3000 -e ENABLE_PLAYWRIGHT=1 open-browser-mcp
```

### Vercel
```bash
npm run build && npm run build:api
# deploy dist/ + api/index.mjs with vercel.json
```
Playwright tools return an explicit error on Vercel; use `extract_*` there.

---

## Tiếng Việt

### Đây là gì
Ứng dụng gồm giao diện trình duyệt giả lập (React) và máy chủ MCP (Express). Agent có thể:

1. Điều khiển **trình duyệt trong app** (`browser_*`)
2. **Trích xuất HTTP** (`extract_*`) — chạy được trên Vercel
3. Điều khiển **Chromium thật qua Playwright** (`pw_*`) — cần host chạy lâu (Docker)

### Lấy tinh hoa từ đâu
- **agent-browser (Vercel)**: đọc trang thành Markdown, snapshot a11y + ref, MCP
- **playwright-mcp (Microsoft)**: snapshot/ref, click/type theo ref, network, screenshot/PDF
- **github-mcp-server**: stdio + Streamable HTTP, nhóm tool, endpoint `/mcp`

### Chạy nhanh
```bash
npm install
npm run dev
npm run smoke
```

### Docker
```bash
docker build -t open-browser-mcp .
docker run --rm -p 3000:3000 open-browser-mcp
```

### Lưu ý Vercel
Vercel là serverless: SSE có thể đứt sau ~60s, Playwright không chạy. Dùng `extract_*` trên Vercel; dùng Docker khi cần `pw_*`.
