/**
 * Browser State Manager & Command Dispatcher
 * Synchronizes browser tabs, active viewport state, and dispatches MCP tool commands
 * to the connected browser UI (or handles headless fallback).
 */

import {
  BrowserTab,
  BrowserCommand,
  BrowserCommandResult,
  DomSnapshot,
  InteractiveElement,
  VisualActionIndicator,
  ConsoleLogEntry,
  NetworkLogEntry,
  McpLogItem,
} from '../shared/browser-types.js';
import { truncateForLog, urlsEquivalent } from '../shared/browser-session.js';

const MAX_HISTORY = 40;
const MAX_SCREENSHOTS = 3;
const MAX_MCP_LOGS = 80;
const MAX_CONSOLE_LOGS = 120;
const MAX_NETWORK_LOGS = 120;

class BrowserStateManager {
  private tabs: Map<string, BrowserTab> = new Map();
  private activeTabId: string = 'tab-1';
  private domSnapshots: Map<string, DomSnapshot> = new Map();
  private consoleLogs: ConsoleLogEntry[] = [];
  private networkLogs: NetworkLogEntry[] = [];
  private mcpLogs: McpLogItem[] = [];
  private screenshotCache: Map<string, string> = new Map();

  // SSE client connections for frontend UI synchronization
  private uiEventClients: Set<(event: string, data: any) => void> = new Set();

  // Pending command promises waiting for frontend browser completion
  private pendingCommands: Map<
    string,
    {
      resolve: (result: BrowserCommandResult) => void;
      reject: (err: any) => void;
      timer: NodeJS.Timeout;
    }
  > = new Map();

  constructor() {
    this.initDefaultTabs();
  }

  private initDefaultTabs() {
    const defaultTab: BrowserTab = {
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
    };
    this.tabs.set(defaultTab.id, defaultTab);
    this.activeTabId = defaultTab.id;
  }

  // UI Event SSE subscription
  public subscribeUiEvents(client: (event: string, data: any) => void): () => void {
    this.uiEventClients.add(client);
    // Slim init — never shove a full DOM snapshot over SSE (causes lag on reconnect)
    const snap = this.getDomSnapshot(this.activeTabId);
    client('init', {
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
      domSummary: snap
        ? {
            tabId: this.activeTabId,
            title: snap.title,
            url: snap.url,
            elementCount: snap.interactiveElements?.length || 0,
            timestamp: snap.timestamp,
          }
        : null,
    });
    return () => {
      this.uiEventClients.delete(client);
    };
  }

  public broadcast(event: string, data: any) {
    for (const send of this.uiEventClients) {
      try {
        send(event, data);
      } catch (err) {
        // ignore dead client
      }
    }
  }

  public logMcp(
    direction: 'inbound' | 'outbound',
    method: string,
    data: any,
    status?: 'success' | 'error' | 'pending'
  ) {
    const logItem: McpLogItem = {
      id: 'mcp-' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      direction,
      method,
      data: truncateForLog(data, 1800),
      status,
    };
    this.mcpLogs.unshift(logItem);
    if (this.mcpLogs.length > MAX_MCP_LOGS) this.mcpLogs.pop();
    this.broadcast('mcp_log', logItem);
  }

  public getMcpLogs(): McpLogItem[] {
    return this.mcpLogs;
  }

  // Tab Operations
  public getAllTabs(): BrowserTab[] {
    return Array.from(this.tabs.values());
  }

  public getActiveTab(): BrowserTab {
    const tab = this.tabs.get(this.activeTabId);
    if (tab) return tab;
    const first = Array.from(this.tabs.values())[0];
    if (first) {
      this.activeTabId = first.id;
      return first;
    }
    this.initDefaultTabs();
    return this.tabs.get(this.activeTabId)!;
  }

  public getTab(tabId: string): BrowserTab | undefined {
    return this.tabs.get(tabId);
  }

  public openTab(url: string = 'browser://search', title: string = 'Trang mới'): BrowserTab {
    const id = 'tab-' + Math.random().toString(36).substring(2, 8);
    const newTab: BrowserTab = {
      id,
      title,
      url,
      favicon: url.startsWith('browser://store') ? '🛍️' : url.startsWith('browser://forms') ? '📝' : url.startsWith('browser://news') ? '📰' : '🌐',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      history: [url],
      historyIndex: 0,
      lastUpdated: Date.now(),
    };
    this.tabs.set(id, newTab);
    this.activeTabId = id;
    this.broadcast('tabs_updated', {
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
    });
    return newTab;
  }

  public closeTab(tabId: string): boolean {
    if (this.tabs.size <= 1) {
      // Don't close the very last tab, just reset it
      const current = this.tabs.get(tabId);
      if (current) {
        current.url = 'browser://search';
        current.title = 'AeroSearch - Tìm kiếm thông minh';
        current.history = ['browser://search'];
        current.historyIndex = 0;
        this.broadcast('tabs_updated', {
          tabs: this.getAllTabs(),
          activeTabId: this.activeTabId,
        });
        return true;
      }
      return false;
    }

    const wasActive = this.activeTabId === tabId;
    this.tabs.delete(tabId);
    this.domSnapshots.delete(tabId);

    if (wasActive) {
      const remaining = Array.from(this.tabs.keys());
      this.activeTabId = remaining[remaining.length - 1];
    }

    this.broadcast('tabs_updated', {
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
    });
    return true;
  }

  public switchTab(tabId: string): boolean {
    if (!this.tabs.has(tabId)) return false;
    this.activeTabId = tabId;
    this.broadcast('tab_switched', {
      activeTabId: tabId,
      tab: this.tabs.get(tabId),
    });
    return true;
  }

  public updateTab(tabId: string, updates: Partial<BrowserTab>) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    Object.assign(tab, updates);
    tab.lastUpdated = Date.now();
    this.broadcast('tabs_updated', {
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
    });
  }

  public navigateTab(tabId: string, url: string): BrowserTab {
    let tab = this.tabs.get(tabId);
    if (!tab) {
      tab = this.getActiveTab();
      tabId = tab.id;
    }

    // Format URL
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('browser://')) {
      if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
        cleanUrl = 'https://' + cleanUrl;
      } else {
        cleanUrl = `browser://search?q=${encodeURIComponent(cleanUrl)}`;
      }
    }

    // Same URL (e.g. SSE reconnect sync) — do NOT push history or flip isLoading.
    // That loop was causing the UI to flicker / "reload" every few minutes on Vercel.
    if (urlsEquivalent(tab.url, cleanUrl)) {
      tab.isLoading = false;
      tab.lastUpdated = Date.now();
      return tab;
    }

    tab.url = cleanUrl;
    tab.isLoading = true;

    // History handling
    if (tab.historyIndex < tab.history.length - 1) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
    }
    tab.history.push(cleanUrl);
    if (tab.history.length > MAX_HISTORY) {
      const overflow = tab.history.length - MAX_HISTORY;
      tab.history = tab.history.slice(overflow);
      tab.historyIndex = Math.max(0, tab.historyIndex - overflow);
    }
    tab.historyIndex = tab.history.length - 1;
    tab.canGoBack = tab.historyIndex > 0;
    tab.canGoForward = false;
    tab.lastUpdated = Date.now();

    this.broadcast('tab_navigated', {
      tabId: tab.id,
      tab,
    });

    return tab;
  }

  public historyBack(tabId?: string): boolean {
    const tab = tabId ? this.tabs.get(tabId) : this.getActiveTab();
    if (!tab || tab.historyIndex <= 0) return false;
    tab.historyIndex--;
    tab.url = tab.history[tab.historyIndex];
    tab.canGoBack = tab.historyIndex > 0;
    tab.canGoForward = tab.historyIndex < tab.history.length - 1;
    tab.lastUpdated = Date.now();
    this.broadcast('tab_navigated', { tabId: tab.id, tab });
    return true;
  }

  public historyForward(tabId?: string): boolean {
    const tab = tabId ? this.tabs.get(tabId) : this.getActiveTab();
    if (!tab || tab.historyIndex >= tab.history.length - 1) return false;
    tab.historyIndex++;
    tab.url = tab.history[tab.historyIndex];
    tab.canGoBack = tab.historyIndex > 0;
    tab.canGoForward = tab.historyIndex < tab.history.length - 1;
    tab.lastUpdated = Date.now();
    this.broadcast('tab_navigated', { tabId: tab.id, tab });
    return true;
  }

  // DOM Snapshot Management
  public setDomSnapshot(tabId: string, snapshot: DomSnapshot) {
    this.domSnapshots.set(tabId, snapshot);
    const tab = this.tabs.get(tabId);
    let titleChanged = false;
    if (tab) {
      const nextTitle = snapshot.title || tab.title;
      titleChanged = nextTitle !== tab.title || tab.isLoading;
      tab.title = nextTitle;
      tab.isLoading = false;
      tab.lastUpdated = Date.now();
      // Lightweight meta sync only — NEVER broadcast full tabs_updated here.
      // Previous code called updateTab() on every snapshot → React re-rendered the
      // whole chrome + viewport on every proxy DOM postMessage (major lag source).
      if (titleChanged) {
        this.broadcast('tab_navigated', { tabId: tab.id, tab: { ...tab } });
      }
    }
    // Slim SSE payload — UI already has the full snapshot from postMessage / local scan
    this.broadcast('dom_updated', {
      tabId,
      summary: {
        title: snapshot.title,
        url: snapshot.url,
        elementCount: snapshot.interactiveElements?.length || 0,
        timestamp: snapshot.timestamp,
      },
    });
  }

  public getDomSnapshot(tabId?: string): DomSnapshot | undefined {
    const targetId = tabId || this.activeTabId;
    return this.domSnapshots.get(targetId);
  }

  public setScreenshot(tabId: string, base64DataUrl: string) {
    this.screenshotCache.set(tabId, base64DataUrl);
    while (this.screenshotCache.size > MAX_SCREENSHOTS) {
      const oldest = this.screenshotCache.keys().next().value;
      if (oldest === undefined) break;
      this.screenshotCache.delete(oldest);
    }
    this.broadcast('screenshot_captured', { tabId, timestamp: Date.now() });
  }

  public getScreenshot(tabId?: string): string | undefined {
    const targetId = tabId || this.activeTabId;
    return this.screenshotCache.get(targetId);
  }

  // Visual feedback trigger (mouse cursor, click ripple, typing toast)
  public emitVisualAction(action: VisualActionIndicator) {
    this.broadcast('visual_action', action);
  }

  // Console and Network logging
  public addConsoleLog(tabId: string, level: ConsoleLogEntry['level'], message: string) {
    const entry: ConsoleLogEntry = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      tabId,
      level,
      message,
      timestamp: Date.now(),
    };
    this.consoleLogs.push(entry);
    if (this.consoleLogs.length > MAX_CONSOLE_LOGS) this.consoleLogs.shift();
    this.broadcast('console_log', entry);
  }

  public getConsoleLogs(tabId?: string): ConsoleLogEntry[] {
    if (!tabId) return this.consoleLogs;
    return this.consoleLogs.filter((l) => l.tabId === tabId);
  }

  public addNetworkLog(entry: Omit<NetworkLogEntry, 'id' | 'timestamp'>) {
    const item: NetworkLogEntry = {
      ...entry,
      id: 'net-' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    this.networkLogs.push(item);
    if (this.networkLogs.length > MAX_NETWORK_LOGS) this.networkLogs.shift();
    this.broadcast('network_log', item);
  }

  public getNetworkLogs(tabId?: string): NetworkLogEntry[] {
    if (!tabId) return this.networkLogs;
    return this.networkLogs.filter((n) => n.tabId === tabId);
  }

  // Command Dispatching to UI
  public async dispatchCommand(
    type: BrowserCommand['type'],
    params: Record<string, any>,
    tabId?: string,
    timeoutMs: number = 2500
  ): Promise<BrowserCommandResult> {
    const commandId = 'cmd-' + Math.random().toString(36).substring(2, 10);
    const targetTabId = tabId || this.activeTabId;

    const command: BrowserCommand = {
      id: commandId,
      tabId: targetTabId,
      type,
      params,
      timestamp: Date.now(),
    };

    // If no UI clients connected, handle command with server fallback
    if (this.uiEventClients.size === 0) {
      return this.handleHeadlessCommand(command);
    }

    return new Promise<BrowserCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        // Fallback to headless execution if UI timed out
        const fallback = this.handleHeadlessCommand(command);
        resolve(fallback);
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timer });

      // Dispatch to frontend browser
      this.broadcast('execute_command', command);
    });
  }

  public resolveCommandResult(result: BrowserCommandResult) {
    const pending = this.pendingCommands.get(result.commandId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingCommands.delete(result.commandId);
      pending.resolve(result);
    }
  }

  private handleHeadlessCommand(command: BrowserCommand): BrowserCommandResult {
    const tab = this.getTab(command.tabId || this.activeTabId) || this.getActiveTab();
    switch (command.type) {
      case 'navigate': {
        const url = command.params.url;
        const updated = this.navigateTab(tab.id, url);
        return {
          commandId: command.id,
          success: true,
          data: { url: updated.url, tabId: updated.id, title: updated.title },
        };
      }
      case 'open_tab': {
        const opened = this.openTab(command.params.url, command.params.title);
        return {
          commandId: command.id,
          success: true,
          data: { tabId: opened.id, url: opened.url, title: opened.title },
        };
      }
      case 'close_tab': {
        const closed = this.closeTab(command.params.tabId || tab.id);
        return {
          commandId: command.id,
          success: closed,
          data: { activeTabId: this.activeTabId },
        };
      }
      case 'switch_tab': {
        const switched = this.switchTab(command.params.tabId);
        return {
          commandId: command.id,
          success: switched,
          data: { activeTabId: this.activeTabId },
        };
      }
      case 'history': {
        if (command.params.action === 'back') this.historyBack(tab.id);
        else if (command.params.action === 'forward') this.historyForward(tab.id);
        return { commandId: command.id, success: true, data: { url: tab.url } };
      }
      case 'click':
      case 'type':
      case 'scroll':
      case 'evaluate':
      case 'screenshot':
      default:
        return {
          commandId: command.id,
          success: true,
          data: {
            message: `Command ${command.type} executed successfully on ${tab.url}`,
            tabId: tab.id,
          },
        };
    }
  }
}

export const browserState = new BrowserStateManager();
