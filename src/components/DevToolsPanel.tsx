/**
 * Browser DevTools Panel
 * Console logs and Network activity inspector for the browser session.
 */

import React, { useState, useEffect } from 'react';
import { Terminal, Globe, Trash2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ConsoleLogEntry, NetworkLogEntry } from '../../shared/browser-types';
import { sseClient } from '../services/sseClient';

interface DevToolsPanelProps {
  onClose: () => void;
  activeTabId: string;
}

export const DevToolsPanel: React.FC<DevToolsPanelProps> = ({ onClose, activeTabId }) => {
  const [activeTab, setActiveTab] = useState<'console' | 'network'>('console');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);

  useEffect(() => {
    // Fetch initial logs snapshot once per active tab
    fetch(`/api/browser/logs?tabId=${encodeURIComponent(activeTabId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.consoleLogs) setConsoleLogs(data.consoleLogs);
        if (data.networkLogs) setNetworkLogs(data.networkLogs);
      })
      .catch(() => {});

    // Live real-time updates via single SSE connection instead of polling
    const unsubConsole = sseClient.subscribe('console_log', (entry: ConsoleLogEntry) => {
      if (!entry.tabId || entry.tabId === activeTabId) {
        setConsoleLogs((prev) => [...prev.slice(-199), entry]);
      }
    });

    const unsubNetwork = sseClient.subscribe('network_log', (entry: NetworkLogEntry) => {
      if (!entry.tabId || entry.tabId === activeTabId) {
        setNetworkLogs((prev) => [...prev.slice(-199), entry]);
      }
    });

    return () => {
      unsubConsole();
      unsubNetwork();
    };
  }, [activeTabId]);

  return (
    <aside className="w-96 h-full bg-slate-900 border-l border-slate-800 flex flex-col justify-between select-text shrink-0">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-white">
            <Terminal className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white">Trình gỡ lỗi (DevTools)</h2>
            <p className="text-[10px] text-slate-400">Console & Nhật ký mạng cho tab hiện tại</p>
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
          onClick={() => setActiveTab('console')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'console'
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Console ({consoleLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('network')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'network'
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Mạng / Network ({networkLogs.length})
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-xs">
        {activeTab === 'console' && (
          consoleLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-sans">
              Chưa có thông báo console nào từ trang.
            </div>
          ) : (
            consoleLogs.map((log) => (
              <div
                key={log.id}
                className={`p-2 rounded border text-[11px] flex items-start gap-2 ${
                  log.level === 'error'
                    ? 'bg-rose-950/50 border-rose-800/60 text-rose-300'
                    : log.level === 'warn'
                    ? 'bg-amber-950/50 border-amber-800/60 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                {log.level === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                {log.level === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                {log.level === 'log' && <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />}
                <div className="flex-1 overflow-x-auto whitespace-pre-wrap">
                  {log.message}
                </div>
                <span className="text-[9px] text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )
        )}

        {activeTab === 'network' && (
          networkLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-sans">
              Chưa có yêu cầu mạng HTTP nào được ghi lại.
            </div>
          ) : (
            <div className="space-y-1">
              {networkLogs.map((net) => (
                <div
                  key={net.id}
                  className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-bold text-sky-400">{net.method}</span>
                    <span
                      className={`font-semibold px-1 rounded ${
                        net.status >= 200 && net.status < 300
                          ? 'bg-emerald-950 text-emerald-400'
                          : 'bg-rose-950 text-rose-400'
                      }`}
                    >
                      {net.status}
                    </span>
                    <span className="truncate text-slate-300 max-w-[140px]">{net.url}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 shrink-0">
                    <span>{net.durationMs}ms</span>
                    <span className="text-slate-500">{net.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
        <button
          onClick={() => {
            setConsoleLogs([]);
            setNetworkLogs([]);
          }}
          className="text-slate-400 hover:text-white flex items-center gap-1 font-sans"
        >
          <Trash2 className="w-3 h-3" />
          <span>Xóa nhật ký</span>
        </button>
        <span className="font-mono">Tab: {activeTabId}</span>
      </div>
    </aside>
  );
};
