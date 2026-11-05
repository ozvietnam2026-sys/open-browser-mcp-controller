/**
 * MCP Hub & External Tools Controller Panel
 * Connects external AI tools (Claude Desktop, Cursor, custom agents)
 * and provides an interactive tool tester with live MCP JSON-RPC logs.
 */

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Copy,
  Check,
  Play,
  Download,
} from 'lucide-react';
import { McpToolDefinition, McpLogItem } from '../../shared/browser-types';
import { sseClient } from '../services/sseClient';

interface McpHubPanelProps {
  onClose: () => void;
  activeTabId: string;
}

export const McpHubPanel: React.FC<McpHubPanelProps> = ({ onClose, activeTabId }) => {
  const [activeTab, setActiveTab] = useState<'tester' | 'config' | 'logs'>('tester');
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string>('browser_click');
  const [toolArgsJson, setToolArgsJson] = useState<string>('{\n  "ref": "@ref:1"\n}');
  const [toolResult, setToolResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<McpLogItem[]>([]);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  useEffect(() => {
    fetch('/api/mcp/tools')
      .then((res) => res.json())
      .then((data) => {
        if (data.tools) setTools(data.tools);
      })
      .catch((err) => console.error('Failed to load MCP tools:', err));

    fetch('/api/mcp/logs')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setLogs(data);
      })
      .catch(() => {});

    const unsubMcpLog = sseClient.subscribe('mcp_log', (entry: McpLogItem) => {
      if (entry) {
        setLogs((prev) => [entry, ...prev.slice(0, 99)]);
      }
    });

    return () => {
      unsubMcpLog();
    };
  }, []);

  const handleSelectTool = (name: string) => {
    setSelectedToolName(name);
    let sampleArgs: Record<string, any> = {};

    switch (name) {
      case 'browser_navigate':
        sampleArgs = { url: 'browser://store' };
        break;
      case 'browser_click':
        sampleArgs = { ref: '@ref:1' };
        break;
      case 'browser_hover':
        sampleArgs = { ref: '@ref:1' };
        break;
      case 'browser_type':
        sampleArgs = { ref: '@ref:1', text: 'Laptop gaming', pressEnter: true };
        break;
      case 'browser_press_key':
        sampleArgs = { key: 'Enter', ref: '@ref:1' };
        break;
      case 'browser_select_option':
        sampleArgs = { ref: '@ref:3', value: 'developer' };
        break;
      case 'browser_fill_form':
        sampleArgs = {
          fields: {
            '@ref:1': 'Nguyễn Văn An',
            '@ref:2': 'an.nguyen@example.com',
          },
          submitAfter: false,
        };
        break;
      case 'browser_wait_for':
        sampleArgs = { text: 'NovaBook', timeoutMs: 3000 };
        break;
      case 'browser_extract_content':
        sampleArgs = { mode: 'structured' };
        break;
      case 'browser_scroll':
        sampleArgs = { direction: 'down', amount: 400 };
        break;
      case 'browser_screenshot':
        sampleArgs = { fullPage: false };
        break;
      case 'browser_get_dom':
        sampleArgs = { format: 'interactive_elements' };
        break;
      case 'browser_open_tab':
        sampleArgs = { url: 'browser://forms', title: 'Test Lab' };
        break;
      case 'browser_close_tab':
        sampleArgs = { tabId: activeTabId };
        break;
      case 'browser_switch_tab':
        sampleArgs = { tabId: activeTabId };
        break;
      case 'browser_list_tabs':
        sampleArgs = {};
        break;
      case 'browser_evaluate':
        sampleArgs = { script: 'document.title' };
        break;
      case 'browser_history':
        sampleArgs = { action: 'back' };
        break;
      case 'extract_http_fetch':
        sampleArgs = { url: 'https://example.com' };
        break;
      case 'extract_readable':
        sampleArgs = { url: 'https://en.wikipedia.org/wiki/Web_scraping' };
        break;
      case 'extract_structured':
        sampleArgs = {
          url: 'https://example.com',
          schema: { title: 'h1', links: { selector: 'a', attr: 'href', many: true } },
        };
        break;
      case 'extract_tables':
        sampleArgs = { url: 'https://en.wikipedia.org/wiki/List_of_HTTP_status_codes', limit: 5 };
        break;
      case 'extract_lists':
        sampleArgs = { url: 'https://example.com', limit: 10 };
        break;
      case 'extract_links':
        sampleArgs = { url: 'https://news.ycombinator.com', limit: 20 };
        break;
      case 'extract_metadata':
        sampleArgs = { url: 'https://en.wikipedia.org/wiki/Web_scraping' };
        break;
      case 'extract_discover':
        sampleArgs = { url: 'https://www.wikipedia.org', sitemapLimit: 20 };
        break;
      case 'extract_robots':
        sampleArgs = { url: 'https://www.wikipedia.org' };
        break;
      case 'extract_sitemap':
        sampleArgs = { url: 'https://www.wikipedia.org/sitemap.xml', limit: 20 };
        break;
      case 'extract_crawl':
        sampleArgs = { url: 'https://example.com', maxPages: 3, extractReadable: true };
        break;
      case 'extract_paginate':
        sampleArgs = {
          url: 'https://news.ycombinator.com',
          itemSelector: 'tr.athing',
          nextSelector: 'a.morelink',
          maxPages: 2,
          fields: { title: '.titleline a' },
        };
        break;
      case 'extract_json_api':
        sampleArgs = { url: 'https://example.com' };
        break;
      case 'pw_navigate':
        sampleArgs = { url: 'https://example.com' };
        break;
      case 'pw_snapshot':
        sampleArgs = { interactiveOnly: true };
        break;
      case 'pw_click':
        sampleArgs = { ref: 'e1' };
        break;
      case 'pw_type':
        sampleArgs = { ref: 'e1', text: 'hello' };
        break;
      case 'pw_network':
        sampleArgs = { all: false };
        break;
      case 'pw_screenshot':
        sampleArgs = { fullPage: false };
        break;
      case 'pw_pdf':
        sampleArgs = {};
        break;
      case 'pw_scroll':
        sampleArgs = { infiniteSteps: 3, waitMs: 500 };
        break;
      case 'pw_close':
        sampleArgs = {};
        break;
      default:
        sampleArgs = {};
    }

    setToolArgsJson(JSON.stringify(sampleArgs, null, 2));
  };

  const handleExecuteTool = async () => {
    setIsExecuting(true);
    setToolResult(null);

    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(toolArgsJson);
    } catch (err: any) {
      setToolResult({ error: `JSON cú pháp không hợp lệ: ${err.message}` });
      setIsExecuting(false);
      return;
    }

    try {
      const response = await fetch('/api/mcp/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-' + Date.now(),
          method: 'tools/call',
          params: {
            name: selectedToolName,
            arguments: parsedArgs,
          },
        }),
      });

      const data = await response.json();
      setToolResult(data);

      const updatedLogs = await fetch('/api/mcp/logs').then((r) => r.json());
      if (Array.isArray(updatedLogs)) setLogs(updatedLogs);
    } catch (err: any) {
      setToolResult({ error: err.message || 'Lỗi gọi MCP RPC' });
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        'open-browser': {
          url: `${baseUrl}/mcp/sse`,
        },
      },
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        'open-browser': {
          type: 'sse',
          url: `${baseUrl}/mcp/sse`,
        },
      },
    },
    null,
    2
  );

  const pythonClientSnippet = `import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    async with sse_client("${baseUrl}/mcp/sse") as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("Connected to Open Browser MCP! Available tools:", len(tools.tools))
            # Navigate to store
            result = await session.call_tool("browser_navigate", {"url": "browser://store"})
            print(result)

asyncio.run(main())
`;

  return (
    <aside className="w-96 h-full bg-slate-900 border-l border-slate-800 flex flex-col justify-between select-text shrink-0">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Cổng Model Context Protocol</span>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950 px-1 py-0.5 rounded border border-emerald-800">
                ACTIVE
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">Kết nối Claude Desktop, Cursor & AI Agents</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Đóng panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 gap-1">
        <button
          onClick={() => setActiveTab('tester')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'tester'
              ? 'bg-slate-800 text-indigo-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Thử nghiệm Tool ({tools.length})
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'config'
              ? 'bg-slate-800 text-indigo-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Cấu hình Client
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'logs'
              ? 'bg-slate-800 text-indigo-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Nhật ký MCP ({logs.length})
        </button>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-4">
        {activeTab === 'tester' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Chọn công cụ MCP ({tools.length} công cụ sẵn có):
              </label>
              <select
                value={selectedToolName}
                onChange={(e) => handleSelectTool(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                {tools.find((t) => t.name === selectedToolName)?.description}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Tham số gọi (JSON Arguments):
                </label>
                <span className="text-[10px] text-slate-500 font-mono">RFC 2024-11-05</span>
              </div>
              <textarea
                rows={6}
                value={toolArgsJson}
                onChange={(e) => setToolArgsJson(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleExecuteTool}
              disabled={isExecuting}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isExecuting ? 'Đang gửi qua cổng MCP...' : 'Thực thi Tool MCP'}</span>
            </button>

            {/* Response Viewer */}
            {toolResult && (
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                  Phản hồi từ MCP Server:
                </span>
                <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(toolResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-4 text-xs">
            {/* Endpoints banner */}
            <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1.5">
              <span className="text-[10px] uppercase font-semibold text-sky-400 block">
                Cổng kết nối thời gian thực:
              </span>
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-200">
                <span>SSE Stream:</span>
                <span className="text-indigo-400">{baseUrl}/mcp/sse</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-200">
                <span>Messages POST:</span>
                <span className="text-indigo-400">{baseUrl}/mcp/messages</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-200">
                <span>Direct JSON-RPC:</span>
                <span className="text-indigo-400">{baseUrl}/api/mcp/rpc</span>
              </div>
            </div>

            {/* Claude Desktop Config */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-200">Claude Desktop Config</span>
                <button
                  onClick={() => copyToClipboard(claudeDesktopConfig, 'claude')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {copiedType === 'claude' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Sao chép</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mb-1">
                Thêm vào file <code>claude_desktop_config.json</code>:
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-indigo-300 overflow-x-auto">
                {claudeDesktopConfig}
              </pre>
            </div>

            {/* Cursor Config */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-200">Cursor / Windsurf Config</span>
                <button
                  onClick={() => copyToClipboard(cursorConfig, 'cursor')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {copiedType === 'cursor' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Sao chép</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-indigo-300 overflow-x-auto">
                {cursorConfig}
              </pre>
            </div>

            {/* Python MCP Client */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-200">Python MCP Client (Async)</span>
                <button
                  onClick={() => copyToClipboard(pythonClientSnippet, 'py')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {copiedType === 'py' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Sao chép</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                {pythonClientSnippet}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-2">
            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              <span>Lưu lượng gói tin MCP theo thời gian thực</span>
              <span className="font-mono">{logs.length} gói tin</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                Chưa có yêu cầu MCP nào. Hãy thử chạy một công cụ ở tab Thử nghiệm Tool.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded ${
                        log.direction === 'inbound'
                          ? 'bg-sky-950 text-sky-400 border border-sky-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {log.direction.toUpperCase()}
                    </span>
                    <span className="text-slate-300">{log.method}</span>
                    <span className="text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-slate-300 text-[9px] max-h-20 overflow-y-auto whitespace-pre-wrap">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
        <span>Giao thức: MCP 2024-11-05</span>
        <button
          onClick={() => window.open('/api/browser/export', '_blank')}
          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
        >
          <Download className="w-3 h-3" />
          <span>Xuất JSON phiên</span>
        </button>
      </div>
    </aside>
  );
};
