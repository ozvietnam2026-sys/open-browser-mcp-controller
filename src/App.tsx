/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserChrome } from './components/BrowserChrome';
import { BrowserViewport } from './components/BrowserViewport';
import { AiAgentPanel } from './components/AiAgentPanel';
import { McpHubPanel } from './components/McpHubPanel';
import { DomInspectorPanel } from './components/DomInspectorPanel';
import { DevToolsPanel } from './components/DevToolsPanel';
import {
  BrowserTab,
  DomSnapshot,
  VisualActionIndicator,
  InteractiveElement,
} from '../shared/browser-types';
import { Camera, Download, X } from 'lucide-react';
import { sseClient } from './services/sseClient';

export default function App() {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab-1',
      title: 'AeroSearch - Tìm kiếm thông minh',
      url: 'browser://search',
      favicon: '🔍',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      history: ['browser://search'],
      historyIndex: 0,
      lastUpdated: Date.now(),
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Side panels state
  const [activePanel, setActivePanel] = useState<'agent' | 'mcp' | 'inspector' | 'devtools' | null>(
    'agent'
  );

  // Inspector & visual feedback states
  const [showInspectorOverlay, setShowInspectorOverlay] = useState<boolean>(true);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<DomSnapshot | undefined>(undefined);
  const [visualAction, setVisualAction] = useState<VisualActionIndicator | null>(null);

  // Screenshot viewer modal
  const [screenshotModal, setScreenshotModal] = useState<{ url: string; dataUrl: string } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Listen to SSE events from server via singleton sseClient
  useEffect(() => {
    const unsubInit = sseClient.subscribe('init', (data) => {
      if (data?.tabs && data.tabs.length > 0) {
        setTabs(data.tabs);
      }
      if (data?.activeTabId) {
        setActiveTabId(data.activeTabId);
      }
    });

    const unsubTabs = sseClient.subscribe('tabs_updated', (data) => {
      if (data?.tabs) setTabs(data.tabs);
      if (data?.activeTabId) setActiveTabId(data.activeTabId);
    });

    const unsubSwitch = sseClient.subscribe('tab_switched', (data) => {
      if (data?.activeTabId) setActiveTabId(data.activeTabId);
    });

    const unsubNav = sseClient.subscribe('tab_navigated', (data) => {
      if (data?.tab) {
        setTabs((prev) =>
          prev.map((t) => (t.id === data.tab.id ? { ...t, ...data.tab } : t))
        );
      }
    });

    const unsubVisual = sseClient.subscribe('visual_action', (action: VisualActionIndicator) => {
      if (action) {
        setVisualAction(action);
      }
    });

    return () => {
      unsubInit();
      unsubTabs();
      unsubSwitch();
      unsubNav();
      unsubVisual();
    };
  }, []);

  // Tab Operations
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'browser_switch_tab', arguments: { tabId: id } },
      }),
    }).catch(() => {});
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }

    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'browser_close_tab', arguments: { tabId: id } },
      }),
    }).catch(() => {});
  };

  const handleNewTab = () => {
    const newId = 'tab-' + Math.random().toString(36).substring(2, 8);
    const newTab: BrowserTab = {
      id: newId,
      title: 'AeroSearch - Tìm kiếm thông minh',
      url: 'browser://search',
      favicon: '🔍',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      history: ['browser://search'],
      historyIndex: 0,
      lastUpdated: Date.now(),
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newId);

    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'browser_open_tab', arguments: { url: 'browser://search' } },
      }),
    }).catch(() => {});
  };

  const handleNavigate = (url: string) => {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('browser://')) {
      if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
        cleanUrl = 'https://' + cleanUrl;
      } else {
        cleanUrl = `browser://search?q=${encodeURIComponent(cleanUrl)}`;
      }
    }

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          const newHistory = t.history.slice(0, t.historyIndex + 1);
          newHistory.push(cleanUrl);
          return {
            ...t,
            url: cleanUrl,
            history: newHistory,
            historyIndex: newHistory.length - 1,
            canGoBack: true,
            canGoForward: false,
            isLoading: true,
            favicon: cleanUrl.startsWith('browser://store')
              ? '🛍️'
              : cleanUrl.startsWith('browser://forms')
              ? '🧪'
              : cleanUrl.startsWith('browser://news')
              ? '📰'
              : cleanUrl.startsWith('browser://wikipedia')
              ? '📖'
              : '🌐',
          };
        }
        return t;
      })
    );

    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'browser_navigate', arguments: { url: cleanUrl, tabId: activeTabId } },
      }),
    }).catch(() => {});
  };

  const handleBack = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId && t.historyIndex > 0) {
          const newIdx = t.historyIndex - 1;
          return {
            ...t,
            historyIndex: newIdx,
            url: t.history[newIdx],
            canGoBack: newIdx > 0,
            canGoForward: true,
          };
        }
        return t;
      })
    );
  };

  const handleForward = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId && t.historyIndex < t.history.length - 1) {
          const newIdx = t.historyIndex + 1;
          return {
            ...t,
            historyIndex: newIdx,
            url: t.history[newIdx],
            canGoBack: true,
            canGoForward: newIdx < t.history.length - 1,
          };
        }
        return t;
      })
    );
  };

  const handleReload = () => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t))
    );
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t))
      );
    }, 400);
  };

  const handleTitleChange = useCallback((newTitle: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId && t.title !== newTitle) {
          return { ...t, title: newTitle, isLoading: false };
        }
        return t;
      })
    );
  }, [activeTabId]);

  const handleSnapshotUpdated = useCallback((snapshot: DomSnapshot) => {
    setCurrentSnapshot((prev) => {
      if (prev && prev.timestamp === snapshot.timestamp) return prev;
      return snapshot;
    });
  }, []);

  const handleTogglePanel = (panel: 'agent' | 'mcp' | 'inspector' | 'devtools') => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  // Quick Screenshot trigger
  const handleTriggerScreenshot = async () => {
    try {
      const res = await fetch('/api/mcp/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'browser_screenshot', arguments: { tabId: activeTabId } },
        }),
      });
      const data = await res.json();
      const imgBlock = data?.result?.content?.find((c: any) => c.type === 'image');
      if (imgBlock?.data) {
        setScreenshotModal({
          url: activeTab?.url || '',
          dataUrl: `data:image/png;base64,${imgBlock.data}`,
        });
      }
    } catch (e) {}
  };

  const handleExportSession = async () => {
    try {
      const res = await fetch('/api/browser/export');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `browser-session-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  // Direct element triggers from DOM inspector
  const handleExecuteClickFromInspector = (refId: string) => {
    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'browser_click', arguments: { ref: refId, tabId: activeTabId } },
      }),
    }).catch(() => {});
  };

  const handleExecuteTypeFromInspector = (refId: string, text: string) => {
    fetch('/api/mcp/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'browser_type',
          arguments: { ref: refId, text, pressEnter: true, tabId: activeTabId },
        },
      }),
    }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Browser Chrome Toolbar */}
      <BrowserChrome
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onScreenshot={handleTriggerScreenshot}
        onExportSession={handleExportSession}
        activePanel={activePanel}
        onTogglePanel={handleTogglePanel}
        showInspectorOverlay={showInspectorOverlay}
        onToggleInspectorOverlay={() => setShowInspectorOverlay(!showInspectorOverlay)}
      />

      {/* 2. Main Workstation Area: Viewport + Side Panel */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left: Interactive Browser Viewport */}
        <section className="flex-1 h-full relative overflow-hidden bg-slate-900">
          <BrowserViewport
            activeTabId={activeTabId}
            url={activeTab?.url || 'browser://search'}
            onNavigate={handleNavigate}
            onTitleChange={handleTitleChange}
            showInspectorOverlay={showInspectorOverlay}
            hoveredRefId={hoveredRefId}
            onSelectElement={(el: InteractiveElement) => {
              setHoveredRefId(el.refId);
            }}
            visualAction={visualAction}
            onSnapshotUpdated={handleSnapshotUpdated}
          />
        </section>

        {/* Right: Active Side Panel */}
        {activePanel === 'agent' && (
          <AiAgentPanel
            onClose={() => setActivePanel(null)}
            activeTabUrl={activeTab?.url || ''}
          />
        )}

        {activePanel === 'mcp' && (
          <McpHubPanel
            onClose={() => setActivePanel(null)}
            activeTabId={activeTabId}
          />
        )}

        {activePanel === 'inspector' && (
          <DomInspectorPanel
            onClose={() => setActivePanel(null)}
            snapshot={currentSnapshot}
            onHoverRef={setHoveredRefId}
            onExecuteClick={handleExecuteClickFromInspector}
            onExecuteType={handleExecuteTypeFromInspector}
          />
        )}

        {activePanel === 'devtools' && (
          <DevToolsPanel
            onClose={() => setActivePanel(null)}
            activeTabId={activeTabId}
          />
        )}
      </main>

      {/* Screenshot Preview Modal */}
      {screenshotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-5 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">Ảnh chụp màn hình trình duyệt</h3>
              </div>
              <button
                onClick={() => setScreenshotModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-[60vh] flex items-center justify-center bg-slate-950">
              <img
                src={screenshotModal.dataUrl}
                alt="Browser Screenshot"
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 font-mono truncate max-w-sm">
                URL: {screenshotModal.url}
              </span>
              <a
                href={screenshotModal.dataUrl}
                download={`screenshot-${Date.now()}.png`}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải ảnh PNG</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
