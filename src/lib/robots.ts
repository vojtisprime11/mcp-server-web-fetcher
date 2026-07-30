/**
 * Opt-in robots.txt support (`WEB_FETCHER_RESPECT_ROBOTS=true`).
 *
 * Implements the subset of RFC 9309 that matters for a read-only fetcher:
 * user-agent group selection, Allow/Disallow with `*` and `$` wildcards and
 * longest-match-wins precedence.
 */

import { TtlCache } from './cache.js';
import { loadConfig, type ServerConfig } from './config.js';

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsFile {
  rules: RobotsRule[];
}

const robotsCache = new TtlCache<RobotsFile>(600_000, 100);

export function clearRobotsCache(): void {
  robotsCache.clear();
}

/** Parses robots.txt, keeping the rule group that applies to `userAgent`. */
export function parseRobots(text: string, userAgent: string): RobotsFile {
  const token = userAgent.split('/')[0]?.toLowerCase() ?? '*';
  const groups = new Map<string, RobotsRule[]>();
  let currentAgents: string[] = [];
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line === '') continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!expectingAgents) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      expectingAgents = true;
      for (const agent of currentAgents) if (!groups.has(agent)) groups.set(agent, []);
      continue;
    }

    if (field !== 'allow' && field !== 'disallow') continue;
    expectingAgents = false;
    if (currentAgents.length === 0) continue;
    for (const agent of currentAgents) {
      groups.get(agent)?.push({ allow: field === 'allow', pattern: value });
    }
  }

  const exact = [...groups.entries()].find(([agent]) => agent !== '*' && token.includes(agent));
  return { rules: exact?.[1] ?? groups.get('*') ?? [] };
}

/** Evaluates a parsed robots.txt against a path. Longest matching rule wins. */
export function isPathAllowed(robots: RobotsFile, path: string): boolean {
  let best: { length: number; allow: boolean } | undefined;

  for (const rule of robots.rules) {
    if (rule.pattern === '') {
      // "Disallow:" with an empty value means "allow everything".
      if (!rule.allow) continue;
    }
    if (!matchesPattern(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow };
    }
  }

  return best?.allow ?? true;
}

function matchesPattern(pattern: string, path: string): boolean {
  if (pattern === '') return false;
  const anchoredEnd = pattern.endsWith('$');
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}${anchoredEnd ? '$' : ''}`);
  return regex.test(path);
}

/** Fetches and caches robots.txt for the URL's origin, then evaluates the path. */
export async function isRobotsAllowed(
  url: URL,
  options: { config?: ServerConfig; fetchImpl?: typeof globalThis.fetch } = {},
): Promise<boolean> {
  const config = options.config ?? loadConfig();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const robotsUrl = new URL('/robots.txt', url.origin).toString();

  let robots = robotsCache.get(robotsUrl);
  if (!robots) {
    try {
      const response = await fetchImpl(robotsUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': config.userAgent, accept: 'text/plain,*/*;q=0.5' },
        signal: AbortSignal.timeout(Math.min(config.defaultTimeoutMs, 10_000)),
      });
      // Missing or server-error robots.txt is treated as "allow all", per RFC 9309.
      robots = response.ok ? parseRobots(await response.text(), config.userAgent) : { rules: [] };
    } catch {
      robots = { rules: [] };
    }
    robotsCache.set(robotsUrl, robots);
  }

  return isPathAllowed(robots, `${url.pathname}${url.search}`);
}
