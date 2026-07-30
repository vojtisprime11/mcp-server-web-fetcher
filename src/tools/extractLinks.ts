/** `extract_links` — every link on the page, split into internal and external. */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { documentBaseUrl, loadHtml, readLinks, type PageLink } from '../lib/html.js';
import { fetchDocument } from '../lib/http.js';
import {
  extractLinksInputSchema,
  extractLinksInputShape,
  extractLinksOutputShape,
  type ExtractLinksInput,
} from '../types.js';
import { asJsonText, toolError, toolResult, type ToolDeps } from './shared.js';

export interface ExtractLinksResult {
  url: string;
  requestedUrl: string;
  status: number;
  totalFound: number;
  returned: number;
  internalCount: number;
  externalCount: number;
  truncated: boolean;
  links: PageLink[];
  fromCache: boolean;
}

const DESCRIPTION = [
  'List the links on a web page as absolute URLs, each flagged as internal',
  '(same site) or external, with anchor text, title, rel and nofollow status.',
  'Supports scope filtering, de-duplication and a result limit — useful for',
  'crawling a documentation tree, auditing outbound links or finding next pages.',
].join(' ');

export async function runExtractLinks(
  rawInput: unknown,
  deps: ToolDeps = {},
): Promise<ExtractLinksResult> {
  const input: ExtractLinksInput = extractLinksInputSchema.parse(rawInput);

  const document = await fetchDocument(input.url, {
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.cache ? { cache: deps.cache } : {}),
  });

  const $ = loadHtml(document.body);
  const baseUrl = documentBaseUrl($, document.url);

  const allMatching = readLinks($, baseUrl, {
    scope: input.scope,
    includeAnchors: input.includeAnchors,
    deduplicate: input.deduplicate,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const links = allMatching.slice(0, input.limit);

  return {
    url: document.url,
    requestedUrl: document.requestedUrl,
    status: document.status,
    totalFound: allMatching.length,
    returned: links.length,
    internalCount: links.filter((link) => link.internal).length,
    externalCount: links.filter((link) => !link.internal).length,
    truncated: allMatching.length > links.length,
    links,
    fromCache: document.fromCache,
  };
}

export function registerExtractLinks(server: McpServer, deps: ToolDeps = {}): void {
  server.registerTool(
    'extract_links',
    {
      title: 'Extract page links',
      description: DESCRIPTION,
      inputSchema: extractLinksInputShape,
      outputSchema: extractLinksOutputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await runExtractLinks(args, deps);
        return toolResult(asJsonText(result), { ...result });
      } catch (error) {
        return toolError(error, typeof args?.url === 'string' ? args.url : undefined);
      }
    },
  );
}
