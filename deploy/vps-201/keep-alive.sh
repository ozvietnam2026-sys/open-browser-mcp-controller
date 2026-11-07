#!/usr/bin/env bash
# Giữ phiên Google sống: 20 phút/lần mở lại tab Gemini của tài khoản Pro (authuser=2).
# Cài: crontab -e  →  */20 * * * * /opt/obmc/deploy/vps-201/keep-alive.sh >/dev/null 2>&1
TOKEN=$(cat /opt/obmc/.mcp-token)
curl -s --max-time 30 -X POST http://127.0.0.1:3000/mcp \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_navigate","arguments":{"url":"https://gemini.google.com/u/2/app"}}}' >/dev/null
