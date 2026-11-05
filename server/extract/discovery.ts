import { fetchUrl, assertHttpUrl } from './http-fetch.js';

export async function fetchRobotsTxt(siteUrl: string) {
  const u = assertHttpUrl(siteUrl);
  const robotsUrl = `${u.origin}/robots.txt`;
  const res = await fetchUrl(robotsUrl, { timeoutMs: 10000, maxBytes: 200_000 });
  const sitemaps: string[] = [];
  const disallows: string[] = [];
  const allows: string[] = [];
  let userAgent = '*';

  for (const line of res.bodyText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...rest] = trimmed.split(':');
    const key = (k || '').toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') userAgent = value;
    else if (key === 'disallow' && value) disallows.push(value);
    else if (key === 'allow' && value) allows.push(value);
    else if (key === 'sitemap' && value) sitemaps.push(value);
  }

  return {
    robotsUrl,
    status: res.status,
    userAgentSeen: userAgent,
    sitemaps,
    allows: allows.slice(0, 200),
    disallows: disallows.slice(0, 200),
    rawPreview: res.bodyText.slice(0, 4000),
  };
}

export async function fetchSitemap(sitemapUrl: string, limit = 100) {
  const res = await fetchUrl(sitemapUrl, { timeoutMs: 15000, maxBytes: 2_000_000 });
  const urls: string[] = [];
  const locRegex = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(res.bodyText)) && urls.length < limit) {
    urls.push(m[1].trim());
  }
  const isIndex = /<sitemapindex/i.test(res.bodyText);
  return {
    sitemapUrl,
    status: res.status,
    isIndex,
    urlCount: urls.length,
    urls,
    contentType: res.contentType,
  };
}

export async function discoverSite(siteUrl: string, sitemapLimit = 50) {
  const robots = await fetchRobotsTxt(siteUrl);
  const sitemapResults = [];
  const candidates = robots.sitemaps.length
    ? robots.sitemaps.slice(0, 3)
    : [`${assertHttpUrl(siteUrl).origin}/sitemap.xml`];

  for (const sm of candidates) {
    try {
      sitemapResults.push(await fetchSitemap(sm, sitemapLimit));
    } catch (err: any) {
      sitemapResults.push({ sitemapUrl: sm, error: err?.message || String(err) });
    }
  }

  return { robots, sitemaps: sitemapResults };
}
