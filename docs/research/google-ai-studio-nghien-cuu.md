# Google AI Studio — khảo sát giao diện & tính năng (dùng nhiều)

Ngày 7/11/2026 (giờ Việt Nam). Khảo sát bằng cách **lái trực tiếp giao diện thật** (trình duyệt có phiên đăng nhập `ceo@ngantin.vn`), không chỉ đọc tài liệu. Mọi mục có dấu ✅ đều đã nhìn thấy/click thử trên giao diện sống; giá và tham số chép nguyên văn từ UI.

## Tại sao team cần tài liệu này

AI Studio là nơi **thiết kế prompt + cấu hình sinh sản** trước khi đưa vào sản phẩm. Chu trình khuyến nghị: chỉnh thử trên Playground → bấm **Get code** lấy cấu hình → gọi qua API token nội bộ của OBMC (`POST /api/prompt/run`, cùng Bearer token `/mcp`) — không cần mỗi người một quyền AI Studio.

## Bản đồ giao diện (✅ verified)

### Thanh điều hướng trái

| Mục | Ý nghĩa |
|---|---|
| **Playground** (`/prompts/new_chat`) | Trang chính: chat thử model, chỉnh cấu hình, sinh code |
| **History** (`/library`) | Thư viện prompt đã lưu |
| Build → **New app** / **My apps** / **Gallery** | Dựng app trên Gemini Developer Cloud |
| Manage → **Dashboard** (`/api-keys`) | Quản lý API key / usage |
| **Documentation** (`/docs`) | Docs tích hợp |
| Nút **Get API key**, **Search (⌘/)**, **Settings**, **What's new** | Tiện ích |

### Playground — khu vực soạn

- Ô prompt lớn ("Enter a prompt", placeholder gợi ý), đếm **token trực tiếp** (vd "34 tokens").
- Nút **Run** (⌘⏎) — chỉ bật khi có nội dung; nút **Insert images/videos/audio/files** để đính kèm đa phương tiện.
- Mỗi turn có **Edit** (sửa lại prompt) và **Rerun this turn** — tiện đo A/B cùng cấu hình.
- Thanh công cụ turn: **Share prompt**, **Compare** (so sánh cạnh nhau 2 cấu hình/model), **View more actions**.

### Run settings (panel phải) — ✅ mở từng mục

| Cài đặt UI | Kiểu | Ghi chú |
|---|---|---|
| Model | carousel + search, tab All/Featured/Gemini/Live/Images/Video/Audio/Music/Agents/Gemma | Mỗi model có nút Star, Copy tên, link docs + model card |
| **System instructions** | textarea | "Optional tone and style instructions" |
| **Thinking level** | combobox: Medium (mặc định) | Thay thế temperature của thế hệ cũ |
| Tools: **Structured outputs** (Edit JSON schema), **Code execution**, **Function calling** (Edit declarations) | switch | |
| **Grounding with Google Search** / **Grounding with Google Maps** | switch (Search mặc định **BẬT**) | Tắt khi đo tốc độ thuần |
| **URL context** | switch | Cho model đọc nội dung URL |
| Advanced: **Media resolution** (Default), **Safety settings** (Edit), **Stop sequences**, **Maximum output tokens** = **65536** | | ✅ đã mở, ghi nguyên văn |

### Get code (✅ mở, chép nguyên văn code sinh ra)

Ngôn ngữ chọn qua combobox (Python mặc định), kèm nút **Open in Colab**, **Download**, **API Docs**. Code mẫu cho cấu hình mặc định + thinking Medium:

```python
import os
from google import genai

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

generation_config = {
    'max_output_tokens': 65536,
    'thinking_level': 'medium',
}

interaction = client.interactions.create(
    model='models/gemini-3.8-flash',
    input="""INSERT_INPUT_HERE""",
    generation_config=generation_config,
)
print(interaction.output_text)
```

**Mapping UI → API** (bằng chứng trực tiếp từ Get code): Thinking level combobox → `thinking_level`; Maximum output tokens → `max_output_tokens`; model chọn → `models/<id>`; System instructions/tools cũng được sinh theo. Đây là cách chuẩn để lấy cấu hình đúng thay vì đoán tên tham số.

## Model & giá (✅ chép nguyên văn từ carousel)

| Model | Giá (đến hạn ghi trong UI) | Vị trí |
|---|---|---|
| **Gemini 4 Argon** (`gemini-4-argon`) — New, Paid | Input **$2.00** / Output **$10.00** (đến 30/11/2026) — "hardest problems" | Flagship, ra 13/10/2026 |
| **Gemini 3.8 Flash** (`gemini-3.8-flash`) — mặc định | Input **$0.75** / Output **$3.75** (đến 31/12/2026) | Flash thông minh nhất, ra 2/9/2026 |
| **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`) | Input $0.50 / Output $9.00 (Text→Audio) | TTS "Voice Design", ra 23/9/2026 |

Các tab khác: **Images / Video / Audio / Music / Agents / Gemma / Live** (chưa khai triển trong lần này). Nâng hạn mức + model Pro qua gói **"Unlock Gemini 4 Argon"**.

## Trạng thái tài khoản team & đường fix

Tài khoản `ceo@ngantin.vn` (Google Workspace `ngantin.vn`) hiện **bị chặn ở tầng Google Cloud/Workspace**, không phải lỗi app:

- Chạy prompt trả: `Permission denied. Please check your account permissions and project settings.`
- Bấm "No API key selected" → dialog **Link a paid API key** → **Import projects** → `Failed to list API keys: permission denied. Please try again.` (không liệt kê nổi key).

**Các bước khắc phục (ai quản lý Google Cloud/Workspace làm):**
1. Vào **Google Cloud Console** với tài khoản đó → tạo/chọn project → bật **Generative Language API** → tạo **API key**.
2. Nếu Workspace chặn: admin bật quyền dùng AI Studio / Gemini cho organizational unit đó.
3. Xong quay lại AI Studio → nút key → **Import projects** chọn project/key. Google có thể yêu cầu bật billing cho hạn mức trả phí (giá ở bảng trên).
4. Đến khi đó, **API nội bộ của OBMC vẫn chạy bình thường** (dùng key server riêng): `POST /api/prompt/run` — đo thực 3 lượt: **1.231 / 1.705 / 2.115 giây** phía server (~1.8–2.7s trọn vòng), cascade tự nhảy `gemini-3.5-flash → gemini-flash-lite-latest` khi rate-limit; sai token → 401.

Lưu ý kỹ thuật: SPA của Google **không render qua Vercel proxy** của OBMC (XHR cần phiên đăng nhập) — tự động hóa giao diện Google phải dùng trình duyệt thật có phiên, hoặc đi đường API.

## Workflow khuyến nghị cho team

1. **Thiết kế trên Playground**: chọn model → chỉnh Thinking level/Tools/System instructions → chạy thử, Edit/Rerun để so.
2. **Get code** → copy `generation_config` đúng人意.
3. **Gọi qua token OBMC** (không phụ thuộc quyền AI Studio cá nhân). Từ **v4.1.24**, API nhận đúng tham số Get code (cả snake_case lẫn camelCase):
   ```bash
   curl -X POST https://open-browser-mcp-controller-ten.vercel.app/api/prompt/run \
     -H "Authorization: Bearer <mcp-auth.token>" -H "Content-Type: application/json" \
     -d '{"prompt": "...", "model": "gemini-3.8-flash",
          "thinking_level": "medium", "max_output_tokens": 65536,
          "system_instructions": "Luôn trả lời tiếng Việt."}'
   ```
   Response echo lại cấu hình hiệu dụng: `{model, text, timingMs, config}`.

   **Số đo thực (v4.1.24, 7/11/2026) — chí phí của thinking_level:**

   | Cấu hình | timingMs | Ghi chú |
   |---|---|---|
   | `thinking_level: minimal` + system_instructions | **2.234ms** | trả "Hà Nội." đúng chỉ dẫn ngắn gọn |
   | `thinking_level: high` | **18.660ms** | cùng câu hỏi — chậm **8.4×** |
   | không tham số (mặc định) | 1.231–2.115ms | cascade tự chọn model |

   Khuyến nghị: `minimal`/`low` cho tác vụ trích xuất ngắn; `high` chỉ khi cần lập luận — và luôn đặt `max_output_tokens` hợp lý.

## Phụ lục: buổi khảo sát tài khoản Pro (tối 7/11/2026, verified live)

Tài khoản `gemini.wed@gmail.com` — **có gói Pro thật** (badge "Pro" cạnh avatar; nút "Unlock Gemini 4 Argon" biến mất = model cao cấp mở trong UI). Có 2 project GCP sẵn (Free tier): `n8n-app`, `make`.

### Tạo API key: chỉ bàn tay người làm được

- Click tự động (CDP) vào "Create API key" đều bị **"Failed to generate API key, The request is suspicious"** — anti-abuse của Google phân biệt click tự động. Key `obmc-team` (project `make`) được tạo **bằng tay** và hoạt động tốt.
- Lưu key tại `~/Downloads/obmc-mcp/gemini-pro.key` (chmod 600, không commit).

### Khám phá quan trọng nhất: Pro UI ≠ Pro API

- Key của tài khoản Pro thấy **50 model** qua `GET /v1beta/models`, gồm: `gemini-4-argon`, `gemini-3.8-flash` (±tts/lite), `gemini-3.5-*`, `gemini-3.1-*`, `gemini-2.5-*`, `gemini-omni-*`, `nano-banana-pro-preview`, `gemini-nano-banana-2.1`, `lyria-3.5` (nhạc), `gemma-4-*`, `gemini-2.5-computer-use-preview`, `deep-research-*`, `antigravity-preview-*`, embedding…
- NHƯNG gọi `gemini-4-argon:generateContent` bằng key đó → **429 quota ngay lập tức**: quota API tính theo **billing tier của PROJECT** (Free tier = không có Argon), gói Pro subscriber chỉ mở model trong **giao diện AI Studio**. Muốn Argon qua API phải bật billing cho project.

### Mạng: API Google bị chặn từ IP Việt Nam

- Từ máy VN: `generativelanguage.googleapis.com` **time out hoàn toàn** (60s, http 000) — mọi gọi API từ máy nội bộ phải đi qua egress nước ngoài.
- Qua **page-proxy của OBMC** (Vercel): GET models ~0,4s OK; **POST generateContent ổn định ~57–64s** (chậm có hệ thống, không phải cold-start) — page-proxy chỉ dành cho trang web, không dùng để gọi API.
- **Đường đúng cho API: server-side SDK** — chính là kiến trúc `/api/prompt/run` của OBMC (1,2–2,2s).

### Lỗi còn hở (đã ghi nhận)

- Tích hợp list-key của AI Studio với tài khoản này bị chặn ("Failed to list API keys: permission denied"; dialog link-key kẹt loading) — cần thao tác tay lần đầu trên máy thật để link key vào Playground.
- Bảng so sánh quyết định cho team:

| Nhu cầu | Dùng gì |
|---|---|
| Team gọi prompt API hàng ngày | `POST /api/prompt/run` OBMC (key server hiện tại, 1,2–2,2s) — KHÔNG đổi sang key Pro (không lợi quota) |
| Thiết kế prompt, thử model mạnh trên UI | AI Studio tài khoản Pro (Argon mở sẵn) |
| Argon/Pro-model qua API | Phải bật billing cho project GCP rồi tạo key trả phí — quyết định của CEO |

## Phụ lục 2: cổng QA đấu vào 9Router (tối 7/11/2026 — ĐÃ CHẠY THẬT)

Channel **obmc-gateway** đã tạo trên 9Router của team (`192.168.1.125:20128`, dashboard `/dashboard`):

- Loại: Custom OpenAI Compatible · Chat Completions · Base URL `https://open-browser-mcp-controller-ten.vercel.app/v1`
- Connection `obmc-team` (key = MCP token của OBMC), Check = **Valid**
- Model có sẵn qua prefix `obmc/`: `obmc/gemini-3.5-flash`, `obmc/gemini-3.8-flash`
- Cách agent khác gọi: `POST http://192.168.1.125:20128/v1/chat/completions` + Bearer key 9Router (vd key `obmc-chain-test`) + model `obmc/gemini-3.5-flash`
- **Bằng chứng vòng dây** (đo 7/11): câu hỏi test → trả lời 4,6s trọn vòng (LAN→Vercel→Gemini), response id `chatcmpl-qa-mw6b6f3g-aqqol`, và bản ghi `qa-mw6b6f3g-aqqol` nằm trong kho QA của OBMC với `source: openai-compat` — tức mọi lượt hỏi qua 9Router đều **tự lưu** về OBMC để tra lại bằng `/api/qa/:id`.

## Nguồn

- Giao diện sống `aistudio.google.com` phiên `ceo@ngantin.vn`, 7/11/2026 (mọi mục ✅).
- Link từ UI: [pricing](https://aistudio.google.com/docs/pricing#gemini-4-argon) · [model card 3.8 Flash](https://deepmind.google/models/model-cards/gemini-3-8-flash/) · [interactions API docs](https://aistudio.google.com/docs/interactions-overview).
