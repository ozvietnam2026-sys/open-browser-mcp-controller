# RUNBOOK — dựng OBMC 24/7 trên vps-201 (phiên Pro gemini.wed)

Tổng thời gian ~15 phút (chậm nhất là docker build lần đầu ~5-8 phút).

## 0. Điều kiện

- Docker + docker compose trên vps-201 (`curl -fsSL https://get.docker.com | sh` nếu chưa có).
- **Egress ngoài Việt Nam** — kiểm tra: `curl -s https://ipinfo.io` → `country` phải ≠ VN (Google chặn `generativelanguage.googleapis.com` từ IP VN). Nếu VPS ở VN → báo CEO đổi VPS.
- Mở firewall cổng 3000 (chỉ cần cho bước đăng nhập lần đầu; sau đó có thể đóng và dùng SSH tunnel).

## 1. Deploy

```bash
ssh root@<VPS-201-IP>
git clone https://github.com/ozvietnam2026-sys/open-browser-mcp-controller.git /opt/obmc
cd /opt/obmc/deploy/vps-201
cp .env.example .env
# dán MCP_AUTH_TOKEN (dùng chung token team trong ~/Downloads/obmc-mcp/mcp-auth.token)
nano .env
docker compose up -d --build
curl -s http://127.0.0.1:3000/ | head -c 200        # thấy HTML app = sống
cp /opt/obmc/deploy/vps-201/keep-alive.sh /usr/local/bin/ 2>/dev/null || true
mkdir -p /opt/keys && chmod 600 /opt/obmc/deploy/vps-201/keep-alive.sh
# cài token cho keep-alive
cp ~/.mcp-token /opt/obmc/.mcp-token 2>/dev/null || echo "TOKEN-của-team" > /opt/obmc/.mcp-token && chmod 600 /opt/obmc/.mcp-token
( crontab -l 2>/dev/null; echo '*/20 * * * * /opt/obmc/deploy/vps-201/keep-alive.sh >/dev/null 2>&1' ) | crontab -
```

## 2. Đăng nhập gemini.wed MỘT LẦN (2 phút, cần 2FA)

Từ máy của anh (không cần trên VPS):

```bash
# mở cổng tạm qua tunnel nếu firewall kín:
ssh -L 3000:127.0.0.1:3000 root@<VPS-201-IP>
```

- Mở `http://127.0.0.1:3000` trong Chrome → **dán URL** `https://gemini.google.com/` vào thanh địa chỉ của app OBMC → trang login Google hiện trong pane.
- Đăng nhập **gemini.wed@gmail.com** → mật khẩu → 2FA → **tick "Duy trì đăng nhập"**.
- Thấy giao diện Gemini (badge Pro) = xong. **Đóng tab, KHÔNG đăng xuất.** Volume `obmc-chrome-profile` giữ phiên.

## 3. Kiểm tra từ bất cứ đâu

```bash
TOKEN=$(cat ~/Downloads/obmc-mcp/mcp-auth.token)
curl -s -X POST http://<VPS-201-IP>:3000/mcp \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_get_dom","arguments":{"format":"text"}}}' \
  | head -c 300   # thấy nội dung trang Gemini đang mở = PHIÊN SỐNG 24/7 ✅
```

## 4. Vận hành

- Phiên hết/cảnh báo bảo mật (hiếm): lặp bước 2 (2 phút).
- Thêm tài khoản dự phòng: thêm 1 service nữa với volume profile khác (`obmc-chrome-profile-2`) + đăng nhập tài khoản đó → đổi nhanh = đổi tab/profile qua MCP.
- 9Router trỏ dự phòng về VPS khi Vercel chết: thêm channel `obmc-vps` base URL `http://<VPS-IP>:3000/v1`.
- Cập nhật OBMC: `cd /opt/obmc && git pull && docker compose -f deploy/vps-201/docker-compose.yml up -d --build`.
