# agent-desktop sidecar (OS computer-use) — dual MCP

**Do not run OS accessibility control inside Vercel.**  
[vercel-labs/agent-desktop](https://github.com/vercel-labs/agent-desktop) reads the **desktop** accessibility tree (~60 commands) over **stdio MCP only**. This Open Browser MCP Controller covers **browser / HTTP extract**. Run both side-by-side.

## Skill routing

| Need | Tool prefix | Where |
|---|---|---|
| Web pages, HTML, SERP, crawl | `extract_*` | This server (Vercel or Docker) |
| Real Chromium | `pw_*` | Docker / local / CDP |
| Agent mailbox | `mail_*` | This server (+ Upstash on Vercel) |
| ChatGPT/Gemini/Claude UI | `ai_*` | Docker / local |
| Native apps, OS UI, Finder, settings | `desktop_*` (agent-desktop) | **Your machine only** |

## Install agent-desktop (owner machine)

Follow upstream docs: https://agent-browser.dev/desktop/guides/mcp

Typical:

```bash
# example — check upstream for current install
npm i -g agent-desktop
# or: brew / cargo / binary release from vercel-labs/agent-desktop
```

## Cursor / Claude Desktop MCP config (dual)

See [`configs/mcp.dual.example.json`](../configs/mcp.dual.example.json).

- **open-browser-mcp-controller**: Streamable HTTP to your Vercel/Render URL **or** `npm run mcp:stdio` locally.
- **agent-desktop**: stdio command on the same laptop/desktop.

## Optional companion (off by default)

A local process could forward signed webhooks from OBMC → agent-desktop CLI. That is **high risk** if exposed publicly.

Rules:

1. Never publish desktop MCP without auth.
2. Prefer LAN / SSH tunnel / Cloudflare Tunnel with token.
3. Confirm destructive OS actions (quit app, delete, type password fields) with a human.

## Security

Computer-use can click anything the logged-in user can. Treat the sidecar like giving the agent your keyboard and mouse.
