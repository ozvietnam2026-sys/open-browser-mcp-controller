# Research notes — chrome-devtools-mcp, browser-ai-bridge, mailnotmilk

Date: 2026-11-05 (Asia/Saigon)

## 1. ChromeDevTools/chrome-devtools-mcp

- Official Google Chrome DevTools MCP for coding agents (Apache-2.0).
- npm: `chrome-devtools-mcp`
- Key capabilities adopted into Open Browser MCP:
  - Connect to running Chrome via `--browserUrl` / `--wsEndpoint` → `pw_connect`
  - Console messages → `pw_console` / `pw_console_message`
  - Network list + single request → `pw_network` / `pw_network_request`
  - Emulation (viewport, color scheme, geolocation, offline) → `pw_emulate`
  - Performance lab metrics / soft tracing → `pw_performance`
  - Evaluate script via CDP → `pw_evaluate`
  - Snapshot/ref discipline (stale-ref errors, `pw_find`)
- Not adopted (too heavy / Chrome-only internals): full Lighthouse bundle, heap snapshot suite, PWA/WebAuthn, screencast, CrUX calls.

## 2. browser-ai-bridge (name resolution)

Exact match: **jeffrey-nz/browser-ai-bridge** (npm `browser-ai-bridge`) — local REST API that drives logged-in AI web UIs (ChatGPT, Gemini, DeepSeek, Grok, Copilot, …) via Playwright/CDP **without API keys**.

Related candidates (if the name was meant differently):
- **YosefHayim/ai-browser-bridge** — terminal + MCP fan-out across many providers + sandboxed repo tools.
- **usedhonda/chrome-ai-bridge** — Chrome extension + daemon to ask ChatGPT/Gemini (fork lineage from chrome-devtools-mcp).

Adopted from jeffrey-nz/browser-ai-bridge:
- Provider catalog + open site
- Composer send / extract conversation heuristics
- CDP + persistent profile env knobs (`CDP_BROWSER_URL`, `PW_USER_DATA_DIR`, password-store flags)
- Tools: `ai_list_providers`, `ai_open`, `ai_send_message`, `ai_extract_messages`, `ai_status`

## 3. jrb00013/mailnotmilk

- Shared agent mailbox MCP + browser AI ↔ coding-agent relay.
- Adopted: in-memory mailbox tools (`mail_whoami/register/post/handoff/inbox/read/reply/board/stats`) and browser AI open/extract/send patterns mirrored in `ai_*`.
- Not adopted: Chrome extension installers, full durable hub persistence, auto `relay_tick` daemon (can be layered later on Docker).

## Platform split

| Group | Vercel | Docker/local |
|-------|--------|--------------|
| extract_* | ✅ | ✅ |
| mail_* | ✅ ephemeral | ✅ |
| ai_list_providers | ✅ | ✅ |
| ai_open/send/extract | ❌ clear error | ✅ |
| pw_* | ❌ clear error | ✅ (+ CDP attach) |
