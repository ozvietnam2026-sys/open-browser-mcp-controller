# Feature Matrix — Open Browser MCP Controller v4.1.8

Inventory of advanced / lesser-known features researched from public sources and adoption status.
Ideas are **reimplemented** (not copied) under compatible licenses; paid SaaS APIs are not required.

Legend: **adopted** = in repo · **planned** = backlog · **N/A** = not applicable / paid-only / desktop-OS only

## vercel-labs/agent-browser
| Feature | Source | Status |
|---|---|---|
| Accessibility snapshot + `@ref` / `eN` act | CLI `snapshot`, click/fill by ref | **adopted** (`pw_snapshot`, `pw_click`, `pw_type`) |
| Snapshot `--delta` | CLI flag | **adopted** (`pw_snapshot` `delta`) |
| `--proxy` / `AGENT_BROWSER_PROXY` | env/CLI | **adopted** (`OBMC_PROXY` / config; Node fetch notes native proxy limits) |
| `--allowed-domains` | CLI | **adopted** (`OBMC_ALLOWED_DOMAINS` + domain-policy) |
| `AGENT_BROWSER_CONTENT_BOUNDARIES` | env | **adopted** (`OBMC_CONTENT_BOUNDARIES`) |
| `AGENT_BROWSER_USER_AGENT` / ignore HTTPS | env | **adopted** |
| Download path | env | **adopted** (`OBMC_DOWNLOAD_DIR` + `pw_download`) |
| Session video/trace recording | CLI | **planned** (partial via `pw_performance` CDP trace) |
| Chrome extension relay | experimental | **planned** |

## vercel-labs/agent-desktop
| Feature | Source | Status |
|---|---|---|
| OS accessibility tree (~60 cmds) | README | **N/A** (desktop OS automation; out of browser MCP scope) |
| MCP stdio computer-use | README | **N/A** (use agent-desktop alongside this server) |
| Screenshot + click XY | desktop | **adopted** pattern as `pw_mouse_click_xy` / `pw_mouse_move_xy` (browser viewport) |

## microsoft/playwright-mcp
| Feature | Source | Status |
|---|---|---|
| `--caps` capability flags | CLI | **adopted** (`OBMC_CAPS` / `MCP_CAPS` + profiles) |
| `--profile` / tool reduction | docs | **adopted** (`OBMC_PROFILE`, `meta_set_profile`) |
| storageState save/load | `--storage-state` | **adopted** (`pw_storage_state`, `pw_set_storage_state`) |
| Tabs | `browser_tabs` | **adopted** (`pw_tabs`, `pw_tab_*`) |
| Dialogs | dialog tools | **adopted** (`pw_dialog`) |
| File upload / download | caps | **adopted** (`pw_upload`, `pw_download`) |
| Network route mock | network cap | **adopted** (`pw_route`, `pw_unroute`, `pw_route_list`) |
| PDF / screenshot | core | **adopted** |
| Tracing / video | caps | **planned** (metrics/trace start-stop partial) |
| Coordinate clicks | vision | **adopted** (`pw_mouse_*_xy`) |
| Form fill batch | tools | **adopted** (`pw_fill_form`, `pw_select`, `pw_drag`) |

## ChromeDevTools/chrome-devtools-mcp
| Feature | Source | Status |
|---|---|---|
| `--browserUrl` / `--wsEndpoint` CDP | CLI | **adopted** (`pw_connect`, `CDP_BROWSER_URL`) |
| Console / network inspection | tools | **adopted** (`pw_console*`, `pw_network*`) |
| Emulation (viewport, geo, UA, offline) | tools | **adopted** (`pw_emulate`) |
| Performance metrics / trace | tools | **adopted** (`pw_performance`) |
| `evaluate_script` | tools | **adopted** (`pw_evaluate`) |
| Persistent `userDataDir` | CLI | **adopted** (`PW_USER_DATA_DIR`) |
| Lighthouse full audit | tools | **planned** |
| Autofill / input files advanced | tools | **adopted** (upload) |

## github/github-mcp-server
| Feature | Source | Status |
|---|---|---|
| `--toolsets` / profiles | CLI | **adopted** (`TOOL_PROFILES`, `OBMC_PROFILE`) |
| `--tools` include list | CLI | **adopted** (`MCP_TOOLS`) |
| `--exclude-tools` | CLI | **adopted** (`MCP_EXCLUDE_TOOLS`, `meta_exclude_tools`) |
| Dynamic toolsets | removed May 2026 upstream | **N/A** (static filter + runtime meta switch) |
| Streamable HTTP + stdio | transports | **adopted** (`/mcp`, `mcp:stdio`) |

## jeffrey-nz/browser-ai-bridge
| Feature | Source | Status |
|---|---|---|
| Drive ChatGPT/Gemini/Claude UIs | README | **adopted** (`ai_*` tools) |
| No API key (logged-in browser) | README | **adopted** (Docker/local gate) |
| Multi-provider switch | tools | **adopted** |

## jrb00013/mailnotmilk
| Feature | Source | Status |
|---|---|---|
| Shared agent mailbox | README | **adopted** (`mail_*`) |
| Handoff / board / whoami | tools | **adopted** |
| Persistence | implied durable | **adopted** (`MAIL_PERSIST_PATH` file; Vercel ephemeral fallback) |
| Rooms / priority inbox | tools | **adopted** |

## Firecrawl (market)
| Feature | Source | Status |
|---|---|---|
| `/map` URL discovery | docs | **adopted** (`extract_map`) |
| `/search` | docs | **adopted** (`extract_search` via DuckDuckGo HTML, free) |
| `changeTracking` | docs | **adopted** (`extract_change`) |
| Actions / browse agent | paid | **planned** (use `pw_*` instead) |
| LLM extract | docs | **adopted** optional (`extract_llm` + GEMINI_API_KEY) |
| Crawl | docs | **adopted** (`extract_crawl`, limits) |

## Jina Reader
| Feature | Source | Status |
|---|---|---|
| Readable markdown | r.jina.ai pattern | **adopted** (`extract_readable`) |
| Reader headers / image captions | docs | **planned** |
| Search | docs | **adopted** free DDG path |

## Crawl4AI / Stagehand / Browser Use / Skyvern
| Feature | Source | Status |
|---|---|---|
| Schema CSS extract (LLM-free) | Crawl4AI / Stagehand | **adopted** (`extract_structured`) |
| `observe` then `act` | Stagehand | **adopted** (`extract_observe` HTTP; `pw_*` act) |
| LLM extract | Stagehand / Skyvern | **adopted** optional (`extract_llm`) |
| Self-healing selectors | Browser Use | **planned** |
| Vision agents | Skyvern | **planned** (XY click foundation ready) |

## Steel / Browserbase / Bright Data
| Feature | Source | Status |
|---|---|---|
| Hosted browser sessions | SaaS | **N/A** (use Dockerfile / CDP attach instead; no paid keys) |
| Stealth / residential proxy | SaaS | **partial** (`OBMC_STEALTHISH`, `OBMC_PROXY` config only — no reseller) |
| Session replay | SaaS | **planned** |

## Infra (cross-cutting)
| Feature | Status |
|---|---|
| TTL HTTP cache | **adopted** (`server/infra/cache.ts`, `extract_cache` / `meta_cache`) |
| Rate limit | **adopted** (`rate-limit.ts`) |
| Domain allow/block | **adopted** (`domain-policy.ts`) |
| Meta status / list tools | **adopted** (`meta_*`) |
| Vercel vs Docker gating | **adopted** (clear errors on `pw_*` / `ai_*`) |

## Sources (public)
- https://github.com/vercel-labs/agent-browser
- https://github.com/vercel-labs/agent-desktop
- https://github.com/microsoft/playwright-mcp
- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://github.com/github/github-mcp-server
- https://github.com/jeffrey-nz/browser-ai-bridge
- https://github.com/jrb00013/mailnotmilk
- Firecrawl / Jina / Stagehand public docs


## v4.1 additions (plan backlog)

| Feature | Source | Status |
|---|---|---|
| Vercel maxDuration 300 | Vercel Fluid | **Done** (`vercel.json`) |
| SSE heartbeat ~15s | MCP SSE best practice | **Done** |
| PersistStore Memory/File/Upstash | mailnotmilk + Upstash | **Done** (auto when env set) |
| Search Tavily/Jina/Wikipedia/DDG | Firecrawl/Jina/Tavily market | **Done** (cascade) |
| Jina s.jina.ai keyless | Jina | **Tried — blocked 401**; keyed path ready |
| Patchright engine option | stealth community | **Done** (`PLAYWRIGHT_ENGINE`) |
| Stealthish UA / webdriver patch | agent-browser | **Done** (`OBMC_STEALTHISH`) |
| Playwright trace ZIP | playwright-mcp | **Done** (`pw_trace_start/stop`) |
| Playwright recordVideo | playwright | **Done** (`OBMC_VIDEO` + `pw_video_status`) |
| render.yaml Blueprint | Render | **Done** |
| agent-desktop dual MCP docs | vercel-labs/agent-desktop | **Done** (docs/config; OS a11y N/A on cloud) |
| Lighthouse / full video pipeline | chrome-devtools | **Deferred** |

## Interactive challenges (v4.1.6)

| Feature | Status | Notes |
|---|---|---|
| `browser_drag` (built-in viewport) | Partial | Stepped synthetic pointer/mouse sequence in built-in pages; external proxy iframe forwarding is unsupported and fails closed in v4.1.7. Not real-site captcha bypass. |
| `pw_mouse_drag_xy` (Playwright) | ✅ | Real `page.mouse.down/move/up` with stepped moves. |
| Agent guidance | ✅ | Complete interactive challenges shown to the user (slider, simple puzzles); QR/app-login walls are reported to the user, never filled with invented data. No third-party solving services. |


## Observation reliability (v4.1.7 / obmc-challenge-detect-20261107)
| Feature | Status | Boundary |
|---|---|---|
| Navigation-bound observations | adopted | DOM, extraction and simulated screenshot metadata carry tabId/URL/navigationId; navigation/history/reload invalidate caches. Wrong iframe source or generation is ignored. |
| Challenge classifier | adopted | Current visible text + widget evidence, fixture tests for 1688 unusual traffic/feedback QR, Taobao login, AliExpress fetch error, empty/stale evidence. `ok` is not task completion. |
| Fail-closed execution | adopted | Disconnect, timeout and unsupported external iframe operations return failure; MCP isError propagates to agent. Navigation requires a current observation. |
| Final-answer gate | adopted | Explicit completion proposal + current quote + valid document + no latest tool failure; blocked/unknown observations cannot report completed. Semantic task correctness still needs real-site evaluation. |
| Real iframe pixels / Gemini image blocks | planned P1 | Canvas is simulated; Gemini uses text blocks only. |
| Chrome routing / login pause + Continue | planned P1 | Not implemented in this hotfix. No captcha-solving services or auth weakening. |
| Made-in-China.com fixtures | planned | Upcoming supplier search/lookup site; require live evidence before adding site-specific cases. |

## Made-in-China search (v4.1.8 / obmc-mic-search-20261107)

| Item | Status | Notes |
|---|---|---|
| Not-available page classification | Done | "information you are looking for is not available currently" → `empty_or_not_ready` / `blocked`; "Sign In / Join Free" chrome alone is not `login_wall`. |
| Agent search URL rules (`MIC_SEARCH_RULES`) | Done (prompt) | Good: `productdirectory.do?word=…&subaction=hunt`, `products-search/hot-china-products/{Title_Case}.html`. Bad (404): `multi-search/…+…/1.html`, `productdirectory.do` without `subaction=hunt`. Verified by direct HTTP, not by CI. |
| Listings render through Vercel proxy | Unverified | Not claimed; needs live test. |
