/** obmc-challenge-detect-20261107 — observations are evidence, not task completion. */
import type { BrowserTab, DomSnapshot } from './browser-types.js';
import { urlsEquivalent } from './browser-session.js';

export type ChallengeState = 'fetch_error' | 'unusual_traffic' | 'login_wall' | 'qr_app_login' |
  'slider_or_puzzle' | 'cross_origin_iframe' | 'empty_or_not_ready' | 'cors_error' |
  'stale_or_disconnected' | 'wrong_site_or_locale' | 'session_unavailable' | 'ok';
export type AgentOutcome = 'completed' | 'blocked' | 'needs_user' | 'failed';
export interface DocumentIdentity { tabId: string; url: string; navigationId: number }
export function matchesDocument(tab: BrowserTab, observation?: Partial<DocumentIdentity>): boolean {
  return !!observation && observation.tabId === tab.id &&
    observation.navigationId === (tab.navigationId ?? 0) &&
    typeof observation.url === 'string' && urlsEquivalent(tab.url, observation.url);
}
export function classifyChallenge(tab: BrowserTab, snapshot?: DomSnapshot) {
  const base = { tabId: tab.id, url: tab.url, navigationId: tab.navigationId ?? 0 };
  if (!matchesDocument(tab, snapshot)) return { ...base, state: 'stale_or_disconnected' as ChallengeState, evidence: 'No current-document observation' };
  // Use rendered text, never URL keywords or hidden script/HTML content.
  const text = (snapshot!.textExcerpt || '').trim();
  const rules: [ChallengeState, RegExp][] = [
    ['fetch_error', /fetch failed|failed to fetch|Không thể kết nối tới trang web|ERR_CONNECTION/i],
    // obmc-mic-search-20261107: branded "no result / 404" pages (e.g. Made-in-China) are not login walls.
    ['empty_or_not_ready', /(?:the )?information you are looking for is (?:not|no longer|currently not) available|information you are looking for is not available currently|page you are looking for (?:is not available|does not exist|cannot be found)/i],
    ['cors_error', /CORS (?:error|policy)|blocked by cross-origin policy/i],
    ['unusual_traffic', /unusual traffic|异常流量|访问过于频繁/i],
    ['session_unavailable', /session (?:unavailable|expired)|会话已过期/i],
    ['qr_app_login', /(?:scan|quét|扫码).{0,80}(?:QR|app|应用).{0,80}(?:sign.?in|log.?in|đăng nhập|登录)|扫码登录/i],
    ['login_wall', /亲，请登录|请先登录|(?:phone|mobile).{0,80}password.{0,80}(?:log.?in|sign.?in|please try again)|(?:log.?in|sign.?in).{0,80}(?:required|to continue)|登录后/i],
    ['slider_or_puzzle', /(?:drag|slide|拖动|滑动).{0,60}(?:slider|puzzle|滑块|拼图)|complete the puzzle/i],
    ['cross_origin_iframe', /cross-origin iframe.{0,60}(?:denied|blocked|inaccessible)/i],
    ['wrong_site_or_locale', /wrong (?:site|locale)|not available in your (?:region|country)/i],
  ];
  for (const [state, pattern] of rules) {
    const match = text.match(pattern);
    if (state === 'login_wall' && !/(?:required|to continue|请先登录|登录后)/i.test(text) &&
      !/(?:phone|mobile|手机号).{0,80}(?:password|密码)|(?:password|密码).{0,80}(?:phone|mobile|手机号)/i.test(text) &&
      !snapshot!.interactiveElements.some(el => el.type === 'password')) continue;
    if (state === 'slider_or_puzzle'  && !snapshot!.interactiveElements.some(el =>
      el.type === 'range' || /slider|puzzle|captcha|nc_.*(?:n1z|scale)|滑块|拼图/i.test(`${el.id || ''} ${el.selector || ''} ${el.ariaLabel || ''}`))) continue;
    if (match) return { ...base, state, evidence: text.slice(Math.max(0, match.index! - 40), match.index! + match[0].length + 100).slice(0, 240) };
  }
  return { ...base, state: (text ? 'ok' : 'empty_or_not_ready') as ChallengeState, evidence: text.slice(0, 240) || 'Empty visible extract; no listing evidence' };
}
/** Necessary freshness gate only: ok is not proof the requested task was achieved. */
export function finalAnswerGate(tab: BrowserTab, snapshot?: DomSnapshot) {
  const challenge = classifyChallenge(tab, snapshot);
  const outcome: AgentOutcome = challenge.state === 'ok' ? 'completed' :
    ['login_wall', 'qr_app_login', 'slider_or_puzzle'].includes(challenge.state) ? 'needs_user' :
    challenge.state === 'stale_or_disconnected' ? 'failed' : 'blocked';
  return { outcome, challenge };
}
export function iframeCommandError(type: string): string | undefined {
  return ['click', 'type', 'scroll'].includes(type) ? undefined :
    `Unsupported external iframe command: ${type}; not executed`;
}

/** A model's lack of a tool call is not a completion signal. */
export function validateFinalAnswer(tab: BrowserTab, snapshot: DomSnapshot | undefined, text: string, lastToolFailed = false) {
  const gate = finalAnswerGate(tab, snapshot);
  const context = `URL: ${tab.url}\nTrạng thái: ${gate.challenge.state}\nBằng chứng: ${gate.challenge.evidence}`;
  if (gate.outcome !== 'completed') return { ...gate, answer: `Chưa hoàn thành; không có dữ liệu đã xác minh để báo giá.\n${context}` };
  let proposal: any;
  try { proposal = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { /* fail closed */ }
  const visible = `${snapshot?.textExcerpt || ''}\n${snapshot?.simplifiedTree || ''}`;
  const grounded = typeof proposal?.evidence === 'string' && proposal.evidence.trim().length >= 8 && visible.includes(proposal.evidence.trim());
  const outcome: AgentOutcome = proposal?.outcome === 'completed' && grounded && !lastToolFailed && typeof proposal?.answer === 'string' && proposal.answer.trim()
    ? 'completed' : proposal?.outcome === 'needs_user' ? 'needs_user' : proposal?.outcome === 'blocked' ? 'blocked' : 'failed';
  return { ...gate, outcome, answer: outcome === 'completed' ? `${proposal.answer}\n${context}` : `Chưa xác minh được việc hoàn thành mục tiêu.\n${context}` };
}
