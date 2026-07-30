/**
 * Runtime configuration, resolved from environment variables.
 *
 * Every value has a safe default, so the server runs with zero configuration.
 */

export interface ServerConfig {
  /** User-Agent header sent with every request. */
  userAgent: string;
  /** Default request timeout in milliseconds. */
  defaultTimeoutMs: number;
  /** Hard cap on downloaded bytes per response. */
  maxBytes: number;
  /** Maximum number of redirects followed per request. */
  maxRedirects: number;
  /** Block requests to loopback / private / link-local addresses (SSRF guard). */
  blockPrivateHosts: boolean;
  /** Check robots.txt before fetching. Opt-in. */
  respectRobots: boolean;
  /** Time-to-live of the in-memory response cache, in milliseconds. 0 disables it. */
  cacheTtlMs: number;
  /** Maximum number of cached responses. */
  cacheMaxEntries: number;
}

export const PACKAGE_NAME = 'mcp-server-web-fetcher';
export const PACKAGE_VERSION = '0.1.0';

const DEFAULT_USER_AGENT = `${PACKAGE_NAME}/${PACKAGE_VERSION} (+https://github.com/vojtisprime11/mcp-server-web-fetcher)`;

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    userAgent: env.WEB_FETCHER_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    defaultTimeoutMs: num(env.WEB_FETCHER_TIMEOUT_MS, 15_000, 1_000, 120_000),
    maxBytes: num(env.WEB_FETCHER_MAX_BYTES, 5_000_000, 10_000, 50_000_000),
    maxRedirects: num(env.WEB_FETCHER_MAX_REDIRECTS, 5, 0, 20),
    blockPrivateHosts: !bool(env.WEB_FETCHER_ALLOW_PRIVATE_HOSTS, false),
    respectRobots: bool(env.WEB_FETCHER_RESPECT_ROBOTS, false),
    cacheTtlMs: num(env.WEB_FETCHER_CACHE_TTL_MS, 60_000, 0, 3_600_000),
    cacheMaxEntries: num(env.WEB_FETCHER_CACHE_MAX_ENTRIES, 50, 0, 1_000),
  };
}
