/**
 * MCP Security & Authentication Module
 * Implements constant-time Bearer token authentication, CORS origin restrictions,
 * same-origin UI request validation, and SSRF URL verification.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Perform constant-time string comparison using SHA-256 digests
 * to prevent timing side-channel attacks regardless of input lengths.
 */
export function safeCompareTokens(providedToken: string, expectedToken: string): boolean {
  if (!providedToken || !expectedToken) return false;
  try {
    const hashProvided = crypto.createHash('sha256').update(providedToken).digest();
    const hashExpected = crypto.createHash('sha256').update(expectedToken).digest();
    return crypto.timingSafeEqual(hashProvided, hashExpected);
  } catch (err) {
    return false;
  }
}

/**
 * Check if the request is a first-party same-origin request coming from the web UI.
 */
export function isFirstPartySameOriginRequest(req: Request): boolean {
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const origin = (req.get('origin') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();
  const secFetchSite = (req.get('sec-fetch-site') || '').toLowerCase();

  // 1. Standard browser Sec-Fetch-Site header
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return true;
  }

  // 2. Origin matches current host
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost === host) return true;
    } catch (e) {}
  }

  // 3. Referer matches current host
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (refererHost === host) return true;
    } catch (e) {}
  }

  // 4. Local loopback fallback ONLY when MCP_AUTH_TOKEN is unset in non-production
  const expectedToken = process.env.MCP_AUTH_TOKEN?.trim();
  if (!expectedToken && process.env.NODE_ENV !== 'production') {
    const remoteIp = req.socket?.remoteAddress || '';
    const isLoopback =
      remoteIp === '127.0.0.1' ||
      remoteIp === '::1' ||
      remoteIp === '::ffff:127.0.0.1' ||
      remoteIp === 'localhost';

    if (isLoopback) {
      return true;
    }
  }

  return false;
}

/**
 * Check CORS allowed origin based on process.env.MCP_ALLOWED_ORIGINS
 */
export function validateCorsOrigin(req: Request, res: Response): boolean {
  const origin = req.get('origin');
  const allowedOriginsEnv = process.env.MCP_ALLOWED_ORIGINS;

  if (allowedOriginsEnv) {
    const allowedList = allowedOriginsEnv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (origin) {
      const normalizedOrigin = origin.toLowerCase();
      if (allowedList.includes(normalizedOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        return true;
      } else {
        return false;
      }
    }
  } else {
    // Default CORS behavior if MCP_ALLOWED_ORIGINS is not set
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
  return true;
}

/**
 * Express Middleware for MCP Bearer Token Authentication & Access Control
 */
export function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  // Always handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return res.sendStatus(204);
  }

  // 1. CORS Origin validation
  const isCorsAllowed = validateCorsOrigin(req, res);
  const origin = req.get('origin');
  if (origin && !isCorsAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const expectedToken = process.env.MCP_AUTH_TOKEN?.trim();

  // 2. Extract Bearer token from Authorization header
  const authHeader = req.get('authorization') || '';
  let providedToken = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.substring(7).trim();
  }

  // If token is provided, validate it strictly with constant-time comparison
  if (providedToken) {
    if (expectedToken && safeCompareTokens(providedToken, expectedToken)) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 3. No token provided: check if same-origin first-party UI request
  if (isFirstPartySameOriginRequest(req)) {
    return next();
  }

  // 4. Remote / cross-origin request without token
  if (!expectedToken) {
    // Fail-closed on hosted / production environments when MCP_AUTH_TOKEN is unset
    return res
      .status(503)
      .json({ error: 'MCP authentication is not configured on this server' });
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Validate target URL for SSRF protection (blocking localhost, private IP ranges, metadata endpoints)
 */
export function validateTargetUrlForSsrf(targetUrl: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') {
      return { valid: false, reason: 'Only http:// and https:// protocols are allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // 1. Block localhost and loopback hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, reason: 'Localhost and loopback target access is forbidden' };
    }

    // 2. Block cloud metadata endpoints
    if (
      hostname === '169.254.169.254' ||
      hostname.includes('metadata') ||
      hostname.includes('internal')
    ) {
      return { valid: false, reason: 'Cloud metadata and internal host access is forbidden' };
    }

    // 3. Block private IP ranges (IPv4)
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b, c] = ipMatch.map(Number);

      // 10.0.0.0/8
      if (a === 10) return { valid: false, reason: 'Private IP target access is forbidden (10.0.0.0/8)' };

      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31)
        return { valid: false, reason: 'Private IP target access is forbidden (172.16.0.0/12)' };

      // 192.168.0.0/16
      if (a === 192 && b === 168)
        return { valid: false, reason: 'Private IP target access is forbidden (192.168.0.0/16)' };

      // 169.254.0.0/16
      if (a === 169 && b === 254)
        return { valid: false, reason: 'Link-local IP target access is forbidden (169.254.0.0/16)' };

      // 127.0.0.0/8
      if (a === 127) return { valid: false, reason: 'Loopback IP target access is forbidden' };

      // 0.0.0.0
      if (a === 0) return { valid: false, reason: 'Zero IP target access is forbidden' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Invalid URL format' };
  }
}
