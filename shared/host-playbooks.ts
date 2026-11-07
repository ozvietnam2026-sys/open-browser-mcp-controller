/** obmc-host-playbooks-20261107 — per-site search URL shapes + wall notes for the agent.
 * Sourced from the team's live-observed site-skill pack (kho trường hợp site):
 * every entry is evidence from real browsing sessions, not guesses. Playbooks are
 * injected into the Gemini system prompt so the model stops inventing search URLs
 * (the Google-first detour) and classifies walls by the right site's rules. */

export interface HostPlaybook {
  id: string;
  hosts: string[];            // hostname suffixes this playbook covers
  searchUrl: (query: string) => string;  // canonical search URL for a keyword
  notes: string;              // wall/quirk notes in Vietnamese for the prompt
}

export const HOST_PLAYBOOKS: HostPlaybook[] = [
  {
    id: 'made-in-china',
    hosts: ['made-in-china.com'],
    searchUrl: (q) => `https://www.made-in-china.com/productdirectory.do?word=${encodeURIComponent(q.trim()).replace(/%20/g, '+')}&subaction=hunt`,
    notes: 'Thay thế: products-search/hot-china-products/{Title_Case}.html. KHÔNG dùng /multi-search/ có "+" (404). Trang "The information you are looking for is not available currently" = URL sai (empty_or_not_ready), KHÔNG phải tường đăng nhập.',
  },
  {
    id: 'taobao',
    hosts: ['taobao.com'],
    searchUrl: (q) => `https://s.taobao.com/search?q=${encodeURIComponent(q.trim())}`,
    notes: 'Tìm bằng từ khóa tiếng Trung khi có thể. Overlay "亲，请登录" / "Please try again" kèm số điện thoại/mật khẩu = login_wall → needs_user; QR chỉ là qr_app_login khi lời nhắc rõ "quét QR/app để đăng nhập". Extract báo OK nhưng không có listing → vẫn là login_wall/empty_or_not_ready, không bịa giá.',
  },
  {
    id: '1688',
    hosts: ['1688.com'],
    searchUrl: (q) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q.trim()).replace(/%20/g, '+')}`,
    notes: '"We have detected unusual traffic from your network" = unusual_traffic (mạng/IP), không phải captcha kéo. Mã QR góp ý/phản hồi trên tường đó KHÔNG phải QR đăng nhập. Tường này không có thanh trượt — đừng nhận đã xử lý slider.',
  },
  {
    id: 'jd',
    hosts: ['jd.com'],
    searchUrl: (q) => `https://search.jd.com/Search?keyword=${encodeURIComponent(q.trim()).replace(/%20/g, '+')}&enc=utf-8`,
    notes: 'CẢNH BÁO: https://www.jd.com có thể mở trang công ty EN (About/Investors) — wrong_site_or_locale, không phải sàn. Muốn tìm hàng phải vào mặt sàn (search.jd.com). Không kết luận "JD không có hàng" khi đang đứng ở trang corporate.',
  },
  {
    id: 'aliexpress',
    hosts: ['aliexpress.com'],
    searchUrl: (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q.trim())}`,
    notes: 'Qua proxy hay gặp fetch_error ("Không thể kết nối tới trang web") — thử lại cùng URL, KHÔNG nhảy sang trang demo nội bộ để lấy giá thay thế, không bịa listing.',
  },
];

export function playbookForHost(hostname: string): HostPlaybook | undefined {
  const host = (hostname || '').toLowerCase().replace(/^www\./, '');
  return HOST_PLAYBOOKS.find((p) => p.hosts.some((h) => host === h || host.endsWith('.' + h)));
}

/** Compact one-line-per-site fallback so the model knows the URL shapes even before navigating. */
export function playbookCheatSheet(): string {
  return HOST_PLAYBOOKS
    .map((p) => `- ${p.id}: ${p.searchUrl('TỪ_KHÓA')}`)
    .join('\n');
}
