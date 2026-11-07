# Tính năng có thể tích hợp — Open Browser MCP Controller

Báo cáo nghiên cứu ngày 7/11/2026 (giờ Việt Nam). Đã kiểm nguồn cùng ngày.

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

Browserbase, Firecrawl interact, OpenAI Operator, Claude in Chrome: lần nghiên cứu này chưa đọc lại tài liệu nên không đưa vào bảng.

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

- Hạn mức miễn phí của Gemini Computer Use và structured output trên các model flash.
- Render free có đủ RAM cho Chrome headful + live view không; có nơi miễn phí khác không.
- Cách mã hoá và lưu `storageState` ngoài đĩa tạm của Render.
- Đọc lại Browserbase, Firecrawl interact, Operator, Claude in Chrome.
- Vòng xác minh email/OTP cho tài khoản của chính người dùng bằng hộp thư họ sở hữu.

## Nguồn

- [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)
- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright codegen](https://playwright.dev/docs/codegen)
- [Playwright Network](https://playwright.dev/docs/network)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [agent-browser](https://github.com/vercel-labs/agent-browser)
- [Skyvern](https://github.com/Skyvern-AI/skyvern)
- [Steel Browser](https://github.com/steel-dev/steel-browser)
- [kernel-images](https://github.com/kernel/kernel-images)
- [Crawl4AI no-LLM extraction](https://docs.crawl4ai.com/extraction/no-llm-strategies/)
- [OmniParser](https://github.com/microsoft/OmniParser)
- [browser-use](https://github.com/browser-use/browser-use)
- [Gemini Computer Use](https://ai.google.dev/gemini-api/docs/computer-use)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [MCP elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)
- [Claude computer use tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool)
