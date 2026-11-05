/** Domain allow/block lists — agent-browser --allowed-domains + action policy lite. */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().replace(/^\*\./, '.');
  if (pattern.startsWith('*.')) {
    return h === pattern.slice(2).toLowerCase() || h.endsWith(p);
  }
  return h === p || h.endsWith('.' + p);
}

export function assertDomainAllowed(
  urlStr: string,
  allowed: string[],
  blocked: string[]
): void {
  let host: string;
  try {
    host = new URL(urlStr).hostname;
  } catch {
    throw new Error(`Invalid URL for domain policy: ${urlStr}`);
  }
  if (blocked.some((b) => hostMatches(host, b))) {
    throw new Error(`Domain blocked by OBMC_BLOCKED_DOMAINS: ${host}`);
  }
  if (allowed.length && !allowed.some((a) => hostMatches(host, a))) {
    throw new Error(
      `Domain not in OBMC_ALLOWED_DOMAINS allowlist: ${host}. Allowed: ${allowed.join(', ')}`
    );
  }
}
