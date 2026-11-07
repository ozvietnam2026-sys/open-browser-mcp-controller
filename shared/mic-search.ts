/** obmc-mic-search-20261107 — Made-in-China search URL shapes that actually return listings. */
const ORIGIN = 'https://www.made-in-china.com';
export function micProductDirectoryUrl(query: string): string {
  return `${ORIGIN}/productdirectory.do?word=${encodeURIComponent(query.trim()).replace(/%20/g, '+')}&subaction=hunt`;
}
export function micHotProductsUrl(query: string): string {
  const slug = query.trim().split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_').replace(/[^A-Za-z0-9_-]/g, '');
  return `${ORIGIN}/products-search/hot-china-products/${slug}.html`;
}
/** Known-bad shapes that 404 / show "not available currently". */
export function isBadMicSearchUrl(url: string): boolean {
  let u: URL; try { u = new URL(url); } catch { return false; }
  if (!/(^|\.)made-in-china\.com$/i.test(u.hostname)) return false;
  if (/^\/multi-search\//i.test(u.pathname) && /\+|%2B/i.test(u.pathname)) return true;
  if (/^\/productdirectory\.do$/i.test(u.pathname) && u.searchParams.has('word') && u.searchParams.get('subaction') !== 'hunt') return true;
  return false;
}
