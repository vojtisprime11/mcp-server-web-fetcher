/**
 * Server factory. Kept transport-agnostic so the same instance can be driven by
 * stdio (see `src/index.ts`), an HTTP transport, or an in-memory pair in tests.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './lib/config.js';
import { registerAllTools, type ToolDeps } from './tools/index.js';

export interface CreateServerOptions extends ToolDeps {
  name?: string;
  version?: string;
}

const INSTRUCTIONS = [
  'Read-only web fetching tools.',
  '',
  'Pick the cheapest tool for the job:',
  '- `extract_metadata` when you only need to know what a page is about (title, description, OG tags, outline).',
  '- `fetch_page_markdown` when you need the page text. Prefer `mainContentOnly: true` and page through',
  '  long documents using `startIndex: nextStartIndex` instead of raising `maxLength`.',
  '- `extract_links` when you need to navigate or audit a site.',
  '',
  'All tools take an absolute http(s) URL. Failures come back as tool errors with a stable',
  '`code` (for example TIMEOUT, HTTP_ERROR, BLOCKED_HOST) plus a recovery hint.',
].join('\n');

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: options.name ?? PACKAGE_NAME,
      version: options.version ?? PACKAGE_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
    },
  );

  registerAllTools(server, {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.cache ? { cache: options.cache } : {}),
  });

  return server;
}

export { PACKAGE_NAME, PACKAGE_VERSION } from './lib/config.js';
export { loadConfig, type ServerConfig } from './lib/config.js';
export { WebFetcherError, type ErrorCode } from './lib/errors.js';
export * from './tools/index.js';
export * from './types.js';
