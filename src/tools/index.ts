import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerExtractLinks } from './extractLinks.js';
import { registerExtractMetadata } from './extractMetadata.js';
import { registerFetchPageMarkdown } from './fetchPageMarkdown.js';
import type { ToolDeps } from './shared.js';

export { registerExtractLinks, registerExtractMetadata, registerFetchPageMarkdown };
export { runExtractLinks, type ExtractLinksResult } from './extractLinks.js';
export { runExtractMetadata, type ExtractMetadataResult } from './extractMetadata.js';
export { runFetchPageMarkdown, type FetchPageMarkdownResult } from './fetchPageMarkdown.js';
export type { ToolDeps } from './shared.js';

/** Names of every tool this server exposes, in registration order. */
export const TOOL_NAMES = ['fetch_page_markdown', 'extract_metadata', 'extract_links'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Registers all tools on an existing server instance. */
export function registerAllTools(server: McpServer, deps: ToolDeps = {}): void {
  registerFetchPageMarkdown(server, deps);
  registerExtractMetadata(server, deps);
  registerExtractLinks(server, deps);
}
