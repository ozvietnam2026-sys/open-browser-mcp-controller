/**
 * Pure helpers for browser tab session persistence / SSE reconciliation.
 * Kept free of React / Node APIs so unit tests can import them directly.
 */

export interface SessionTabLike {
  id?: string;
  url?: string;
  history?: string[];
}

/** True when the server just woke with the stock AeroSearch home tab. */
export function isFreshDefaultSession(tabs: SessionTabLike[] | undefined): boolean {
  if (!tabs || tabs.length !== 1) return false;
  const url = (tabs[0].url || '').toLowerCase();
  const history = tabs[0].history || [];
  return (url === 'browser://search' || url === '') && history.length <= 1;
}

/** True when the client already holds a real user-navigated session. */
export function hasUserSession(tabs: SessionTabLike[] | undefined): boolean {
  if (!tabs || tabs.length === 0) return false;
  return tabs.some((t) => {
    const url = t.url || '';
    if (url.startsWith('http://') || url.startsWith('https://')) return true;
    if (url.startsWith('browser://search?')) return true;
    if (url.startsWith('browser://') && url !== 'browser://search') return true;
    if (t.history && t.history.length > 1) return true;
    return false;
  });
}

/** Resolve built-in demo page id — never match bare substring "store" inside real URLs. */
export function builtInPageId(
  url: string
): 'store' | 'forms' | 'news' | 'wikipedia' | 'search' {
  const raw = (url || '').trim().toLowerCase();
  if (!raw.startsWith('browser://')) {
    return 'search';
  }
  const id = raw.slice('browser://'.length).split(/[/?#]/)[0];
  if (id === 'store') return 'store';
  if (id === 'forms' || id === 'testlab') return 'forms';
  if (id === 'news' || id === 'technews') return 'news';
  if (id === 'wikipedia' || id === 'wiki') return 'wikipedia';
  return 'search';
}

/** Normalize URL for same-page comparisons (ignore trailing slash / hash noise lightly). */
export function urlsEquivalent(a: string, b: string): boolean {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (left === right) return true;
  try {
    if (left.startsWith('http') && right.startsWith('http')) {
      const ua = new URL(left);
      const ub = new URL(right);
      ua.hash = '';
      ub.hash = '';
      const sa = ua.toString().replace(/\/$/, '');
      const sb = ub.toString().replace(/\/$/, '');
      return sa === sb;
    }
  } catch {
    // fall through
  }
  return left.replace(/\/$/, '') === right.replace(/\/$/, '');
}

/** Cap JSON-ish MCP log payloads so SSE broadcasts stay small. */
export function truncateForLog(data: unknown, maxChars = 2000): unknown {
  if (data == null) return data;
  if (typeof data === 'string') {
    return data.length > maxChars ? `${data.slice(0, maxChars)}…[truncated]` : data;
  }
  try {
    const raw = JSON.stringify(data);
    if (raw.length <= maxChars) return data;
    return {
      _truncated: true,
      preview: `${raw.slice(0, maxChars)}…`,
      originalChars: raw.length,
    };
  } catch {
    return '[unserializable]';
  }
}
