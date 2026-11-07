/**
 * Browser Chrome Component
 * Tab strip, navigation toolbar, omnibox address bar, bookmarks, and workspace mode toggles.
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  Lock,
  Search,
  Layers,
  Terminal,
  Copy,
  Check,
  Eye,
  Bot,
  Camera,
  Download,
} from 'lucide-react';
import { BrowserTab } from '../../shared/browser-types';

interface BrowserChromeProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onScreenshot: () => void;
  onExportSession: () => void;
  activePanel: 'agent' | 'mcp' | 'inspector' | 'devtools' | null;
  onTogglePanel: (panel: 'agent' | 'mcp' | 'inspector' | 'devtools') => void;
  showInspectorOverlay: boolean;
  onToggleInspectorOverlay: () => void;
}

export const BrowserChrome: React.FC<BrowserChromeProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onScreenshot,
  onExportSession,
  activePanel,
  onTogglePanel,
  showInspectorOverlay,
  onToggleInspectorOverlay,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [addressInput, setAddressInput] = useState(activeTab?.url || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (activeTab) {
      setAddressInput(activeTab.url);
    }
  }, [activeTab?.url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressInput.trim()) {
      onNavigate(addressInput.trim());
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(activeTab?.url || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bookmarks = [
    { label: 'AeroSearch', url: 'browser://search', icon: '🔍' },
    { label: 'NovaTech Store', url: 'browser://store', icon: '🛍️' },
    { label: 'Test Lab Forms', url: 'browser://forms', icon: '🧪' },
    { label: 'TechNews', url: 'browser://news', icon: '📰' },
    { label: 'Wikipedia', url: 'browser://wikipedia', icon: '📖' },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 select-none shrink-0 flex flex-col">
      {/* 1. Top Tab Strip */}
      <div className="flex items-center px-2 pt-2 gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 min-w-[140px] max-w-[220px] rounded-t-lg text-xs cursor-pointer border-t border-x transition-colors ${
                isActive
                  ? 'bg-slate-800 text-slate-100 border-slate-700 shadow-xs'
                  : 'bg-slate-950/50 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              <span className="text-sm shrink-0">{tab.favicon || '🌐'}</span>
              <span className="truncate flex-1 font-medium text-[11px]">{tab.title}</span>

              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Đóng tab"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onNewTab}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
          title="Mở tab mới (Ctrl+T)"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Server & MCP Quick Status indicator */}
        <div className="flex items-center gap-2 px-3 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
          <span className="font-mono text-[10px] text-emerald-400 font-medium">MCP SERVER READY</span>
          <span className="font-mono text-[10px] text-slate-500" title="obmc-proxy-cors-20261106 obmc-proxy-basehref-20261107 obmc-captcha-drag-20261107 obmc-challenge-detect-20261107 obmc-mic-search-20261107 obmc-nav-wait-20261107 obmc-final-nudge-20261107 obmc-deep-read-20261107 obmc-shadow-pierce-20261107 obmc-extract-listings-20261107">v4.1.15</span>
          <span className="hidden" aria-hidden="true">obmc-proxy-cors-20261106</span>
          <span className="hidden" aria-hidden="true">obmc-proxy-basehref-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-captcha-drag-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-challenge-detect-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-mic-search-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-nav-wait-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-final-nudge-20261107</span>
          <span className="hidden" aria-hidden="true">obmc-deep-read-20261107</span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-[10px] text-slate-400">:3000/mcp/sse</span>
        </div>
      </div>

      {/* 2. Navigation Bar & Omnibox */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-t border-slate-700/80">
        {/* History controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onBack}
            disabled={!activeTab?.canGoBack}
            className={`p-1.5 rounded-md transition-colors ${
              activeTab?.canGoBack
                ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Quay lại (Back)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!activeTab?.canGoForward}
            className={`p-1.5 rounded-md transition-colors ${
              activeTab?.canGoForward
                ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Tiến tới (Forward)"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onReload}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Tải lại trang (Reload)"
          >
            <RotateCw
              className={`w-3.5 h-3.5 ${activeTab?.isLoading ? 'animate-spin text-sky-400' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('browser://search')}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Về trang chủ"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Omnibox URL input form */}
        <form onSubmit={handleSubmit} className="flex-1 relative flex items-center">
          <div className="absolute left-3 flex items-center gap-1 text-slate-400 pointer-events-none">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          <input
            id="browser-omnibox-input"
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Nhập URL hoặc tìm kiếm (ví dụ: browser://store, browser://search, wikipedia.org)..."
            className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded-lg pl-9 pr-16 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none transition-colors"
          />

          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={copyUrl}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Sao chép địa chỉ URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </form>

        {/* Utility Mode Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-slate-700">
          {/* Quick Screenshot Button */}
          <button
            type="button"
            onClick={onScreenshot}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-sky-300 hover:bg-slate-700/60 transition-colors"
            title="Chụp ảnh màn hình trang hiện tại"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Export Session Button */}
          <button
            type="button"
            onClick={onExportSession}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-emerald-300 hover:bg-slate-700/60 transition-colors"
            title="Xuất phiên làm việc và nhật ký MCP (JSON)"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Overlay highlight toggle */}
          <button
            type="button"
            onClick={onToggleInspectorOverlay}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showInspectorOverlay
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
            title="Bật/tắt hiển thị mã @ref trên trang"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lớp @ref</span>
          </button>

          {/* AI Agent Panel */}
          <button
            type="button"
            onClick={() => onTogglePanel('agent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activePanel === 'agent'
                ? 'bg-sky-600 text-white shadow'
                : 'bg-sky-950/50 text-sky-400 hover:bg-sky-900/60 border border-sky-800/60'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Agent</span>
          </button>

          {/* MCP Hub Panel */}
          <button
            type="button"
            onClick={() => onTogglePanel('mcp')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activePanel === 'mcp'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Cổng MCP</span>
          </button>

          {/* DOM Inspector Panel */}
          <button
            type="button"
            onClick={() => onTogglePanel('inspector')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activePanel === 'inspector'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">DOM Tree</span>
          </button>

          {/* DevTools */}
          <button
            type="button"
            onClick={() => onTogglePanel('devtools')}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              activePanel === 'devtools'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
            title="Bảng điều khiển nhà phát triển (Console & Mạng)"
          >
            <Terminal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Bookmarks bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border-t border-slate-800/70 text-[11px] overflow-x-auto no-scrollbar">
        <span className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider">Lối tắt:</span>
        {bookmarks.map((bm) => (
          <button
            key={bm.url}
            type="button"
            onClick={() => onNavigate(bm.url)}
            className="px-2 py-0.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span>{bm.icon}</span>
            <span>{bm.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
};
