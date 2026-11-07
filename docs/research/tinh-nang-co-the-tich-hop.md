# Tính năng có thể tích hợp — Open Browser MCP Controller

Báo cáo nghiên cứu ngày 7/11/2026 (giờ Việt Nam). Đã kiểm nguồn cùng ngày. Bản này gồm cả phần tut và mẹo bổ sung cùng ngày.

Bản sống (Page): [Tính năng có thể tích hợp — Open Browser MCP Controller](https://cursor.com/canvas/store-c2b50c6f-d718-4a34-814d-b9e30113df17/6f67aab4-252c-49b2-9fb0-8fb8a2247096)

Các khả năng có thật mà dự án có thể đưa vào, cho biết mỗi cái gắn vào phần nào của kiến trúc, tốn công bao nhiêu, và làm được bằng thư viện mở / gói miễn phí hay không.

Báo cáo này nối tiếp nghiên cứu thị trường và kế hoạch xử lý lỗi/challenge, không thay thế chúng. Phần triển khai code do zcode. Không ghi số sao GitHub vì công cụ đọc không lấy được số đó một cách tin cậy.

Một số tool Playwright MCP (`pw_snapshot`, `pw_storage_state`, …) đã được liệt kê là adopted trong [`docs/FEATURE_MATRIX.md`](../FEATURE_MATRIX.md). Báo cáo này nói về việc đưa các khả năng đó vào agent trong app, luồng Render Chrome, và bài toán tìm nguồn hàng — không phải khẳng định repo chưa có tool tương ứng.

Không khuyến nghị API giải captcha, proxy dân cư, hay kết nối bản MCP cũ chưa khoá.

## Ứng viên chính

| Tính năng | Là gì / nguồn | Gắn vào OBMC | Công | Rủi ro | Trạng thái |
|---|---|---|---|---|---|
| Snapshot ARIA có ref | Playwright `page.ariaSnapshot()` trả cây accessibility dạng YAML; agent-browser gắn ref `@e1` cho từng phần tử, click thất bại khi phần tử bị che. [playwright.dev/docs/aria-snapshots](https://playwright.dev/docs/aria-snapshots) | Tool MCP mới trên đường Playwright/Render; chế độ rút gọn cho Vercel proxy (dựng từ DOM) | Nhỏ–vừa | Ref hết hạn sau khi điều hướng, phải chụp lại; trang Trung Quốc ít ARIA nên cần kèm innerText | Mới |
| Ảnh thật vào model | Gemini có Computer Use tool ([docs](https://ai.google.dev/gemini-api/docs/computer-use)); Playwright MCP có `--caps vision`; Claude có computer use tool | Ngừng bỏ khối ảnh MCP trong agent Gemini; chụp ảnh thật chỉ có được trên Render Chrome | Vừa | Ảnh tốn token; hạn mức Gemini miễn phí cho Computer Use chưa kiểm được | Mới (hiện là ảnh canvas giả) |
| Set-of-Mark / nhãn số trên ảnh | OmniParser (Microsoft, MIT cho phần lớn weight) dò icon/phần tử trên ảnh màn hình | Đơn giản hơn: tự vẽ số lên các phần tử từ toạ độ DOM trên Render, không cần OmniParser | Vừa | OmniParser cần GPU và có weight cũ AGPL; không hợp với gói miễn phí | Mới |
| Phiên đăng nhập lưu bền | Playwright `storageState` lưu cookie, localStorage, IndexedDB; tài liệu cảnh báo file này có thể dùng để mạo danh. [playwright.dev/docs/auth](https://playwright.dev/docs/auth) | Render Chrome: mỗi hồ sơ một context, chỉ trả cho model id + host + thời điểm, không trả cookie | Vừa | Render free có đĩa tạm, ngủ khi rảnh nên mất phiên nếu không mã hoá và lưu chỗ khác | Mới |
| Đăng nhập bằng tay rồi lưu | `npx playwright codegen --save-storage=auth.json` lưu trạng thái sau khi người dùng tự đăng nhập | Luồng: người dùng tự quét QR Taobao/1688 trên live view, hệ thống lưu phiên | Vừa | Phiên hết hạn; vẫn phải là người thật đăng nhập | Mới |
| Live view + Continue | kernel-images có live view WebRTC đọc/ghi (có chế độ chỉ đọc) và quay video phiên; Steel có UI xem phiên; browser-use Cloud có live view (trả phí) | Render Chrome: nút Tạm dừng / Tiếp tục khi gặp login, QR, captcha khó | Vừa–lớn | Cần stream màn hình; Render free có thể không đủ RAM | Mới (đang ghi là thiếu human_required) |
| MCP elicitation | Server gửi `elicitation/create` để hỏi người dùng giữa chừng (spec MCP 2025-06-18) | Dùng cho trạng thái human_required khi client MCP ngoài hỗ trợ | Nhỏ | Không phải client nào cũng hỗ trợ; không dùng để hỏi mật khẩu | Mới |
| Trích xuất theo schema | Gemini structured output (JSON schema); Skyvern `page.extract(prompt, schema)`; Crawl4AI `JsonCssExtractionStrategy` không cần LLM | Tool `extract_listings` trả title, price_text, moq_text, supplier, url, kèm đoạn chữ gốc làm bằng chứng | Vừa | Phải từ chối khi trường không có trên trang; không suy giá | Một phần (đã có PRICE_GROUNDING_RULES) |
| Playbook theo site | agent-browser có lệnh `skills`; Skyvern có `run_workflow`; Playwright codegen ghi lại thao tác | File playbook theo host (URL tìm kiếm đúng, dấu hiệu trang rỗng/chặn) nạp vào luật Gemini | Nhỏ–vừa | Site đổi giao diện thì playbook cũ sai, cần ngày kiểm | Một phần (luật MIC 4.1.8, kho skill Grok Bot) |
| Nhiều tab / so sánh N nhà cung cấp | Playwright context độc lập; agent-browser `--session` riêng mỗi browser; `batch` | Hàng đợi việc trên Render, mỗi việc một context, kết quả gộp vào bảng | Vừa | Mở nhiều trang cùng lúc dễ bị chặn traffic; giới hạn RAM free | Mới |
| Bắt request/response | Playwright network: `route`, ghi HAR ([playwright.dev/docs/network](https://playwright.dev/docs/network)) | Đọc JSON mà trang tự tải (danh sách sản phẩm) thay vì đoán từ DOM; tải PDF/file | Vừa | Chỉ đọc dữ liệu trang đã gửi cho chính phiên đó; không gọi API nội bộ để vượt chặn | Mới (đã có Lighthouse) |
| Bộ trang kiểm thử thật | So khớp ARIA snapshot (`toMatchAriaSnapshot`) và lưu bản trang mẫu | Lưu trang MIC “not available”, 1688 unusual traffic, listing thật làm test cho bộ phân loại | Nhỏ | Không lưu dữ liệu cá nhân trong mẫu | Một phần (79 test) |

## So sánh các browser agent mở

| Dự án | Điểm đáng học | Chi phí |
|---|---|---|
| [agent-browser (vercel-labs)](https://github.com/vercel-labs/agent-browser) | CLI Rust, snapshot có ref, phiên/hồ sơ, record, diff, có `agent-browser mcp`; Apache-2.0 | Miễn phí tự chạy |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Dựa trên cấu trúc, không cần vision; `--caps vision,pdf,devtools`; nhóm Microsoft khuyên CLI+skills cho coding agent vì tốn ít token | Miễn phí |
| [Skyvern](https://github.com/Skyvern-AI/skyvern) | Vision LLM + Playwright, `extract` theo schema, workflow builder | Mã nguồn mở; bản Cloud có captcha solver và proxy (không dùng) |
| [Steel Browser](https://github.com/steel-dev/steel-browser) | Browser API tự host bằng Docker, quản lý phiên, UI debug, request log | Tự host miễn phí; có cloud trả phí |
| [kernel-images](https://github.com/kernel/kernel-images) | Chromium headful, live view WebRTC, quay video, snapshot trạng thái khi standby | Tự host; nặng cho Render free |
| [Crawl4AI](https://docs.crawl4ai.com/extraction/no-llm-strategies/) | Trích xuất CSS/XPath không cần LLM; Apache-2.0; cloud có 1.000 credit/tháng miễn phí theo README | Miễn phí tự host |
| [browser-use](https://github.com/browser-use/browser-use) | Agent Python/TS; cloud có live view, hồ sơ, recordings | Cloud trả phí và quảng cáo stealth/captcha — chỉ học phần mở |

Browserbase, Firecrawl interact, OpenAI Operator và Claude in Chrome không nằm trong bảng so sánh lần đầu; một số mẹo lấy từ tài liệu Browserbase, Firecrawl interact và Claude computer use được ghi ở phần tut bên dưới. Trang OpenAI Computer Use lần này chỉ tải được menu, không đọc được nội dung.

## Tut và mẹo từ nhiều nguồn

Mỗi dòng dưới đây lấy từ tài liệu đã tải về ngày 7/11/2026. Cột “Gắn vào” ghi rõ phần nào của OBMC: Vercel proxy, Render Chrome, luật agent Gemini, hay tool MCP mới. Tất cả đều làm được bằng công cụ mở, miễn phí, trừ dòng nào có ghi chú khác.

### Đọc trang và trích xuất

| Mẹo | Làm cụ thể | Gắn vào | Lưu ý |
|---|---|---|---|
| Snapshot gọn có ref | agent-browser `snapshot -i` chỉ lấy phần tử tương tác; `-c` bỏ nhánh rỗng; `-d` giới hạn độ sâu; `-s` giới hạn trong một selector; `-u` kèm href. Nguồn: [agent-browser.dev/snapshots](https://agent-browser.dev/snapshots) | Tool MCP mới, chạy được trên Render Chrome; trên Vercel proxy dựng bản rút gọn từ DOM | Ref chỉ đúng tới lần điều hướng hoặc DOM đổi tiếp theo |
| Diff snapshot sau mỗi thao tác | `agent-browser diff snapshot` so với snapshot trước, in dòng +/-; `--baseline file` so với bản đã lưu. Nguồn: [agent-browser.dev/diffing](https://agent-browser.dev/diffing) | Trả cho Gemini phần đã thay đổi thay vì cả trang, giúp biết click có tác dụng không | Trang động (giá đổi, quảng cáo) tạo nhiễu |
| Click phải thất bại thật | README agent-browser: click báo lỗi khi phần tử ẩn, disabled, ngoài viewport hoặc bị banner che, rồi chụp snapshot lại và thử lại | Luật fail-closed cho `browser_click`, khớp với hướng 4.1.7 | Không áp dụng được đầy đủ trên iframe proxy |
| Locator theo vai trò | Playwright khuyên ưu tiên `getByRole(role, {name})`, `getByLabel`, `getByText` thay cho CSS dễ gãy. Nguồn: [playwright.dev/docs/locators](https://playwright.dev/docs/locators) | Tool click/fill nhận role+name, không chỉ CSS | Trang Taobao/1688 ít nhãn ARIA, vẫn cần text làm dự phòng |
| observe trước rồi mới act | Stagehand `observe()` trả danh sách hành động có cấu trúc để kiểm trước khi làm và có thể cache lại. Nguồn: [docs.stagehand.dev/v3/basics/observe](https://docs.stagehand.dev/v3/basics/observe) | Bước lập kế hoạch trong luật Gemini; cache theo host + URL | Cache phải bị xoá khi trang đổi giao diện |
| Trích xuất không cần LLM | Crawl4AI `JsonCssExtractionStrategy`: một `baseSelector` cho mỗi ô listing, mảng `fields` (text/attribute), `baseFields` lấy thuộc tính của chính ô; có bản XPath. Nguồn: [docs.crawl4ai.com/extraction/no-llm-strategies](https://docs.crawl4ai.com/extraction/no-llm-strategies/) | Lưu schema selector trong playbook từng host (ví dụ ô kết quả MIC), chạy được cả trên HTML mà Vercel proxy đã tải | Selector gãy khi site đổi class, cần test hồi quy |
| Schema JSON cho Gemini | Gemini structured output hỗ trợ `enum` và `anyOf`; dùng `anyOf` để tách ca “có listing” và ca “trang rỗng/bị chặn”. Nguồn: [ai.google.dev/gemini-api/docs/structured-output](https://ai.google.dev/gemini-api/docs/structured-output) | Tool `extract_listings`; trường giá/MOQ là chuỗi gốc, kèm `page_state` dạng enum | Model vẫn có thể điền sai, nên đối chiếu chuỗi với text trang |
| extract chỉ bằng prompt | Stagehand `extract()` nhận schema Zod/JSON, hoặc chỉ prompt, hoặc không tham số. Nguồn: [docs.stagehand.dev/v3/basics/extract](https://docs.stagehand.dev/v3/basics/extract) | Tham khảo thiết kế API cho tool OBMC | Không có schema thì khó kiểm chống bịa giá |

### Mạng, tải file, trace

| Mẹo | Làm cụ thể | Gắn vào | Lưu ý |
|---|---|---|---|
| Đợi đúng response | Tạo `page.waitForResponse(glob \| RegExp \| predicate)` trước khi click (không await ngay), rồi `await` sau. Nguồn: [playwright.dev/docs/network](https://playwright.dev/docs/network) | Render Chrome: lấy JSON danh sách mà chính trang vừa tải trong phiên | Chỉ đọc dữ liệu trang đã nhận; không gọi lại API nội bộ để né chặn |
| Ghi và phát lại HAR | `recordHar` khi tạo context, hoặc `routeFromHAR(path, {url, update: true})` để ghi rồi `update: false` để phát lại. Nguồn: [playwright.dev/docs/mock](https://playwright.dev/docs/mock) | Lưu phiên thật làm fixture test, chạy lại offline | HAR có thể chứa cookie, phải lọc trước khi lưu vào repo |
| Tải file | Bắt `page.waitForEvent('download')` trước click, rồi `download.saveAs(dir + download.suggestedFilename())`. Nguồn: [playwright.dev/docs/downloads](https://playwright.dev/docs/downloads) | Tool `browser_download` trên Render, trả tên + kích thước, không trả nội dung thô | Đĩa Render free mất khi ngủ |
| Mạng và trace kiểu DevTools | chrome-devtools-mcp có `list_network_requests`, `get_network_request`, `performance_start_trace`, `emulate`, `wait_for`, `lighthouse_audit`; cờ `--isolated`, `--headless`, `--slim` (bộ tool rút gọn). Nguồn: [github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Học tên và hình dạng tool cho đường Render; OBMC đã có Lighthouse | Chưa đọc hết tham số từng tool |
| Trace viewer | Bật trace (ví dụ chỉ khi retry) để xem lại từng bước. Nguồn: [playwright.dev/docs/trace-viewer-intro](https://playwright.dev/docs/trace-viewer-intro) | Lưu trace cho lần chạy lỗi trên Render để zcode gỡ | File lớn, chỉ giữ khi lỗi |

### Phiên đăng nhập và người can thiệp

| Mẹo | Làm cụ thể | Gắn vào | Lưu ý |
|---|---|---|---|
| storageState đủ thứ | `storageState()` gồm cookie, localStorage, IndexedDB, origin private file system và WebAuthn ảo; `setStorageState()` xoá trạng thái cũ rồi đặt mới. sessionStorage không được lưu, phải tự chép bằng `addInitScript`. Nguồn: [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext), [Authentication](https://playwright.dev/docs/auth) | Render Chrome; model chỉ thấy id hồ sơ | Tài liệu cảnh báo file có thể dùng để mạo danh; không commit, phải xoá khi hết hạn |
| Lưu cả user-data-dir | Kernel Profiles và Browserbase Contexts đều lưu thư mục user data của Chromium (cookie, site data, tab); Kernel ghi mã hoá đầu-cuối theo khoá tổ chức. Nguồn: [kernel.sh/docs/browsers/profiles](https://www.kernel.sh/docs/browsers/profiles), [Browserbase contexts](https://docs.browserbase.com/platform/browser/core-features/contexts) | Mẫu khái niệm: nén thư mục profile, mã hoá bằng khoá riêng, lưu ngoài Render, giải nén khi khởi động | Cả hai là dịch vụ trả phí; không có công thức chính thức cho Render, đây là suy luận từ mẫu của họ |
| Tách phiên rõ ràng | agent-browser `--session name` mỗi phiên một daemon và một browser; `--profile`, `--state` khởi chạy lại browser; khi gắn qua `--cdp` các cờ nhạy cảm bị bỏ; file trạng thái đọc được bởi user khác thì daemon từ chối chạy. Nguồn: [agent-browser.dev/sessions](https://agent-browser.dev/sessions) | Mỗi host/hồ sơ một context trên Render, kiểm quyền file | Chỉ là mẫu; cần tự viết lại |
| Link live view có chế độ chỉ đọc | Kernel trả `browser_live_view_url`, thêm `?readOnly=true` để chỉ xem; kernel-images bật bằng `ENABLE_READONLY_VIEW=true`. Nguồn: [Kernel live view](https://www.kernel.sh/docs/browsers/live-view), [kernel-images](https://github.com/kernel/kernel-images) | Nút để người dùng tự làm mở live view đọc/ghi; lúc agent chạy thì chỉ đọc | kernel-images tự host được nhưng nặng cho Render free |
| Live view để người can thiệp | Browserbase liệt kê human-in-the-loop là một công dụng; mỗi tab có `debuggerFullscreenUrl` riêng. Nguồn: [Browserbase session live view](https://docs.browserbase.com/platform/browser/observability/session-live-view) | Mẫu cho trạng thái `human_required`: đưa link tab đang bị chặn | Dịch vụ trả phí; chỉ học mẫu |
| Phiên có hạn giờ | Steel: phiên sống 5 phút mặc định, đặt `timeout` theo ms, hết giờ thì tự release. Nguồn: [Steel session lifecycle](https://docs.steel.dev/overview/sessions-api/session-lifecycle) | Render Chrome: tự đóng context khi người dùng không bấm Tiếp tục | Steel Browser tự host được |
| Hỏi người dùng qua MCP | Server gửi `elicitation/create` với schema đơn giản; người dùng trả `accept`, `decline` hoặc `cancel`. Spec ghi server MUST NOT dùng nó để hỏi thông tin nhạy cảm. Nguồn: [MCP elicitation 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation) | Câu hỏi “Anh đã quét QR xong chưa?” cho client MCP ngoài | Không hỏi mật khẩu/OTP qua kênh này |
| Tương tác sau khi scrape | Firecrawl interact tiếp tục phiên từ `scrapeId` bằng prompt hoặc code Playwright, dùng để phân trang. Nguồn: [docs.firecrawl.dev/features/interact](https://docs.firecrawl.dev/features/interact) | Mẫu: Vercel proxy đọc nhanh, chỉ chuyển sang Render khi cần thao tác | Firecrawl cloud có giới hạn gói; chưa kiểm giá |

### Vision và computer use

| Mẹo | Làm cụ thể | Gắn vào | Lưu ý |
|---|---|---|---|
| Gemini Computer Use | Model trả toạ độ chuẩn hoá 0–1000, app phải đổi ra pixel (`x/1000*width`); có `safety_decision` có thể là `require_confirmation`. Trang liệt kê model `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3-flash-preview`; có bản tham khảo [github.com/google/computer-use-preview](https://github.com/google/computer-use-preview). Nguồn: [Gemini Computer Use](https://ai.google.dev/gemini-api/docs/computer-use) | Chỉ trên Render Chrome có ảnh thật; `require_confirmation` nối vào nút Tiếp tục | Hạn mức miễn phí cho tool này chưa thấy ghi rõ |
| Claude computer use | Bộ tool có `screenshot`, `left_click`, `type`, `zoom`; chỉ screenshot và zoom cần trả ảnh, còn lại trả “OK”; có bộ phân loại quét ảnh tìm prompt injection. Nguồn: [Claude computer-use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) | Mẫu: trả ảnh chỉ khi cần, giảm token; coi chữ trên trang là dữ liệu không tin cậy | API trả phí; chỉ học mẫu |
| Vision là tuỳ chọn | Playwright MCP mặc định không cần vision; bật thêm bằng `--caps vision,pdf,devtools`. Nhóm Playwright khuyên CLI+skills cho coding agent vì tiết kiệm token. Nguồn: [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | Giữ snapshot là đường chính, ảnh chỉ khi snapshot không đủ (slider, canvas) | Không có |

Trang OpenAI Computer Use tải về chỉ ra menu, lần này không đọc được nội dung nên không đưa vào.

### Test hồi quy bằng trang thật

1. **Lưu trang mẫu.** Lưu HTML hoặc HAR đã lọc cookie của: MIC “not available”, 1688 unusual traffic, MIC hunt có listing, `/multi-search/` gạch nối bị 404.
2. **So cây ARIA.** Dùng `toMatchAriaSnapshot` với khớp một phần và regex (ví dụ số sản phẩm) để test không gãy khi số đổi. Nguồn: [ARIA snapshots](https://playwright.dev/docs/aria-snapshots).
3. **So ảnh khi cần.** `toHaveScreenshot()` tạo ảnh tham chiếu lần đầu, lần sau so khác biệt. Nguồn: [Visual comparisons](https://playwright.dev/docs/test-snapshots).
4. **Khẳng định nhãn.** Mỗi trang mẫu phải ra đúng nhãn của bộ phân loại (`ok`, `empty`, `challenge`, `not_available`); chạy cùng các test hiện có.

## Đáng tích hợp trước (cho zcode)

1. Sửa nốt luật `/multi-search/` của MIC và đưa luật URL thành playbook theo host — một phần đã có.
2. Tool snapshot ARIA/DOM có ref thay cho innerText thuần — mới, công nhỏ–vừa.
3. Tool `extract_listings` theo JSON schema, mỗi trường kèm chữ gốc, thiếu thì để trống — một phần (đã có luật chống bịa giá).
4. Bộ trang mẫu thật làm test hồi quy cho bộ phân loại challenge/trang rỗng — một phần.
5. Chuyển agent trong app sang Render Chrome khi cần trang động, giữ Vercel proxy cho đọc nhanh — mới.
6. Trạng thái `human_required` + nút Tiếp tục, cộng MCP elicitation cho client ngoài — mới.
7. Hồ sơ đăng nhập riêng theo host bằng `storageState`, người dùng tự đăng nhập, model chỉ thấy siêu dữ liệu — mới.
8. Ảnh chụp thật từ Render gửi cho Gemini (không bỏ khối ảnh nữa) — mới, làm sau khi bước 5 chạy.

Cả tám việc đều làm được bằng thư viện mở và gói miễn phí, không cần API giải captcha hay proxy dân cư.

## Việc nghiên cứu tiếp

- Hạn mức miễn phí của Gemini Computer Use (trang tài liệu không ghi).
- URL tìm kiếm công khai của Taobao, 1688, JD, AliExpress: lần này chưa tìm được tài liệu chính thức nên chưa đưa vào playbook.
- Tài liệu Browserless hybrid automation (đường dẫn thử trả 404) và OpenAI Computer Use (không đọc được nội dung).
- Chi tiết recipe workflow của Skyvern; trang docs chỉ đọc được phần giới thiệu.
- Render free có đủ RAM cho Chrome headful + live view không; có nơi miễn phí khác không.
- Cách mã hoá và lưu `storageState` ngoài đĩa tạm của Render.
- Đọc lại Browserbase, Firecrawl interact, Operator, Claude in Chrome.
- Vòng xác minh email/OTP cho tài khoản của chính người dùng bằng hộp thư họ sở hữu.
- Chưa đọc hết tham số từng tool của chrome-devtools-mcp.
- Giá các bản cloud trả phí chưa kiểm.

## Nguồn

- [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)
- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright codegen](https://playwright.dev/docs/codegen)
- [Playwright Network](https://playwright.dev/docs/network)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Playwright locators](https://playwright.dev/docs/locators)
- [Playwright mock / HAR](https://playwright.dev/docs/mock)
- [Playwright downloads](https://playwright.dev/docs/downloads)
- [Playwright trace viewer](https://playwright.dev/docs/trace-viewer-intro)
- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright BrowserContext API](https://playwright.dev/docs/api/class-browsercontext)
- [agent-browser](https://github.com/vercel-labs/agent-browser)
- [agent-browser snapshots](https://agent-browser.dev/snapshots)
- [agent-browser sessions](https://agent-browser.dev/sessions)
- [agent-browser diffing](https://agent-browser.dev/diffing)
- [Skyvern](https://github.com/Skyvern-AI/skyvern)
- [Steel Browser](https://github.com/steel-dev/steel-browser)
- [Steel session lifecycle](https://docs.steel.dev/overview/sessions-api/session-lifecycle)
- [kernel-images](https://github.com/kernel/kernel-images)
- [Kernel live view](https://www.kernel.sh/docs/browsers/live-view)
- [Kernel profiles](https://www.kernel.sh/docs/browsers/profiles)
- [Crawl4AI no-LLM extraction](https://docs.crawl4ai.com/extraction/no-llm-strategies/)
- [OmniParser](https://github.com/microsoft/OmniParser)
- [browser-use](https://github.com/browser-use/browser-use)
- [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Stagehand observe](https://docs.stagehand.dev/v3/basics/observe)
- [Stagehand extract](https://docs.stagehand.dev/v3/basics/extract)
- [Browserbase contexts](https://docs.browserbase.com/platform/browser/core-features/contexts)
- [Browserbase live view](https://docs.browserbase.com/platform/browser/observability/session-live-view)
- [Firecrawl interact](https://docs.firecrawl.dev/features/interact)
- [Gemini Computer Use](https://ai.google.dev/gemini-api/docs/computer-use)
- [Gemini computer use reference impl](https://github.com/google/computer-use-preview)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [MCP elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)
- [Claude computer use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
