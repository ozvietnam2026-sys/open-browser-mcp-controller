# Kiến trúc Gemini 24/7 đa tài khoản + chuỗi dự phòng

Ngày 7/11/2026. Yêu cầu CEO: **tài khoản mặc định `gemini.wed@gmail.com` (Pro)**; giữ phiên đăng nhập 24/7 trên VPS; luôn thường trực nhận lệnh; giữ trạng thái đăng nhập các tài khoản; **đổi nhanh khi hết quota ngày**; có **chuỗi giải pháp dự phòng**.

## Nguyên tắc xếp lớp

1. **API là xương sống 24/7** — rẻ, ổn định, đo thực 1,2–2,2s (OBMC) / 1,45s (qua 9Router, flash-lite). UI browser chỉ dùng cho năng lực chỉ-UI-có (quota Pro app, Deep Research, Notebook).
2. **Mọi tầng đứng sau 9Router** (`192.168.1.125:20128`) — router tự fallback khi một tầng chết.
3. **VPS phải ngoài Việt Nam** — `generativelanguage.googleapis.com` bị chặn từ IP VN (đo thực: timeout hoàn toàn). Các VPS của team (vps-201/202) và Vercel đều đạt tiêu chuẩn.

## Lớp 1 — Chuỗi API đa key, tự xoay khi hết quota ✅ ĐÃ CÓ (v4.1.26)

- OBMC nhận **pool key** qua env: `GEMINI_API_KEYS="key1,key2,key3"` (hoặc `GEMINI_API_KEY` + `GEMINI_API_KEY_2..9`). Khi một key dính 429/quota → **tự nhảy key kế** trong cùng request, và nhớ key khỏe cho các request sau (`keySlot: "2/3"` trong response để giám sát). Cascade model vẫn chạy trong từng key.
- 9Router channel `obmc/`: `gemini-flash-lite-latest` (1,45s 🏆) · `gemini-3.5-flash` · `gemini-3.8-flash`. Bật **Round Robin** các connection nếu muốn chia tải nhiều key song song thay vì xoay khi lỗi.
- **Việc của anh/mina (2 phút):** lấy key API của các tài khoản Google của team (mỗi tài khoản một project GCP), dán vào Vercel env `GEMINI_API_KEYS` → Redeploy. Với N key, quota ngày nhân lên N lần — lớp này gần như không bao giờ cạn.

## Lớp 2 — Trình duyệt thường trực trên VPS (session Pro 24/7) 📋 CẦN DỰNG (có sẵn vật liệu)

Mục tiêu: phiên đăng nhập **app Gemini của `gemini.wed`** sống liên tục, nhận lệnh từ xa qua MCP của OBMC.

- **Vật liệu sẵn:** repo OBMC có `Dockerfile` + tool `pw_*` (Chromium thật, hỗ trợ Patchright) + live view sidecar (`docs/agent-desktop-sidecar.md`). Deploy Docker lên VPS ngoài VN (vps-201/202), **gắn volume** giữ `user-data-dir` Chromium (cookie/phiên) + `MAIL_PERSIST_PATH`.
- **Đăng nhập 1 lần:** mở live view/noVNC của OBMC trên VPS → đăng nhập `gemini.wed@gmail.com` (bấm "Duy trì đăng nhập") → từ đó phiên sống **tuần → tháng** nếu có hoạt động.
- **Giữ phiên (keep-alive):** cron trên VPS 15–30 phút/lần gọi MCP `browser_navigate` tới `https://gemini.google.com/u/2/app` — activity định kỳ làm mới cookie Google.
- **Nhận lệnh khi cần:** mọi agent trong team nối MCP OBMC của VPS (Bearer token như hiện tại) — `browser_*`/`pw_*` điều khiển đúng phiên Pro đó từ bất cứ đâu.
- **Nhiều tài khoản = nhiều profile:** mỗi tài khoản Google một user-data-dir riêng (`profile-gemini-wed`, `profile-ceo`,…) — đổi nhanh = đổi context bằng MCP, không cần đăng nhập lại.

## Lớp 3 — Hết quota ngày: chiến lược xoay từng tầng

| Tầng | Cơ chế | Trạng thái |
|---|---|---|
| API key pool | 429 → tự xoay key kế (sticky) | ✅ v4.1.26 |
| Model | cascade 3.5-flash → flash-lite → 3.8-flash | ✅ từ 4.1.22 |
| App Pro (UI) | hết quota → Google **tự hạ cấp model** (đã chứng kiến tối 7/11) + đổi tài khoản qua profile VPS | 📋 lớp 2 |
| 9Router | fallback kênh khác (Claude/GLM/DeepSeek đã nối trong router) | ✅ sẵn của 9Router |

## Lớp 4 — Rủi ro & dự phòng cuối

- **Google đòi xác minh lại** (IP đổi/đáng ngờ): giữ VPS một IP cố định; nếu bị — đăng nhập lại 1 lần qua live view (2FA của anh). Tần suất keep-alive thấp (15–30p) là đủ, không cần dồn dập.
- **Argon/flagship quá tải toàn cục** (đã gặp tối 7/11): tự hạ cấp — không phải lỗi của ta; việc của ta là tầng dưới (3.1 Pro / flash) vẫn sẵn.
- **OBMC Vercel chết** → 9Router trỏ channel sang OBMC bản VPS (lớp 2) hoặc kênh khác.
- **Mất hết Google** → 9Router fallback kênh khác (đã có).

## Ma trận quyết định cho anh

1. **Chọn VPS** cho lớp 2 (đề xuất: vps-201 hoặc vps-202 — đã có key 9Router kết nối, chắc ngoài VN; cần xác nhận egress).
2. **Dán key pool** vào Vercel `GEMINI_API_KEYS` (lớp 1 bật full công suất).
3. Anh/mina **deploy OBMC Docker lên VPS đó** + đăng nhập gemini.wed lần đầu qua live view.
4. Tuỳ chọn: cron keep-alive + thêm profile cho các tài khoản dự phòng.

## Số đo nền (đo thực 7/11/2026)

| Đường | Thời gian |
|---|---|
| 9Router → OBMC flash-lite | **1,45s** 🏆 |
| OBMC API trực tiếp | 1,2–2,2s |
| 9Router → OBMC 3.5-flash | 4,6s |
| Gemini UI Pro (3.1 Pro) | 4,65s |
| Gemini UI thường (Flash) | 5,8s |
