/**
 * Singleton Browser SSE Client Manager
 * Enforces a single EventSource connection across the entire application with
 * exponential backoff, connection state tracking, and unified event subscription.
 */

type EventHandler = (data: any) => void;

class SseClientManager {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount: number = 0;
  private isExplicitlyClosed: boolean = false;
  private isConnecting: boolean = false;

  constructor() {
    // Only connect in browser environment
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public connect() {
    if (this.eventSource || this.isConnecting || this.isExplicitlyClosed) {
      return;
    }

    this.isConnecting = true;

    try {
      this.eventSource = new EventSource('/api/browser/events');

      this.eventSource.onopen = () => {
        this.isConnecting = false;
        this.retryCount = 0;
      };

      const knownEvents = [
        'init',
        'tabs_updated',
        'tab_switched',
        'tab_navigated',
        'visual_action',
        'execute_command',
        'dom_updated',
        'screenshot_captured',
        'console_log',
        'network_log',
        'mcp_log',
      ];

      knownEvents.forEach((eventName) => {
        this.eventSource?.addEventListener(eventName, (e: MessageEvent) => {
          this.retryCount = 0;
          try {
            const parsed = JSON.parse(e.data);
            this.emit(eventName, parsed);
          } catch (err) {
            this.emit(eventName, e.data);
          }
        });
      });

      this.eventSource.onerror = () => {
        this.isConnecting = false;
        this.closeCurrent();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.isConnecting = false;
      this.closeCurrent();
      this.scheduleReconnect();
    }
  }

  private closeCurrent() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;

    // Exponential backoff: 2s, 4s, 8s, 16s, up to max 30s
    this.retryCount = Math.min(this.retryCount + 1, 5);
    const delay = Math.min(2000 * Math.pow(2, this.retryCount - 1), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public subscribe(eventName: string, handler: EventHandler): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(handler);

    if (!this.eventSource && !this.isConnecting && !this.reconnectTimer) {
      this.connect();
    }

    return () => {
      const set = this.listeners.get(eventName);
      if (set) {
        set.delete(handler);
      }
    };
  }

  private emit(eventName: string, data: any) {
    const set = this.listeners.get(eventName);
    if (set) {
      set.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in SSE listener for ${eventName}:`, err);
        }
      });
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeCurrent();
  }
}

export const sseClient = new SseClientManager();
