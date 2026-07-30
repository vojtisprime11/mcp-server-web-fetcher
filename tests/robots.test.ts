import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRobotsCache,
  isPathAllowed,
  isRobotsAllowed,
  parseRobots,
} from '../src/lib/robots.js';
import { fetchDocument } from '../src/lib/http.js';
import { stubFetch, testConfig } from './helpers.js';

const ROBOTS = `
# comment
User-agent: BadBot
Disallow: /

User-agent: *
Disallow: /private
Disallow: /tmp/*.json$
Allow: /private/public-page
Crawl-delay: 10
`;

describe('parseRobots / isPathAllowed', () => {
  beforeEach(() => {
    clearRobotsCache();
  });

  it('selects the wildcard group for an unknown agent', () => {
    const robots = parseRobots(ROBOTS, 'mcp-server-web-fetcher/0.1.0');

    expect(isPathAllowed(robots, '/')).toBe(true);
    expect(isPathAllowed(robots, '/private')).toBe(false);
    expect(isPathAllowed(robots, '/private/reports')).toBe(false);
  });

  it('lets a longer Allow rule win over a shorter Disallow', () => {
    const robots = parseRobots(ROBOTS, 'mcp-server-web-fetcher/0.1.0');

    expect(isPathAllowed(robots, '/private/public-page')).toBe(true);
  });

  it('supports * and $ wildcards', () => {
    const robots = parseRobots(ROBOTS, 'mcp-server-web-fetcher/0.1.0');

    expect(isPathAllowed(robots, '/tmp/data.json')).toBe(false);
    expect(isPathAllowed(robots, '/tmp/data.json?x=1')).toBe(true);
  });

  it('matches an agent-specific group by name', () => {
    const robots = parseRobots(ROBOTS, 'BadBot/2.0');

    expect(isPathAllowed(robots, '/anything')).toBe(false);
  });

  it('allows everything when robots.txt is empty or has no rules', () => {
    expect(isPathAllowed(parseRobots('', 'agent'), '/x')).toBe(true);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow:', 'agent'), '/x')).toBe(true);
  });
});

describe('isRobotsAllowed', () => {
  beforeEach(() => {
    clearRobotsCache();
  });

  it('fetches robots.txt from the origin and evaluates the path', async () => {
    const { fetchImpl } = stubFetch({
      'https://example.com/robots.txt': { body: 'User-agent: *\nDisallow: /secret' },
    });
    const config = testConfig();

    await expect(
      isRobotsAllowed(new URL('https://example.com/public'), { fetchImpl, config }),
    ).resolves.toBe(true);
    await expect(
      isRobotsAllowed(new URL('https://example.com/secret/x'), { fetchImpl, config }),
    ).resolves.toBe(false);
  });

  it('allows everything when robots.txt is missing', async () => {
    const { fetchImpl } = stubFetch({});
    await expect(
      isRobotsAllowed(new URL('https://example.com/x'), { fetchImpl, config: testConfig() }),
    ).resolves.toBe(true);
  });

  it('blocks a disallowed fetch when enforcement is enabled', async () => {
    const { fetchImpl } = stubFetch({
      'https://example.com/robots.txt': { body: 'User-agent: *\nDisallow: /secret' },
      'https://example.com/secret': { body: '<p>hidden</p>' },
    });

    await expect(
      fetchDocument('https://example.com/secret', {
        fetchImpl,
        config: testConfig({ respectRobots: true }),
      }),
    ).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' });
  });
});
