/**
 * Shared types for Open Browser MCP Controller
 */

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  history: string[];
  historyIndex: number;
  scrollY?: number;
  lastUpdated: number;
  navigationId?: number;
}

export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractiveElement {
  refId: string; // e.g. "@ref:1"
  index: number;
  tagName: string;
  type?: string;
  id?: string;
  name?: string;
  text: string;
  value?: string;
  placeholder?: string;
  href?: string;
  ariaLabel?: string;
  boundingBox: ElementBoundingBox;
  isClickable: boolean;
  isInput: boolean;
  selector: string;
}

export interface DomSnapshot {
  documentUrl?: string;
  tabId?: string;
  navigationId?: number;
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  simplifiedTree: string;
  textExcerpt: string;
  /** obmc-deep-read-20261107 — full visible text (bounded) + read-progress meta for paginated reads. */
  fullText?: string;
  textTotalLength?: number;
  collapsedControls?: number;
  /** obmc-shadow-pierce-20261107 — whether shadow-root text was appended; expand-pass debug trail. */
  hasShadowText?: boolean;
  expandLog?: string[];
  scrollPosition: { x: number; y: number; maxScrollY: number };
  timestamp: number;
}

export interface BrowserCommand {
  navigationId?: number;
  url?: string;
  id: string;
  tabId?: string;
  type:
    | 'navigate'
    | 'open_tab'
    | 'close_tab'
    | 'switch_tab'
    | 'click'
    | 'type'
    | 'hover'
    | 'drag'
    | 'press_key'
    | 'select_option'
    | 'wait_for'
    | 'extract_content'
    | 'extract_css'
    | 'fill_form'
    | 'scroll'
    | 'screenshot'
    | 'evaluate'
    | 'history';
  params: Record<string, any>;
  timestamp: number;
}

export interface BrowserCommandResult {
  commandId: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs?: number;
}

export interface McpToolParamSchema {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, any>;
  required?: string[];
  items?: any;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, McpToolParamSchema>;
    required?: string[];
  };
}

export interface McpLogItem {
  id: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  method: string;
  data: any;
  status?: 'success' | 'error' | 'pending';
}

export interface AgentStep {
  stepNumber: number;
  thought?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  toolResult?: {
    success: boolean;
    output: any;
  };
  finalAnswer?: string;
  timestamp: number;
}

export interface AgentState {
  isRunning: boolean;
  /** obmc-human-assist-20261107 — waiting_user: agent paused for a human action in the pane (login QR, trusted click), resumes via /api/agent/resume. */
  status: 'idle' | 'running' | 'paused' | 'waiting_user' | 'completed' | 'error';
  task: string;
  steps: AgentStep[];
  error?: string;
  waitingReason?: string;
  currentStepIndex: number;
}

export interface VisualActionIndicator {
  type: 'mouse' | 'click' | 'type' | 'hover' | 'drag' | 'scroll' | 'screenshot' | 'key';
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  direction?: string;
  timestamp: number;
}

export interface ConsoleLogEntry {
  id: string;
  tabId: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface NetworkLogEntry {
  id: string;
  tabId: string;
  url: string;
  method: string;
  status: number;
  durationMs: number;
  type: string;
  timestamp: number;
}

export interface ScreenshotItem {
  id: string;
  tabId: string;
  title: string;
  url: string;
  dataUrl: string;
  timestamp: number;
}
